"use client";

import { useState } from "react";
import Link from "next/link";
import { ServerPushTest } from "@/components/notification/ServerPushTest";
import { useAuth } from "@/components/auth/AuthProvider";
import { BellRing, CheckCircle2, ChevronLeft, Smartphone } from "lucide-react";

type TestResult = { kind: "success" | "warning" | "error"; message: string } | null;

function openedFromHomeScreen() {
  const safariNavigator = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || safariNavigator.standalone === true;
}

function isApplePhoneOrTablet() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function NotificationReadinessTest() {
  const { isAdmin, session } = useAuth();
  const [result, setResult] = useState<TestResult>(null);
  const [busy, setBusy] = useState(false);

  const runTest = async () => {
    if (busy) return;

    if (isApplePhoneOrTablet() && !openedFromHomeScreen()) {
      setResult({
        kind: "warning",
        message: "請先在 Safari 點「分享 → 加入主畫面」，然後從主畫面上的「招待通知測試」圖示重新開啟。一般 Safari 分頁無法取得 iPhone 的 Web Push 權限。",
      });
      return;
    }

    if (!window.isSecureContext || !("serviceWorker" in navigator) || !("Notification" in window)) {
      setResult({
        kind: "warning",
        message: "此瀏覽器環境尚未提供系統通知功能。iPhone 請確認已加入主畫面，並從該圖示開啟。",
      });
      return;
    }

    if (Notification.permission === "denied") {
      setResult({
        kind: "warning",
        message: "系統通知權限已被拒絕。請到 iPhone「設定 → 通知」找到此網頁 App，允許通知後再測試。",
      });
      return;
    }

    setBusy(true);
    setResult(null);

    try {
      // Ask permission directly in the user gesture, before asynchronous registration.
      const permissionRequest = Notification.permission === "default"
        ? Notification.requestPermission()
        : Promise.resolve(Notification.permission);
      const permission = await permissionRequest;

      if (permission !== "granted") {
        setResult({ kind: "warning", message: "尚未允許通知，這次沒有發送測試通知。可在 iPhone 設定中調整通知權限。" });
        return;
      }

      // Isolated worker scope cannot intercept the existing worship-service dashboard.
      await navigator.serviceWorker.register("/notification-test-sw.js", { scope: "/notification-test" });
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification("夏凱納招待｜通知測試", {
        body: "這是你主動觸發的系統通知測試，並非正式服事任務。",
        icon: "/logo.png",
        tag: "shekinah-notification-readiness-test",
        data: { destination: "/notification-test" },
      });

      setResult({
        kind: "success",
        message: "已請 iPhone 顯示一則系統測試通知。請查看通知中心；若前景沒有橫幅，請檢查 iPhone 通知設定。本測試不代表背景定時推播已完成。",
      });
    } catch {
      setResult({
        kind: "error",
        message: "系統通知測試未成功。請確認從主畫面啟動、允許通知、使用 HTTPS；此步驟不會修改原本提醒設定。",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#FFF9F3] px-4 py-8 text-[#1F2937]">
      <div className="mx-auto max-w-md space-y-5">
        <Link href="/" className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-[#6D55A3]">
          <ChevronLeft className="h-5 w-5" aria-hidden="true" /> 返回招待服事系統
        </Link>

        <header className="rounded-[28px] border border-[#E6EAF0] bg-white p-5 shadow-sm">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#F3EEFF] text-[#6D55A3]">
            <BellRing className="h-7 w-7" aria-hidden="true" />
          </div>
          <h1 className="text-xl font-black">iPhone 系統通知測試</h1>
          <p className="mt-2 text-sm font-medium leading-6 text-[#7B7B74]">
            已確認手動開啟「震動提醒」能產生觸覺回饋。現在驗證 iPhone 主畫面網頁 App
            是否能取得通知權限、啟動 Service Worker，並顯示系統通知。
          </p>
        </header>

        <section className="rounded-[24px] border border-[#E6EAF0] bg-white p-5">
          <div className="mb-3 flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-[#008A7A]" aria-hidden="true" />
            <h2 className="text-base font-black">測試步驟</h2>
          </div>
          <ol className="list-decimal space-y-2.5 pl-5 text-sm font-medium leading-6 text-[#374151]">
            <li>使用 iPhone 的 Safari 開啟此頁，點「分享 → 加入主畫面」。</li>
            <li>從 iPhone 主畫面上的「招待通知測試」圖示開啟，並登入。</li>
            <li>點擊下方測試按鈕，收到詢問時選擇「允許通知」。</li>
            <li>確認系統通知是否顯示，並檢查 iPhone 通知中心。</li>
          </ol>
          <button
            type="button"
            onClick={() => void runTest()}
            disabled={busy}
            className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#008A7A] px-4 py-3 text-sm font-black text-white shadow-sm transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "測試中…" : "啟用並顯示系統通知"}
          </button>
          {result && (
            <div
              role="status"
              aria-live="polite"
              className={"mt-4 rounded-2xl border p-3.5 text-sm font-bold leading-6 " + (
                result.kind === "success"
                  ? "border-[#B4DACF] bg-[#F0FAF7] text-[#146B60]"
                  : "border-[#E7D9C8] bg-[#FFF9F3] text-[#795C38]"
              )}
            >
              {result.kind === "success" && <CheckCircle2 className="mr-1 inline h-4 w-4" aria-hidden="true" />}
              {result.message}
            </div>
          )}
        </section>

        {isAdmin && <ServerPushTest accessToken={session.access_token} />}

        <p className="px-2 text-xs font-medium leading-5 text-[#7B7B74]">
          這是使用者按鈕觸發的測試通知，不是服事任務到點的自動推播。
          下方獨立測試僅驗證伺服器推播；正式服事仍需要個人訂閱與任務排程。iPhone
          靜音、專注模式和通知設定仍可能影響提示方式。
        </p>
      </div>
    </main>
  );
}
