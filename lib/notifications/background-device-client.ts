// Browser-only helpers. Never store the subscription endpoint, keys, or
// authentication token in localStorage. Only the account's explicit consent.
const ROUTE = "/api/background-reminders/device";
const WORKER = "/background-reminder-sw.js";
const CONSENT_KEY = "shekinah_background_reminder_consent_v1";
type Consent = { userId: string; enabled: boolean };
export type PreparedReminder = { registration: ServiceWorkerRegistration; publicKey: Uint8Array<ArrayBuffer> };
export type DeviceSyncStatus = { message: string; action?: "authorize" | "retry" };

let queue: Promise<unknown> = Promise.resolve();
let intentEpoch = 0;

export function nextReminderIntent() { return ++intentEpoch; }
export function currentReminderIntent(epoch: number) { return epoch === intentEpoch; }

export function isAppleMobile() {
  return typeof navigator !== "undefined" && (/iPhone|iPad|iPod/.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
}

export function isStandaloneReminderApp() {
  return typeof window !== "undefined" && (window.matchMedia("(display-mode: standalone)").matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true);
}

export function canUseBackgroundPush() {
  return typeof window !== "undefined" && window.isSecureContext
    && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export function readReminderConsent(): Consent | null {
  try {
    const raw = JSON.parse(window.localStorage.getItem(CONSENT_KEY) ?? "null");
    return raw && typeof raw.userId === "string" && typeof raw.enabled === "boolean" ? raw : null;
  } catch { return null; }
}

export function writeReminderConsent(userId: string, enabled: boolean) {
  try {
    window.localStorage.setItem(CONSENT_KEY, JSON.stringify({ userId, enabled }));
    return true;
  } catch { return false; }
}

export function hasReminderConsent(userId: string) {
  const consent = readReminderConsent();
  return consent?.userId === userId && consent.enabled;
}

function clearReminderConsent() {
  try { window.localStorage.removeItem(CONSENT_KEY); } catch { /* best effort */ }
}

function serial<T>(job: () => Promise<T>): Promise<T> {
  // Browser-wide lock where available; also serialize operations in this page.
  const run = () => typeof navigator !== "undefined" && navigator.locks
    ? navigator.locks.request("shekinah-background-reminder-device", job)
    : job();
  const result = queue.then(run, run);
  queue = result.then(() => undefined, () => undefined);
  return result;
}

function ourWorker(registration: ServiceWorkerRegistration | undefined) {
  if (!registration) return false;
  return [registration.active, registration.waiting, registration.installing].some(worker => {
    if (!worker) return false;
    const url = new URL(worker.scriptURL);
    return url.origin === location.origin && url.pathname === WORKER;
  });
}

async function existingRegistration() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  const registration = await navigator.serviceWorker.getRegistration("/");
  return registration && ourWorker(registration) ? registration : null;
}

function decodePublicKey(key: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]{87}$/.test(key)) throw new Error("Invalid key");
  const data = atob(key.replace(/-/g, "+").replace(/_/g, "/") + "=");
  const result = Uint8Array.from(data, c => c.charCodeAt(0));
  if (result.length !== 65 || result[0] !== 4) throw new Error("Invalid key");
  return result;
}

async function fetchDevice(accessToken: string, body?: object): Promise<Response> {
  return fetch(ROUTE, {
    method: body ? "POST" : "GET",
    headers: { Authorization: "Bearer " + accessToken, ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: "no-store", signal: AbortSignal.timeout(8_000),
  });
}

export async function getBackgroundDeviceConfig(accessToken: string): Promise<string | null> {
  const response = await fetchDevice(accessToken);
  if (!response.ok) throw new Error("Config unavailable");
  const data = await response.json();
  return data.enabled === true && typeof data.publicKey === "string" ? data.publicKey : null;
}

async function unsubscribe(subscription: PushSubscription) {
  try { return await subscription.unsubscribe(); } catch { return false; }
}

export async function prepareBackgroundDevice(publicKey: string, userId: string): Promise<PreparedReminder> {
  const key = decodePublicKey(publicKey);
  const before = await navigator.serviceWorker.getRegistration("/");
  // Never replace an unrelated service worker.
  if (before && !ourWorker(before)) throw new Error("Existing worker");
  await navigator.serviceWorker.register(WORKER, { scope: "/" });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const registration = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Worker not ready")), 10_000); }),
  ]).finally(() => { if (timer) clearTimeout(timer); });
  if (!ourWorker(registration)) throw new Error("Unexpected worker");
  const current = await registration.pushManager.getSubscription();
  const consent = readReminderConsent();
  // Shared or switched accounts must never reuse a previous owner's subscription.
  if (current && consent?.userId !== userId) {
    if (!await unsubscribe(current)) throw new Error("Previous subscription cannot be removed");
  }
  return { registration, publicKey: key };
}

