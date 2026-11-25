# 背景任務震動｜排程基礎（尚未啟用）

## 實機證據
PR #54 原生開關觸覺回饋、PR #55 主畫面 PWA 通知、PR #56 伺服器延遲推播均由管理員在 iPhone 實測成功；鎖屏收件時有震動；2026-11-24 再次驗證 +15、+30、+45 秒三個模擬任務皆收到通知且均有震動。這只證明該裝置與當時設定可行，不代表所有手機必定震動。

## 本階段
- 新分支由最新 main 建立，避免直接堆疊尚未審核的 PR #53–56。
- `supabase/staged/background_task_reminders.sql` 是待審核的可執行資料庫基礎，刻意不放進 migrations；不會被正式部署或 supabase db push 套用。
- `supabase/tests/background_task_reminders_verification.sql` 在隔離資料庫交易內載入基礎、使用虛構裝置和任務測試、最後 rollback。測試先遵守當日報到觸發器，再於同一交易內模擬主日日期；不停用正式安全機制。無需真實推播金鑰，也不會發送任何通知。
- 震動提醒獨立於語音助理，對應既有任務區塊切換。同一裝置、堂次和任務分鐘只建立一個事件，不重播初始區塊，不追發逾時事件。
- 裝置必須明確同意、綁定自己的有效報到，最長有效 12 小時。使用資料庫重新確認帳號、報到、分派、堂次狀態、台北時間及權限。副總招範圍受限；待分派的共用時間軸暫只允許經確認的總招範圍。其餘未確認角色暫不送。
- 認領與開始傳送使用唯一約束及原子狀態更新。未開始的事件可在有效時間內恢復；已開始、結果不明的事件不自動重送，避免重複提醒。HTTP 2xx 代表推播服務接受，不等於手機收到。
- 兩個資料表啟用 RLS，所有相關函式與資料僅 server service_role 可操作；端點與訂閱密鑰不得出現在客戶端查詢結果或日誌。送出的鎖屏資訊依最少資訊原則，不放電話、其他同工資料或敏感內容。

## 上線前必須完成（未啟用）
1. 審閱此 PR 的完整程式及測試結果。在獨立環境生成正式 migration（使用 Supabase CLI migration new），執行 migration、RLS／授權及 advisors 驗證。
2. 預覽目前與正式共用資料庫，正式註冊與派送 API 僅允許 production 環境，且預設停用；不可為了實測而開放共用資料庫。應先使用獨立測試資料庫與專屬測試裝置完成實際整合測試。
3. 設定獨立正式 VAPID 金鑰、排程授權秘密及 Vault。測試金鑰不得轉為正式金鑰。先部署停用旗標的程式及資料庫結構，再另行核准啟用。
4. 檢查 pg_net 的 HTTP 佇列、回應及 Vault 權限，確保未授權角色不能讀取包含授權標頭的佇列，也不能呼叫派送函式。確認 Cron 的成本／額度、執行紀錄保留及過期訂閱清理政策。
5. 在真機驗證原本主畫面圖示相容性、權限授予、開關、換堂、登出、結束堂次、任務取消、網路失效與前景／鎖屏重複提醒。已收到的通知無法撤回；HTTP 2xx 不等於裝置實際收到或震動。
6. 完成實際延遲及負載驗證、回復方案和使用者審閱後才啟用正式排程。

## 部署狀態
僅隔離測試。未改動 main、正式資料庫、正式 Cron、環境變數、語音與報到流程；此階段沒有新增可供手機操作的正式任務推播頁。

## 裝置生命週期
共用有效報到及堂次窗口判斷，註冊綁定實際分派，截止堂次結束或最長十二小時。拒絕跨帳號接管、更換訂閱金鑰、未報到堂次以及舊註冊覆蓋較新的撤銷。撤銷保留去重紀錄。HTTP 404/410 在仍為原發送綁定時停用訂閱；已送交推播服務的通知不能撤回。

