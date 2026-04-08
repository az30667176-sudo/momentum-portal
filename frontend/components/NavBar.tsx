'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { label: '產業總覽', href: '/' },
  { label: '個股排名', href: '/stocks' },
  { label: '回測專區', href: '/backtest' },
  { label: '研究分享', href: '/research' },
]

export function NavBar() {
  const pathname = usePathname()

  return (
    <nav className="sticky top-0 z-50 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
      <div className="flex">
        {TABS.map(({ label, href }) => {
          const isActive =
            href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={`flex-1 text-center py-3 text-sm font-medium transition-colors hover:bg-gray-50 dark:hover:bg-gray-800 ${
                isActive
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-600 dark:text-gray-300'
              }`}
            >
              {label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
