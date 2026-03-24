'use client'

import { SubReturn } from '@/lib/types'
import Link from 'next/link'

interface Props {
  data: SubReturn[]
  latestDate: string | null
}

function getMomColor(score: number | null): string {
  if (score === null) return 'bg-gray-200 dark:bg-gray-700'
  if (score >= 80) return 'bg-green-600 text-white'
  if (score >= 65) return 'bg-green-400 text-white'
  if (score >= 50) return 'bg-yellow-300 text-gray-900'
  if (score >= 35) return 'bg-orange-400 text-white'
  return 'bg-red-600 text-white'
}

export function Heatmap({ data, latestDate }: Props) {
  // 按 sector 分組
  const bySector = data.reduce<Record<string, SubReturn[]>>((acc, row) => {
    const sector = row.gics_universe?.sector ?? 'Unknown'
    if (!acc[sector]) acc[sector] = []
    acc[sector].push(row)
    return acc
  }, {})

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Momentum Portal
        </h1>
        {latestDate && (
          <p className="text-sm text-gray-500 mt-1">
            Data as of: {latestDate}
          </p>
        )}
      </div>

      {Object.entries(bySector).map(([sector, rows]) => (
        <div key={sector} className="mb-8">
          <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-3">
            {sector}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
            {rows.map((row) => (
              <Link
                key={row.gics_code}
                href={`/sub/${row.gics_code}`}
                className={`rounded-lg p-3 ${getMomColor(row.mom_score)} hover:opacity-80 transition-opacity`}
              >
                <div className="text-xs font-medium truncate">
                  {row.gics_universe?.sub_industry ?? row.gics_code}
                </div>
                <div className="text-sm font-bold mt-1">
                  {row.mom_score?.toFixed(1) ?? '—'}
                </div>
                <div className="text-xs opacity-80">
                  #{row.rank_today ?? '—'}
                  {row.delta_rank !== null && row.delta_rank !== 0 && (
                    <span className={row.delta_rank > 0 ? 'text-green-300' : 'text-red-300'}>
                      {' '}{row.delta_rank > 0 ? '▲' : '▼'}{Math.abs(row.delta_rank)}
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
