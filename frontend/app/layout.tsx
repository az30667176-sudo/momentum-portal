import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Momentum Portal',
  description: 'S&P 1500 × 145 GICS Sub-industry 動能研究 Portal',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="zh-TW">
      <body>{children}</body>
    </html>
  )
}
