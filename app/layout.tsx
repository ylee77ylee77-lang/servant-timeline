import AuthProvider from '@/components/auth/AuthProvider'
import './globals.css'

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
      <body><AuthProvider>{children}</AuthProvider></body>
    </html>
  )
}
