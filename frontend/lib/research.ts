import fs from 'fs'
import path from 'path'

export type ResearchCategory = 'weekly' | 'stock' | 'sector'

export const CATEGORIES: { key: ResearchCategory; label: string; href: string }[] = [
  { key: 'weekly', label: '輪動週報', href: '/research/weekly' },
  { key: 'stock', label: '個股想法', href: '/research/stock' },
  { key: 'sector', label: '產業分享', href: '/research/sector' },
]

export interface ExhibitLink {
  label: string
  href: string
}

export interface ChartBarItem {
  label: string
  value: number
  href: string
}

export interface ChartScatterItem {
  label: string
  x: number
  y: number
  href: string
  color?: string
}

export type ChartData =
  | { type: 'hbar'; items: ChartBarItem[] }
  | { type: 'scatter'; xLabel: string; yLabel: string; items: ChartScatterItem[]; quadrants?: boolean; colorLabels?: Record<string, string> }

export interface ResearchExhibit {
  number: number
  title: string
  image: string
  caption: string
  body: string
  links?: ExhibitLink[]
  chartData?: ChartData
}

export interface ResearchSource {
  title: string
  url: string
}

export interface ResearchIssue {
  slug: string
  issue: number
  date: string
  snapshotDate: string
  title: string
  subtitle: string
  imageDir: string
  coverImage: string
  intro: string[]
  exhibits: ResearchExhibit[]
  actions: string[]
  sources: ResearchSource[]
}

function dirFor(category: ResearchCategory) {
  return path.join(process.cwd(), 'content', 'research', category)
}

export function getAllIssues(category: ResearchCategory): ResearchIssue[] {
  const dir = dirFor(category)
  if (!fs.existsSync(dir)) return []
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'))
  const issues = files.map((f) => {
    const raw = fs.readFileSync(path.join(dir, f), 'utf-8')
    return JSON.parse(raw) as ResearchIssue
  })
  return issues.sort((a, b) => b.date.localeCompare(a.date))
}

export function getIssue(category: ResearchCategory, slug: string): ResearchIssue | null {
  const file = path.join(dirFor(category), `${slug}.json`)
  if (!fs.existsSync(file)) return null
  return JSON.parse(fs.readFileSync(file, 'utf-8')) as ResearchIssue
}

export function getAllSlugs(category: ResearchCategory): string[] {
  const dir = dirFor(category)
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace('.json', ''))
}

// ---------------- Stock Memo (個股想法) ----------------

export interface StockMemo {
  slug: string
  ticker: string
  company: string
  sector: string
  subIndustry: string
  date: string
  title: string
  subtitle: string
  stance: 'Long' | 'Short' | 'Pair' | string
  expectedReturn: string
  conviction: 'High' | 'Medium' | 'Low' | string
  // quant snapshot from portal
  momScore: number
  rankInSub: string
  subRank: string
  // markdown body
  body: string
}

function stockDir() {
  return path.join(process.cwd(), 'content', 'research', 'stock')
}

export function getAllStockMemos(): StockMemo[] {
  const dir = stockDir()
  if (!fs.existsSync(dir)) return []
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'))
  const memos = files.map((f) => {
    const raw = fs.readFileSync(path.join(dir, f), 'utf-8')
    return JSON.parse(raw) as StockMemo
  })
  return memos.sort((a, b) => b.date.localeCompare(a.date))
}

export function getStockMemo(slug: string): StockMemo | null {
  const file = path.join(stockDir(), `${slug}.json`)
  if (!fs.existsSync(file)) return null
  return JSON.parse(fs.readFileSync(file, 'utf-8')) as StockMemo
}

export function getAllStockMemoSlugs(): string[] {
  const dir = stockDir()
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace('.json', ''))
}
