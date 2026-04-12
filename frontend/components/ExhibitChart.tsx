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
  ScatterChart,
  Scatter,
  ZAxis,
  ReferenceLine,
  Label,
} from 'recharts'
import type { ChartData, ChartBarItem, ChartScatterItem } from '@/lib/research'

interface Props {
  chartData: ChartData
  title: string
}

export default function ExhibitChart({ chartData, title }: Props) {
  const router = useRouter()

  if (chartData.type === 'hbar') {
    return <HBarChart items={chartData.items} title={title} router={router} />
  }
  if (chartData.type === 'scatter') {
    return (
      <ScatterPlot
        items={chartData.items}
        xLabel={chartData.xLabel}
        yLabel={chartData.yLabel}
        quadrants={chartData.quadrants}
        colorLabels={chartData.colorLabels}
        title={title}
        router={router}
      />
    )
  }
  return null
}

/* ── Horizontal Bar ── */

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
            formatter={(value: number) => [
              `${value > 0 ? '+' : ''}${value.toFixed(1)}%`,
              '1W',
            ]}
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
              formatter={(v: number) =>
                `${v > 0 ? '+' : ''}${v.toFixed(1)}%`
              }
              style={{ fontSize: 11, fill: '#6b7280' }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <p className="text-center text-xs text-gray-400 mt-1">
        點擊任一列可查看詳情
      </p>
    </div>
  )
}

/* ── Scatter Plot ── */

const CustomDot = (props: any) => {
  const { cx, cy, payload } = props
  if (!cx || !cy) return null
  const color = payload.color || '#22c55e'
  return (
    <g>
      <circle
        cx={cx}
        cy={cy}
        r={8}
        fill={color}
        fillOpacity={0.8}
        stroke={color}
        strokeWidth={1.5}
        style={{ cursor: 'pointer' }}
      />
      <text
        x={cx + 12}
        y={cy - 8}
        fontSize={11}
        fill="#374151"
        style={{ cursor: 'pointer', pointerEvents: 'none' }}
      >
        {payload.label}
      </text>
    </g>
  )
}

function ScatterPlot({
  items,
  xLabel,
  yLabel,
  quadrants,
  colorLabels,
  title,
  router,
}: {
  items: ChartScatterItem[]
  xLabel: string
  yLabel: string
  quadrants?: boolean
  colorLabels?: Record<string, string>
  title: string
  router: ReturnType<typeof useRouter>
}) {
  return (
    <div className="w-full">
      <p className="text-center text-sm font-semibold text-gray-700 mb-3">
        {title}
      </p>
      <ResponsiveContainer width="100%" height={480}>
        <ScatterChart margin={{ top: 20, right: 30, bottom: 30, left: 20 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            type="number"
            dataKey="x"
            name={xLabel}
            tick={{ fontSize: 12, fill: '#6b7280' }}
            tickFormatter={(v: number) => `${v}%`}
          >
            <Label
              value={xLabel}
              position="insideBottom"
              offset={-15}
              style={{ fontSize: 12, fill: '#9ca3af' }}
            />
          </XAxis>
          <YAxis
            type="number"
            dataKey="y"
            name={yLabel}
            tick={{ fontSize: 12, fill: '#6b7280' }}
            tickFormatter={(v: number) => `${v}%`}
          >
            <Label
              value={yLabel}
              angle={-90}
              position="insideLeft"
              offset={5}
              style={{ fontSize: 12, fill: '#9ca3af' }}
            />
          </YAxis>
          <ZAxis range={[200, 200]} />
          {quadrants && (
            <>
              <ReferenceLine x={0} stroke="#d1d5db" strokeDasharray="3 3" />
              <ReferenceLine y={0} stroke="#d1d5db" strokeDasharray="3 3" />
            </>
          )}
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const d = payload[0].payload as ChartScatterItem
              return (
                <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-sm">
                  <p className="font-semibold text-gray-900">{d.label}</p>
                  <p className="text-gray-600">
                    {xLabel}: {d.x > 0 ? '+' : ''}{d.x.toFixed(1)}%
                  </p>
                  <p className="text-gray-600">
                    {yLabel}: {d.y > 0 ? '+' : ''}{d.y.toFixed(1)}%
                  </p>
                  <p className="text-emerald-600 text-xs mt-1">點擊查看詳情</p>
                </div>
              )
            }}
          />
          <Scatter
            data={items}
            shape={<CustomDot />}
            cursor="pointer"
            onClick={(data: any) => {
              if (data?.href) router.push(data.href)
            }}
          />
        </ScatterChart>
      </ResponsiveContainer>
      {/* Legend for colored dots */}
      {items.some((i) => i.color) && (
        <div className="flex justify-center gap-4 mt-2 text-xs text-gray-500">
          {Array.from(new Set(items.map((i) => i.color).filter(Boolean))).map(
            (c) => {
              const label = colorLabels?.[c!]
                ?? (c === '#ef4444' || c === '#f97316'
                  ? 'Energy'
                  : c === '#3b82f6'
                    ? 'Tech / Industrials'
                    : c === '#10b981'
                      ? 'Strong'
                      : c === '#60a5fa'
                        ? 'Moderate'
                        : c === '#94a3b8'
                          ? 'Weak'
                          : c === '#f87171'
                            ? 'Lagging'
                            : c === '#34d399'
                              ? 'Accelerating'
                              : 'Other')
              return (
                <span key={c} className="flex items-center gap-1">
                  <span
                    className="inline-block w-3 h-3 rounded-full"
                    style={{ backgroundColor: c }}
                  />
                  {label}
                </span>
              )
            },
          )}
        </div>
      )}
      <p className="text-center text-xs text-gray-400 mt-1">
        點擊任一點可查看詳情
      </p>
    </div>
  )
}
