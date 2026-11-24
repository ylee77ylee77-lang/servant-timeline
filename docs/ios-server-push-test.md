# 管理員鎖屏推播測試

此分支僅用於 Preview，正式站的 API 禁用。只有管理員可以發起固定內容測試，僅允許 Apple Web Push HTTPS 端點，不保存端點或訂閱，不接入正式堂次、不修改資料庫。伺服器接受後透過 Next.js after 延遲約 15 秒發送空 payload；Service Worker 立即顯示固定測試通知。此非持久化排程，也不是正式推播服務。

## 預覽設定
在自己的電腦使用 Node.js 產生獨立 P-256 VAPID 金鑰，例如 node -e "const e=require('node:crypto').createECDH('prime256v1');e.generateKeys();console.log('PUBLIC:',e.getPublicKey().toString('base64url'));console.log('PRIVATE:',e.getPrivateKey().toString('base64url'))"。不要將私鑰放入 Git、聊天或公開日誌。透過 Vercel 專案環境變數 UI 設定下列值，只選 Preview 並限制分支 feature/ios-server-push-test：

- WEB_PUSH_TEST_VAPID_PUBLIC_KEY：公鑰
- WEB_PUSH_TEST_VAPID_PRIVATE_KEY：私鑰（敏感，僅伺服器）
- WEB_PUSH_TEST_VAPID_SUBJECT：https://servant-timeline.vercel.app
- ENABLE_SERVER_PUSH_TEST：true

重新部署此預覽分支。使用管理員登入，從主畫面圖示開啟 /notification-test，先完成上方通知權限測試，再按準備及發送，收到接受提示後鎖屏。確認通知中心及震動；不要把 202 視為已送達。測試後可移除圖示並停用預覽功能。

此測試的防重複只在單一程序有效，正式版需要持久化且原子去重、裝置訂閱所有權、取消／失效清理、獨立排程及安全審查。
