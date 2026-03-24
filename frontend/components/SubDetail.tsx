'use client'

import { SubReturn } from '@/lib/types'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import Link from 'next/link'

interface Props {
  gicsCode: string
  history: SubReturn[]
}

export function SubDetail({ gicsCode, history }: Props) {
  const latest = history[history.length - 1]
  const subName = latest?.gics_universe?.sub_industry ?? gicsCode

  const chartData = history.map((r) => ({
    date: r.date,
    mom_score: r.mom_score,
    rank: r.rank_today,
    ret_3m: r.ret_3m,
  }))

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-4">
        <Link href="/" className="text-blue-500 hover:underline text-sm">
          ← Back to Heatmap
        </Link>
      </div>

      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
        {subName}
      </h1>
      <p className="text-sm text-gray-500 mb-6">
        {latest?.gics_universe?.sector} · Code: {gicsCode}
      </p>

      {/* Latest Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Mom Score', value: latest?.mom_score?.toFixed(1) },
          { label: 'Rank', value: latest?.rank_today ? `#${latest.rank_today}` : '—' },
          { label: '3M Return', value: latest?.ret_3m ? `${latest.ret_3m.toFixed(1)}%` : '—' },
          { label: '6M Return', value: latest?.ret_6m ? `${latest.ret_6m.toFixed(1)}%` : '—' },
          { label: '1M Return', value: latest?.ret_1m ? `${latest.ret_1m.toFixed(1)}%` : '—' },
          { label: '1W Return', value: latest?.ret_1w ? `${latest.ret_1w.toFixed(1)}%` : '—' },
          { label: 'RVol', value: latest?.rvol?.toFixed(2) },
          { label: 'PV Signal', value: latest?.pv_divergence },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
            <div className="text-xs text-gray-500">{label}</div>
            <div className="text-lg font-semibold text-gray-900 dark:text-white mt-1">
              {value ?? '—'}
            </div>
          </div>
        ))}
      </div>

      {/* Momentum Score Chart */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm mb-6">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
          Momentum Score History
        </h2>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10 }}
              tickFormatter={(v) => v.slice(5)}
              interval="preserveStartEnd"
            />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
            <Tooltip />
            <ReferenceLine y={50} stroke="#9ca3af" strokeDasharray="4 4" />
            <Line
              type="monotone"
              dataKey="mom_score"
              stroke="#3b82f6"
              dot={false}
              strokeWidth={2}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Rank Chart */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
          Rank History (lower = stronger)
        </h2>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10 }}
              tickFormatter={(v) => v.slice(5)}
              interval="preserveStartEnd"
            />
            <YAxis reversed domain={[1, 145]} tick={{ fontSize: 10 }} />
            <Tooltip />
            <Line
              type="monotone"
              dataKey="rank"
              stroke="#10b981"
              dot={false}
              strokeWidth={2}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
