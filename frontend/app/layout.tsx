import type { Metadata } from 'next'
import './globals.css'
import { NavBar } from '@/components/NavBar'

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
      <body className="pt-14">
        <NavBar />
        {children}
      </body>
    </html>
  )
}
