"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  isAppleMobile, isStandaloneReminderApp, canUseBackgroundPush,
  getBackgroundDeviceConfig, prepareBackgroundDevice, subscribeFromGesture,
  readReminderConsent, writeReminderConsent, nextReminderIntent, currentReminderIntent,
  revokeBackgroundDevice, syncBackgroundDevice,
  type PreparedReminder, type DeviceSyncStatus,
} from "@/lib/notifications/background-device-client";

type Input = {
  accessToken: string; userId: string; loaded: boolean; enabled: boolean;
  serviceType: string; checkInId: string;
};

export function useBackgroundReminders({ accessToken, userId, loaded, enabled, serviceType, checkInId }: Input) {
  const [featureEnabled, setFeatureEnabled] = useState(false);
  const [prepared, setPrepared] = useState<PreparedReminder | null>(null);
  const [status, setStatus] = useState<DeviceSyncStatus | null>(null);
  const [revision, setRevision] = useState(0);
  const authorizationPending = useRef(false);
  const refresh = useCallback(() => setRevision(value => value + 1), []);

  useEffect(() => {
    if (!isAppleMobile()) return;
    let disposed = false;
    async function prepare() {
      try {
        const key = await getBackgroundDeviceConfig(accessToken);
        if (disposed) return;
        setFeatureEnabled(Boolean(key));
        if (!key) { setPrepared(null); setStatus(null); return; }
        if (!isStandaloneReminderApp() || !canUseBackgroundPush()) {
          setPrepared(null);
          setStatus({ message: "請加入 iPhone 主畫面，從圖示開啟系統後允許通知。" });
          return;
        }
        const device = await prepareBackgroundDevice(key, userId);
        if (!disposed) setPrepared(device);
      } catch {
        if (!disposed) setStatus({ message: "背景提醒尚未完成連線，請重試。", action: "retry" });
      }
    }
    void prepare();
    const onVisible = () => { if (!document.hidden) refresh(); };
    window.addEventListener("online", refresh);
    window.addEventListener("pageshow", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      disposed = true;
      window.removeEventListener("online", refresh);
      window.removeEventListener("pageshow", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [accessToken, userId, revision, refresh]);

  useEffect(() => {
    if (!featureEnabled || !prepared || !loaded) return;
    let disposed = false;
    void syncBackgroundDevice({ prepared, accessToken, userId, enabled, serviceType, checkInId, isCurrent: () => !disposed })
      .then(result => { if (!disposed) setStatus(result); })
      .catch(() => { if (!disposed) setStatus({ message: enabled
        ? "尚未完成背景提醒同步，請重試。" : "尚未確認停止背景提醒，請重試。", action: "retry" }); });
    return () => { disposed = true; };
  }, [featureEnabled, prepared, accessToken, userId, loaded, enabled, serviceType, checkInId]);

  const authorize = useCallback(() => {
    if (!featureEnabled || !prepared || authorizationPending.current) return;
    if (Notification.permission === "denied") {
      setStatus({ message: "請在 iPhone「設定 → 通知」允許通知，再重新開啟系統。", action: "retry" });
      return;
    }
    const epoch = nextReminderIntent();
    authorizationPending.current = true;
    setStatus({ message: "正在啟用背景通知…" });
    let request: Promise<PushSubscription>;
    try {
      request = subscribeFromGesture(prepared);
    } catch {
      authorizationPending.current = false;
      setStatus({ message: "無法啟用通知，請重試。", action: "authorize" });
      return;
    }
    void request.then(async sub => {
      if (!currentReminderIntent(epoch)) {
        // The switch was turned off or the user signed out while iOS prompted.
        await sub.unsubscribe().catch(() => false);
        return;
      }
      if (!writeReminderConsent(userId, true)) {
        await sub.unsubscribe().catch(() => false);
        setStatus({ message: "無法儲存裝置同意狀態，請重試。", action: "authorize" });
        return;
      }
      // Fresh preparation/sync will read the actual current checked-in hall.
      refresh();
    }).catch(() => {
      if (currentReminderIntent(epoch)) setStatus({
        message: "尚未允許背景通知，請重新啟用或檢查 iPhone 通知設定。", action: "authorize",
      });
    }).finally(() => { authorizationPending.current = false; });
  }, [featureEnabled, prepared, userId, refresh]);

  const onPreferenceChange = useCallback((next: boolean) => {
    if (next) {
      if (featureEnabled) authorize();
    } else {
      const epoch = nextReminderIntent();
      // Turning off must clear any prior consent even if the server is now
      // temporarily unavailable or the feature flag has been disabled.
      if (!featureEnabled && readReminderConsent()?.userId !== userId) return;
      writeReminderConsent(userId, false);
      setStatus({ message: "正在停止背景提醒…" });
      // The same device operation queue handles both registration and revoke.
      void revokeBackgroundDevice(accessToken).then(stopped => {
        if (!currentReminderIntent(epoch)) return;
        setStatus(stopped ? { message: "背景震動提醒已關閉。" }
          : { message: "尚未確認停止背景提醒，請重新連線後重試。", action: "retry" });
      });
    }
  }, [featureEnabled, authorize, userId, accessToken]);

  return {
    status: featureEnabled ? status : null,
    authorize,
    refresh,
    onPreferenceChange,
  };
}
