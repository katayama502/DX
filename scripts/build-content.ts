// content/ を検証して 1 つの ContentBundle にまとめる。
//   npx tsx scripts/build-content.ts          → src/generated/content.json（demo モード用）
//   npx tsx scripts/build-content.ts --push   → Supabase の各テーブルへ upsert（SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が必要）
import fs from 'node:fs'
import path from 'node:path'
import matter from 'gray-matter'
import * as yaml from 'js-yaml'
import type { Case, ContentBundle, DialogNode, LevelRule, Synonym, Term, Theme, ThemeKeyword } from '../src/lib/types'
import { CATEGORY_ORDER } from '../src/lib/types'

const ROOT = path.resolve('content')
const errors: string[] = []
const warn: string[] = []
const readYaml = <T,>(p: string): T => yaml.load(fs.readFileSync(p, 'utf8')) as T
const listFiles = (dir: string, ext: string) => fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(ext)).sort() : []

// ---- themes (Markdown) ----
function parseSections(md: string): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  let cur = ''
  for (const raw of md.split('\n')) {
    const line = raw.trimEnd()
    const h = line.match(/^##\s+(.+)$/)
    if (h) { cur = h[1].trim(); out[cur] = []; continue }
    const li = line.match(/^(?:[-*]|\d+\.)\s+(?:\[[ x]\]\s+)?(.+)$/)
    if (cur && li) out[cur].push(li[1].trim())
  }
  return out
}
const themes: Theme[] = listFiles(path.join(ROOT, 'themes'), '.md').map((f) => {
  const { data, content } = matter(fs.readFileSync(path.join(ROOT, 'themes', f), 'utf8'))
  const s = parseSections(content)
  const t: Theme = {
    id: data.id, name: data.name, category: data.category, icon: data.icon ?? '💬', level: data.level ?? 'blue',
    urgent: !!data.urgent, order: data.order ?? 99, cases: data.cases ?? [], links: data.links ?? [],
    reviewedAt: String(data.reviewedAt), published: data.published !== false,
    firstTell: s['まず伝えること'] ?? [], misconceptions: s['よくある誤解'] ?? [], cost: s['費用・期間の目安'] ?? [],
    nextSteps: s['次にやること'] ?? [], checklist: s['初動チェックリスト'] ?? [], terms: s['用語'] ?? [],
  }
  if (!t.id || f !== `${t.id}.md`) errors.push(`themes/${f}: id とファイル名が一致しません`)
  if (!CATEGORY_ORDER.includes(t.category)) errors.push(`themes/${f}: 未知のカテゴリ「${t.category}」`)
  if (t.firstTell.length === 0 || t.firstTell.length > 3) errors.push(`themes/${f}: 「まず伝えること」は1〜3点にしてください`)
  if (t.nextSteps.length === 0 || t.nextSteps.length > 3) errors.push(`themes/${f}: 「次にやること」は1〜3点にしてください`)
  if (!/^\d{4}-\d{2}$/.test(t.reviewedAt)) errors.push(`themes/${f}: reviewedAt は YYYY-MM 形式`)
  if (t.urgent && t.checklist.length === 0) errors.push(`themes/${f}: 緊急テーマには「初動チェックリスト」が必要`)
  return t
})
const themeIds = new Set(themes.map((t) => t.id))

// ---- dialogs ----
type RawNode = { id: string; type: DialogNode['type']; shared?: boolean; text: string; why?: string; options?: string[]; show_if?: Record<string, string[]> }
const nodes: DialogNode[] = []
const shared = readYaml<{ nodes: RawNode[] }>(path.join(ROOT, 'dialogs', '_shared.yaml'))
shared.nodes.forEach((n, i) => nodes.push({ id: n.id, themeId: null, type: n.type, shared: true, text: n.text, why: n.why, options: n.options, sort: i }))
for (const f of listFiles(path.join(ROOT, 'dialogs'), '.yaml')) {
  if (f.startsWith('_')) continue
  const d = readYaml<{ theme: string; nodes: RawNode[] }>(path.join(ROOT, 'dialogs', f))
  if (!themeIds.has(d.theme)) { errors.push(`dialogs/${f}: テーマ ${d.theme} が存在しません`); continue }
  const ids = new Set<string>(shared.nodes.map((n) => n.id))
  d.nodes.forEach((n, i) => {
    if (ids.has(n.id)) errors.push(`dialogs/${f}: 質問ID ${n.id} が重複`)
    ids.add(n.id)
    if (n.type.startsWith('ask_') && n.type !== 'ask_text' && (!n.options || n.options.length < 2)) errors.push(`dialogs/${f}: ${n.id} の選択肢が2つ未満`)
    nodes.push({ id: n.id, themeId: d.theme, type: n.type, text: n.text, why: n.why, options: n.options, showIf: n.show_if, sort: i })
  })
  // show_if の参照先と選択肢の存在チェック
  for (const n of d.nodes) {
    for (const [qid, opts] of Object.entries(n.show_if ?? {})) {
      const q = [...shared.nodes, ...d.nodes].find((x) => x.id === qid)
      if (!q) { errors.push(`dialogs/${f}: ${n.id}.show_if が未知の質問 ${qid} を参照`); continue }
      for (const o of opts) if (!q.options?.includes(o)) errors.push(`dialogs/${f}: ${n.id}.show_if の選択肢「${o}」は ${qid} に存在しません`)
    }
  }
}

