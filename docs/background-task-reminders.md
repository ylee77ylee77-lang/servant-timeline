# 背景任務震動｜上線準備（功能保持停用）

## 實機與隔離驗證
- PR #54 的 iPhone 開關觸覺回饋、#55 的 PWA 系統通知、#56 的單次與三次鎖屏推播均由管理員實測成功。這不保證所有裝置或通知設定都會震動。
- CI 45719337175 完整通過：CLI migration 候選實際套用、RLS 與 RPC 授權、Auth 登入/登出、REST 裝置註冊、併行認領、RFC8291 加密/解密、正式 worker 通知、撤銷及 10 秒 pg_cron 相容性。安全 advisors 無發現問題。Apple transport 在 CI 使用替身，不會發送真實通知。
- 將 CLI 產生的檔名 `20261125231112_background_task_reminders.sql` 納入正式 migrations，移除重複 staged 定義。新增短效簽章及 Vault/pg_net 串接測試，需要重新通過 CI。這不代表已套用至正式資料庫。
- 僅在 CI 的臨時 Supabase 啟用電子郵件登入 provider；全域禁止自行註冊維持不變。正式 config.toml 與 Auth 不變。

## 行為與安全
- 沿用震動開關，iOS 主畫面 Web App 須明確同意通知；不增加震動長度或次數。只有 Apple 合法端點；不覆蓋非本系統的 worker。Android 及語音助理原有行為保持。
- 裝置綁定有效登入工作階段、實際報到、分派與堂次截止；最長 12 小時。每次規劃與 take 重驗證。未確認角色不發送。副總招限制三樓範圍。撤銷保留去重記錄，跨帳號接管拒絕。404/410 停用相符的失效訂閱。
- 資料表 RLS 和函式權限僅允許可信伺服器。排程與 Vault 私有函式限資料庫 owner。Web Push 使用固定 web-push 3.6.7 AES128GCM；通知只含日期、堂次、任務到點時間；無姓名、電話等個資。
- 只認領 20 秒有效窗口的非初始任務區塊；同裝置、堂次、任務分鐘唯一，take 原子更新；不重送結果不明的請求。HTTP 2xx 只表示推播服務接受。
- pg_net 的佇列可能由具 SQL 連線權限的角色讀取；不將長期秘密作為 HTTP bearer 傳送。Vault 只用來在資料庫內產生專用 HMAC-SHA256 簽章，有效 30 秒（允許 5 秒未來時間誤差）。API 驗證固定用途及時間，不接受指定收件人、任務、時鐘。短窗內重放仍受資料庫到點及唯一鍵保護；不能把簽章視為完全不可重放。正式 net、vault、私有 schema 不得暴露在 Data API，需審查資料庫 LOGIN 角色及 Vault 存取權限。不要假設可以在託管 Supabase 撤銷 extension owner 授予的 PUBLIC 權限。
- Cron 每 10 秒檢查台北服事時段及待傳送任務；無任務不呼叫 Vercel。仍需監控 DB 工作與紀錄量，不承諾零成本。已交付系統通知無法召回，離線時撤銷可能需要重試。

## 部署與回復
1. PR 的完整 CI（含 migration、Vault/pg_net rollback-only 測試與 security advisors）通過後審閱，未核准前不合併。
2. 預覽與正式共用資料庫，故正式註冊及 dispatch 僅允許 production 環境，功能旗標預設停用；不可為實測開放共用資料庫。需另行核准隔離測試環境或管理員限定的正式驗收計畫。
3. 審查 extension 狀態、Data API exposed schemas、登入角色及成本。migration 只建立表和函式，不會啟用 extension、建立 cron job 或送通知。以核准的部署流程套用 migration，再驗證 migration 歷史、RLS 和安全 advisors。
4. 以安全管理介面設定新的正式 VAPID 金鑰、獨立長期 dispatch HMAC secret（Vercel `BACKGROUND_REMINDER_DISPATCH_SECRET` 與 Vault 名稱 `background_reminder_dispatch_secret` 需一致）；不得輸出值或沿用測試金鑰。部署程式時先保持 `ENABLE_BACKGROUND_TASK_REMINDERS` 停用。
5. 獨立核准後啟用 pg_cron、pg_net；確認 Vault 可用及 queue 權限，建立名為 `background-task-reminders` 的 job（`10 seconds`，執行 `select background_reminder_private.queue_due_dispatch();`）。在明確授權的實機驗收範圍內才啟用旗標；驗證同一裝置原主畫面圖示、權限、報到、換堂、開關、登出、任務取消、服事結束、離線及前景/鎖屏重複提示、真實延遲與負載。通過後再擴大使用。
6. 停用順序：關閉旗標並停止 job，必要時撤銷裝置。既有語音與報到不依賴本功能。保留去重資料，待審閱後依保存政策清理失效訂閱及 cron 歷史。不要擅自 drop extension 或刪除其他 job。

## 測試方法
`supabase/tests/background_task_reminders_verification.sql` 由本地 migration 安裝後執行，測試資料在交易內回復。`scripts/verify-background-reminders-integration.mjs` 只允許 GitHub Actions 臨時 loopback Supabase；使用真實 Auth/REST、加密及 worker，但 Apple fetch 為測試替身。Vault/pg_net 使用虛構隨機秘密在同一 transaction 建立並驗證待送標頭，最後 rollback（HTTP 請求只在 commit 後開始）。比對 SQL 與 Node 簽章及到期。不得連接正式資料庫或印出秘密、訂閱及授權標頭。

目前：尚未合併、尚未套用正式 migration、未設定正式環境秘密、未啟用正式排程。

## 管理員預覽實機驗收
預覽限定原有震動開關（同一 PersonalPreferencesCards、useBackgroundReminders、正式 worker 與 aes128gcm 發送器）。僅指定 PR 分支、VERCEL_ENV=preview、ENABLE_BACKGROUND_REMINDER_PREVIEW=true、獨立 BACKGROUND_PREVIEW_VAPID_* 金鑰且伺服器驗證 admin 才開放；正式 API 不放行。手機端授權後可手動啟動 +15/+30/+45 秒三則標記為模擬的加密通知，不需報到，不寫入任何正式提醒資料，不啟用 Cron。每次發送重新確認管理員角色；關閉震動開關透過實際瀏覽器 unsubscribe 停止接收，404/410 停止本輪。已送出通知不能撤回；這是有界 after 測試而非可持久化/跨執行程序撤銷的正式排程，限流只在單一程序。真實排程與 DB 撤銷仍依正式 CI 及後續核准驗收。不得把此測試通過視為正式 Cron 已上線。
