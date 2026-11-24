"use client";

import { useState } from "react";

type Prepared = { registration: ServiceWorkerRegistration; key: Uint8Array<ArrayBuffer> };
type Status = { text: string; error?: boolean };

function decodeKey(base64url: string): Uint8Array<ArrayBuffer> {
  const normalized = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  if (bytes.length !== 65 || bytes[0] !== 4) throw new Error("Invalid public key");
  return bytes;
}

function sameKey(left: ArrayBuffer | null, right: Uint8Array<ArrayBuffer>) {
  return left !== null && new Uint8Array(left).length === right.length
    && new Uint8Array(left).every((byte, index) => byte === right[index]);
}

export function ServerPushTest({ accessToken }: { accessToken: string }) {
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const route = "/api/notification-test/server-push";

  const prepare = async () => {
    if (busy) return;
    const safari = navigator as Navigator & { standalone?: boolean };
    if (!window.matchMedia("(display-mode: standalone)").matches && safari.standalone !== true) {
      setStatus({ text: "請先將這個版本加入 iPhone 主畫面，並從圖示開啟。", error: true });
      return;
    }
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setStatus({ text: "此裝置尚未提供 Web Push 功能。", error: true });
      return;
    }
    if (Notification.permission !== "granted") {
      setStatus({ text: "請先完成上方的系統通知測試並允許通知。", error: true });
      return;
    }

    setBusy(true);
    setPrepared(null);
    setStatus(null);
    try {
      const config = await fetch(route, { headers: { Authorization: "Bearer " + accessToken }, cache: "no-store" });
      if (!config.ok) throw new Error("config");
      const payload = await config.json();
      if (payload.enabled !== true || typeof payload.publicKey !== "string") {
        setStatus({ text: "此預覽尚未配置專用推播金鑰，不能發送背景通知。", error: true });
        return;
      }
      await navigator.serviceWorker.register("/notification-test-sw.js", { scope: "/notification-test" });
      const registration = await navigator.serviceWorker.ready;
      const key = decodeKey(payload.publicKey);
      const existing = await registration.pushManager.getSubscription();
      if (existing && !sameKey(existing.options.applicationServerKey, key)) {
        setStatus({ text: "此測試圖示已有不同金鑰的訂閱，請移除此測試圖示後重新加入主畫面。", error: true });
        return;
      }
      setPrepared({ registration, key });
      setSubmitted(false);
      setStatus({ text: "準備完成。點擊下一個按鈕後，等待畫面顯示請求已接受，再立即鎖屏。" });
    } catch {
      setStatus({ text: "準備失敗，請確認管理員登入及網路連線。", error: true });
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    if (!prepared || busy || submitted) return;
    setBusy(true);
    setStatus(null);
    try {
      // Invoke subscribe directly from the actual tap, not from a timer or an effect.
      const subscription = await prepared.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: prepared.key,
      });
      const response = await fetch(route, {
        method: "POST",
        headers: { Authorization: "Bearer " + accessToken, "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body.accepted !== true) {
        setStatus({ text: typeof body.error === "string" ? body.error : "推播請求未被接受。", error: true });
        return;
      }
      setSubmitted(true);
      setStatus({ text: "伺服器已接受請求，請立即鎖屏。預計約 15 秒後發送測試推播；是否收到及震動仍須實機確認。" });
    } catch {
      setStatus({ text: "訂閱或發送請求失敗，請確認通知權限與網路。", error: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-[24px] border border-[#E6EAF0] bg-white p-5">
      <h2 className="text-base font-black text-[#1F2937]">第二階段｜鎖屏推播測試</h2>
      <p className="mt-2 text-sm leading-6 text-[#7B7B74]">
        僅供管理員測試。這次由伺服器延遲發送，不是手機網頁的倒數計時。無需在測試期間維持畫面亮起。
      </p>
      <button type="button" disabled={busy} onClick={() => void prepare()}
        className="mt-4 min-h-12 w-full rounded-2xl border border-[#6D55A3]/20 bg-[#F3EEFF] px-4 py-3 text-sm font-black text-[#6D55A3] disabled:opacity-50">
        1. 準備背景推播
      </button>
      <button type="button" disabled={!prepared || busy || submitted} onClick={() => void send()}
        className="mt-2 min-h-12 w-full rounded-2xl bg-[#008A7A] px-4 py-3 text-sm font-black text-white disabled:opacity-40">
        2. 發送鎖屏測試通知
      </button>
      {status && <p role="status" aria-live="polite" className={"mt-3 text-sm font-bold leading-6 " + (status.error ? "text-[#A34843]" : "text-[#146B60]")}>{status.text}</p>}
      <p className="mt-3 text-xs leading-5 text-[#7B7B74]">僅傳固定測試通知，不會保存訂閱、加入正式任務或向其他同工發送。</p>
    </section>
  );
}