// ---- rules ----
const rules: LevelRule[] = []
for (const f of listFiles(path.join(ROOT, 'rules'), '.yaml')) {
  const r = readYaml<{ theme: string; rules: { id: string; if: Record<string, string[]>; level: LevelRule['level']; reason: string }[] }>(path.join(ROOT, 'rules', f))
  if (!themeIds.has(r.theme)) { errors.push(`rules/${f}: テーマ ${r.theme} が存在しません`); continue }
  const qs = nodes.filter((n) => n.themeId === r.theme || n.themeId === null)
  for (const rule of r.rules) {
    if (!rule.reason) errors.push(`rules/${f}: ${rule.id} に判定理由がありません`)
    for (const [qid, opts] of Object.entries(rule.if)) {
      const q = qs.find((x) => x.id === qid)
      if (!q) { errors.push(`rules/${f}: ${rule.id} が未知の質問 ${qid} を参照`); continue }
      for (const o of opts) if (!q.options?.includes(o)) errors.push(`rules/${f}: ${rule.id} の選択肢「${o}」は ${qid} に存在しません`)
    }
    rules.push({ id: rule.id, themeId: r.theme, if: rule.if, level: rule.level, reason: rule.reason })
  }
}

// ---- keywords / synonyms / terms ----
const kwRaw = readYaml<Record<string, { keyword: string; weight: number }[]>>(path.join(ROOT, 'keywords', '_all.yaml'))
const keywords: ThemeKeyword[] = []
for (const [themeId, list] of Object.entries(kwRaw)) {
  if (!themeIds.has(themeId)) { errors.push(`keywords: テーマ ${themeId} が存在しません`); continue }
  list.forEach((k) => keywords.push({ themeId, keyword: k.keyword, weight: k.weight }))
}
for (const id of themeIds) if (!kwRaw[id]) warn.push(`keywords: テーマ ${id} にキーワードがありません（検索でヒットしません）`)
const synonyms = readYaml<Synonym[]>(path.join(ROOT, 'synonyms.yaml'))
const termsMain = readYaml<Term[]>(path.join(ROOT, 'terms.yaml'))
const termsLegacy: Term[] = fs.existsSync(path.join(ROOT, 'terms.legacy.json')) ? JSON.parse(fs.readFileSync(path.join(ROOT, 'terms.legacy.json'), 'utf8')) : []
const termMap = new Map<string, Term>()
for (const t of [...termsLegacy, ...termsMain]) termMap.set(t.term, t)
const terms = [...termMap.values()].sort((a, b) => (a.reading ?? a.term).localeCompare(b.reading ?? b.term, 'ja'))
for (const t of themes) for (const name of t.terms) if (!termMap.has(name)) warn.push(`themes/${t.id}: 用語「${name}」が用語集にありません`)

// ---- cases ----
const cases: Case[] = listFiles(path.join(ROOT, 'cases'), '.json').map((f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'cases', f), 'utf8')))
const caseIds = new Set(cases.map((c) => c.id))
for (const t of themes) for (const cid of t.cases) if (!caseIds.has(cid)) errors.push(`themes/${t.id}: 事例 ${cid} が存在しません`)
for (const c of cases) c.themes = themes.filter((t) => t.cases.includes(c.id)).map((t) => t.id)
const industries = JSON.parse(fs.readFileSync(path.join(ROOT, 'industries.json'), 'utf8'))

// ---- output ----
if (warn.length) console.warn(warn.map((w) => `  warn: ${w}`).join('\n'))
if (errors.length) { console.error(errors.map((e) => `  error: ${e}`).join('\n')); process.exit(1) }

const bundle: ContentBundle = {
  builtAt: new Date().toISOString(),
  themes: themes.sort((a, b) => a.order - b.order), nodes, rules, keywords, synonyms, terms, cases, industries,
  categories: CATEGORY_ORDER.filter((c) => themes.some((t) => t.category === c)),
}
fs.mkdirSync('src/generated', { recursive: true })
fs.writeFileSync('src/generated/content.json', JSON.stringify(bundle))
console.log(`content.json: themes=${themes.length} nodes=${nodes.length} rules=${rules.length} keywords=${keywords.length} terms=${terms.length} cases=${cases.length} (${(fs.statSync('src/generated/content.json').size / 1024).toFixed(0)}KB)`)

if (process.argv.includes('--push')) {
  const { pushToSupabase } = await import('./push-content')
  await pushToSupabase(bundle)
}
