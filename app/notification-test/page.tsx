import type { Metadata } from "next";
import { NotificationReadinessTest } from "@/components/notification/NotificationReadinessTest";

export const metadata: Metadata = {
  title: "系統通知測試｜夏凱納招待",
  description: "iPhone 主畫面網頁 App 的通知權限與系統通知驗證。",
  manifest: "/notification-test.webmanifest",
  appleWebApp: { capable: true, title: "招待通知測試", statusBarStyle: "default" },
  icons: { icon: "/logo.png", apple: "/logo.png" },
  robots: { index: false, follow: false },
};

export default function NotificationTestPage() {
  return <NotificationReadinessTest />;
}
