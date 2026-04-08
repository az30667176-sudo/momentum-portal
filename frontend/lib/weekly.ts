import fs from 'fs'
import path from 'path'

export interface WeeklyExhibit {
  number: number
  title: string
  image: string
  caption: string
  body: string
}

export interface WeeklySource {
  title: string
  url: string
}

export interface WeeklyIssue {
  slug: string
  issue: number
  date: string
  snapshotDate: string
  title: string
  subtitle: string
  imageDir: string
  coverImage: string
  intro: string[]
  exhibits: WeeklyExhibit[]
  actions: string[]
  sources: WeeklySource[]
}

const CONTENT_DIR = path.join(process.cwd(), 'content', 'weekly')

export function getAllIssues(): WeeklyIssue[] {
  if (!fs.existsSync(CONTENT_DIR)) return []
  const files = fs
    .readdirSync(CONTENT_DIR)
    .filter((f) => f.endsWith('.json'))
  const issues = files.map((f) => {
    const raw = fs.readFileSync(path.join(CONTENT_DIR, f), 'utf-8')
    return JSON.parse(raw) as WeeklyIssue
  })
  // newest first
  return issues.sort((a, b) => b.date.localeCompare(a.date))
}

export function getIssue(slug: string): WeeklyIssue | null {
  const file = path.join(CONTENT_DIR, `${slug}.json`)
  if (!fs.existsSync(file)) return null
  return JSON.parse(fs.readFileSync(file, 'utf-8')) as WeeklyIssue
}

export function getAllSlugs(): string[] {
  if (!fs.existsSync(CONTENT_DIR)) return []
  return fs
    .readdirSync(CONTENT_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace('.json', ''))
}
