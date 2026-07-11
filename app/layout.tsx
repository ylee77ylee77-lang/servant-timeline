import AuthProvider from '@/components/auth/AuthProvider'

export const metadata = {
  title: '主日崇拜招待',
  description: '主日崇拜招待排程系統',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-TW">
      <head>
        {/* 載入 Tailwind CSS 樣式庫 */}
        <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <body><AuthProvider>{children}</AuthProvider></body>
    </html>
  )
}