## 正式發送器（未啟用）
- 使用固定 web-push 3.6.7 的 aes128gcm 加密與 VAPID；限定 Apple HTTPS 端點、禁止重導向、限制有效期限、逾時不重送。通知僅含日期、堂次、任務到點時間。
- 裝置 API 使用既有登入驗證，拒絕跨來源請求及不合法的 P-256 公鑰。正式註冊/撤銷都以伺服器驗證的帳號呼叫 RPC；不回傳端點或私鑰。
- Dispatch API 僅接受持有獨立伺服器密鑰的排程器，無法指定使用者、任務或時間。資料庫原子 take 與結果紀錄控制重複通知。404/410 撤銷相符的失效訂閱。
- 目前預覽與正式共用資料庫，故兩支 API 的資料庫操作只允許正式環境；正式註冊／發送還需 ENABLE_BACKGROUND_TASK_REMINDERS=true、獨立正式 VAPID 金鑰及 BACKGROUND_REMINDER_DISPATCH_SECRET。沒有設定任何正式金鑰、Cron、migration 或啟用旗標。測試均使用虛構訂閱與 mocked fetch。

- 登入工作階段綁定：僅在 Auth.getUser 驗證原 Bearer Token 後提取 session_id；資料庫以非公開 schema 的布林函式確認 auth.sessions 的所有權與有效期，不開放 Auth 表查詢。每次任務規劃及 take 均重新驗證，成功登出使舊訂閱失效。

## 現有開關與裝置同步
沿用原本震動設定，不增加震動長度／次數設定。只有支援的 Apple 主畫面 Web App 在功能旗標啟用後顯示背景通知授權提示。iOS 必須由實際點擊授權；本機預設 ON 不代表已同意系統通知。報到後以鎖定堂次同步，未正式報到不註冊；關閉同時撤銷訂閱，成功登出後伺服器重新驗證登入工作階段。保留原有語音助理、Android 震動及報到流程。正式 PWA manifest 使用現有名稱與 logo，主畫面安裝相容性仍須實測。

## 秒級排程（未啟用）
`supabase/staged/background_task_reminder_cron.sql` 只建立資料庫內部入口。判斷台北服事時段及 20 秒有效窗口、有待傳送任務才讀取 Vault，向固定正式網址呼叫派送 API；無任務不消耗 Vercel 請求。無任何自動 cron.schedule 或 extension 變更。測試包含入口的早／晚、非服事時段、已完成或取消事件、可恢復認領及未授權角色；不發送真實 HTTP。

審閱與核准後的部署順序：使用獨立資料庫先測試 pg_cron、pg_net 與 Vault，確認 Cron 時區、HTTP queue ACL 及執行費用。建立正式 migration，設定同一組獨立 dispatcher secret 於 Vercel 的 BACKGROUND_REMINDER_DISPATCH_SECRET 和 Vault 名稱 background_reminder_dispatch_secret；值只在管理介面安全設定。部署正式程式，先保持 ENABLE_BACKGROUND_TASK_REMINDERS 未啟用。驗收後才建立名稱為 background-task-reminders 的 Cron job（間隔 10 seconds，執行 select background_reminder_private.queue_due_dispatch();），並啟用旗標。若需停用，先停用旗標及 job；不影響現有語音與報到。秒級 job 即使無任務仍有資料庫工作及記錄量，需監控；不承諾零成本。未啟用本檔任何命令。

## 端到端隔離驗證（CI）
新增 `scripts/verify-background-reminders-integration.mjs`，僅 GitHub Actions 臨時 Supabase（固定 loopback 54321/54322）可執行。建立本機 Auth 測試帳號、實際登入及驗證 Token，透過 PostgREST 服務角色註冊裝置、驗證匿名／已登入使用者不能直接呼叫特權 RPC 或讀取訂閱，並用兩個 dispatchers 同時認領任務。實際加密後以測試裝置的 ECDH 金鑰解密，交由正式 worker 產生通知，驗證開關撤銷及真實 Auth 登出阻止已認領任務發送。Apple transport 僅為測試替身，沒有真實推播。另於交易內驗證 pg_cron 接受 10 seconds 間隔，不建立持久排程。CI 停止後清除臨時資料庫；不使用任何正式密鑰。此測試不能取代 iPhone 正式 PWA 或真實秒級延遲驗收。
