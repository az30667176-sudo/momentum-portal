'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CATEGORIES } from '@/lib/research'

export function ResearchSubNav() {
  const pathname = usePathname()
  return (
    <nav className="flex gap-2 sm:gap-3 mb-8 border-b border-gray-200 pb-1">
      {CATEGORIES.map((c) => {
        const isActive = pathname === c.href || pathname.startsWith(c.href + '/')
        return (
          <Link
            key={c.key}
            href={c.href}
            className={`px-3 py-2 text-sm font-medium rounded-t transition-colors ${
              isActive
                ? 'text-blue-600 border-b-2 border-blue-600 -mb-[1px]'
                : 'text-gray-600 hover:text-black'
            }`}
          >
            {c.label}
          </Link>
        )
      })}
    </nav>
  )
}
