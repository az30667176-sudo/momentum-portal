'use client'

import { useRouter } from 'next/navigation'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ResponsiveContainer,
  LabelList,
} from 'recharts'
import type { ChartBarItem } from '@/lib/research'

interface Props {
  type: 'hbar'
  items: ChartBarItem[]
  title: string
}

export default function ExhibitChart({ type, items, title }: Props) {
  const router = useRouter()

  if (type === 'hbar') {
    return <HBarChart items={items} title={title} router={router} />
  }
  return null
}

function HBarChart({
  items,
  title,
  router,
}: {
  items: ChartBarItem[]
  title: string
  router: ReturnType<typeof useRouter>
}) {
  const height = Math.max(400, items.length * 32 + 60)

  return (
    <div className="w-full">
      <p className="text-center text-sm font-semibold text-gray-700 mb-3">
        {title}
      </p>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={items}
          layout="vertical"
          margin={{ top: 5, right: 60, left: 10, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
          <XAxis
            type="number"
            tick={{ fontSize: 12, fill: '#6b7280' }}
            tickFormatter={(v: number) => `${v}%`}
            label={{
              value: '1W return (%)',
              position: 'insideBottom',
              offset: -2,
              fontSize: 12,
              fill: '#9ca3af',
            }}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={220}
            tick={({ x, y, payload }: any) => {
              const item = items.find((i) => i.label === payload.value)
              return (
                <text
                  x={x}
                  y={y}
                  dy={4}
                  textAnchor="end"
                  fontSize={12}
                  fill="#374151"
                  className="cursor-pointer hover:fill-emerald-600"
                  onClick={() => item?.href && router.push(item.href)}
                >
                  {payload.value}
                </text>
              )
            }}
          />
          <Tooltip
            formatter={(value: number) => [`${value > 0 ? '+' : ''}${value.toFixed(1)}%`, '1W']}
            labelStyle={{ fontWeight: 600 }}
            contentStyle={{ fontSize: 13 }}
          />
          <Bar
            dataKey="value"
            radius={[0, 4, 4, 0]}
            cursor="pointer"
            onClick={(data: any) => {
              if (data?.href) router.push(data.href)
            }}
          >
            {items.map((item, i) => (
              <Cell
                key={i}
                fill={item.value >= 0 ? '#22c55e' : '#ef4444'}
              />
            ))}
            <LabelList
              dataKey="value"
              position="right"
              formatter={(v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)}%`}
              style={{ fontSize: 11, fill: '#6b7280' }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <p className="text-center text-xs text-gray-400 mt-1">
        點擊任一列可查看該次產業詳情
      </p>
    </div>
  )
}
