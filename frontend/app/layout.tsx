import type { Metadata } from 'next'
import './globals.css'
import { NavBar } from '@/components/NavBar'

export const metadata: Metadata = {
  title: 'Sector Pulse — S&P 1500 板塊輪動量化研究',
  description: 'S&P 1500 × 155 GICS Sub-Industry 動能排名、Sector Rotation 回測、個股篩選研究平台',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="zh-TW">
      <body className="bg-white text-gray-900 antialiased">
        <NavBar />
        {children}
      </body>
    </html>
  )
}