/** Must be called directly from the actual switch or authorization button.
 * Do not put an await, timer, effect, or network config fetch ahead of subscribe.
 */
export function subscribeFromGesture(prepared: PreparedReminder) {
  return prepared.registration.pushManager.subscribe({
    userVisibleOnly: true, applicationServerKey: prepared.publicKey,
  });
}

export async function revokeBackgroundDevice(accessToken: string): Promise<boolean> {
  return serial(async () => {
    try {
      const registration = await existingRegistration();
      const sub = await registration?.pushManager.getSubscription();
      if (!sub) return true;
      // Revoke both the server-side binding and the browser subscription.
      // Either confirmed operation prevents future sends to this subscription.
      const [server, local] = await Promise.all([
        fetchDevice(accessToken, { action: "disable", endpoint: sub.endpoint })
          .then(response => response.ok).catch(() => false),
        unsubscribe(sub),
      ]);
      return server || local;
    } catch { return false; }
  });
}

export async function stopBackgroundRemindersOnSignOut(accessToken: string | undefined) {
  nextReminderIntent();
  const consent = readReminderConsent();
  clearReminderConsent();
  if (!consent && !isAppleMobile()) return true;
  if (!accessToken) return false;
  // Do not make the original sign-out flow wait indefinitely for a browser
  // worker or Web Lock. Successful Auth sign-out separately invalidates the
  // server-side session binding even when local revocation times out.
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    revokeBackgroundDevice(accessToken),
    new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), 8_000); }),
  ]).finally(() => { if (timer) clearTimeout(timer); });
}

export async function syncBackgroundDevice(input: {
  prepared: PreparedReminder; accessToken: string; userId: string;
  enabled: boolean; serviceType: string; checkInId: string; isCurrent?: () => boolean;
}): Promise<DeviceSyncStatus> {
  if (!input.enabled) {
    const stopped = await revokeBackgroundDevice(input.accessToken);
    return stopped ? { message: "背景震動提醒已關閉。" }
      : { message: "尚未確認停止背景提醒，請重新連線後重試；也可在 iPhone 設定關閉通知。", action: "retry" };
  }

  return serial(async () => {
    if (input.isCurrent && !input.isCurrent()) return { message: "背景提醒同步中…" };
    if (Notification.permission === "denied") {
      return { message: "請在 iPhone「設定 → 通知」允許招待服事系統的通知。", action: "retry" };
    }
    if (!hasReminderConsent(input.userId)) {
      return { message: "允許系統通知後，鎖屏也能收到任務震動提醒。", action: "authorize" };
    }
    const sub = await input.prepared.registration.pushManager.getSubscription();
    if (!sub || Notification.permission !== "granted") {
      return { message: "請重新啟用背景通知。", action: "authorize" };
    }
    if (!input.serviceType || !input.checkInId) {
      return { message: "已允許通知，完成報到後啟用背景提醒。" };
    }
    // The server derives check-in and assignment; these IDs are only local
    // guards against previewing a hall or testing without a formal check-in.
    if (input.isCurrent && !input.isCurrent()) return { message: "背景提醒同步中…" };
    if (!hasReminderConsent(input.userId)) return { message: "背景震動提醒已關閉。" };
    const response = await fetchDevice(input.accessToken, {
      action: "register", serviceType: input.serviceType, subscription: sub.toJSON(),
    });
    if (response.status === 409) {
      return { message: "目前沒有可啟用的有效報到，請確認堂次及服事時間。", action: "retry" };
    }
    if (!response.ok) throw new Error("Device registration unavailable");
    const data = await response.json();
    if (data.enabled !== true) throw new Error("Device registration incomplete");
    const expires = Date.parse(data.expiresAt);
    if (!Number.isFinite(expires) || expires <= Date.now()) return { message: "本堂背景提醒已結束。" };
    return { message: "背景提醒已啟用，鎖屏時也會收到系統通知。震動依 iPhone 設定。" };
  });
}
