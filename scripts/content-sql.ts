// ContentBundle を upsert SQL に変換する（Supabase MCP / SQL Editor から投入する用途）。
//   npx tsx scripts/content-sql.ts <出力ディレクトリ>
import fs from 'node:fs'
import path from 'node:path'
import type { ContentBundle } from '../src/lib/types'

const outDir = process.argv[2] ?? 'dist-sql'
const b: ContentBundle = JSON.parse(fs.readFileSync('src/generated/content.json', 'utf8'))
fs.mkdirSync(outDir, { recursive: true })

const q = (v: unknown): string => {
  if (v === null || v === undefined) return 'null'
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (typeof v === 'number') return String(v)
  return `'${String(v).replace(/'/g, "''")}'`
}
const arr = (v: string[]) => `array[${v.map(q).join(',')}]::text[]`
const jsonb = (v: unknown) => `${q(JSON.stringify(v))}::jsonb`
const upsert = (table: string, cols: string[], rows: string[][], conflict: string) => {
  if (!rows.length) return ''
  const set = cols.filter((c) => !conflict.split(',').includes(c)).map((c) => `${c} = excluded.${c}`).join(', ')
  return `insert into public.${table} (${cols.join(', ')}) values\n${rows.map((r) => `  (${r.join(', ')})`).join(',\n')}\non conflict (${conflict}) do update set ${set};\n`
}

let core = 'begin;\n'
core += upsert('industries', ['id', 'name', 'icon', 'sort'], b.industries.map((i, idx) => [q(i.id), q(i.name), q(i.icon), String(idx)]), 'id')
core += upsert('themes', ['id', 'name', 'category', 'icon', 'default_level', 'urgent', 'sort', 'case_ids', 'links', 'reviewed_at', 'published', 'first_tell', 'misconceptions', 'cost', 'next_steps', 'checklist', 'term_names'],
  b.themes.map((t) => [q(t.id), q(t.name), q(t.category), q(t.icon), q(t.level), q(!!t.urgent), String(t.order), arr(t.cases), jsonb(t.links), q(`${t.reviewedAt}-01`), q(t.published), arr(t.firstTell), arr(t.misconceptions), arr(t.cost), arr(t.nextSteps), arr(t.checklist), arr(t.terms)]), 'id')
core += upsert('questions', ['id', 'theme_id', 'type', 'shared', 'text', 'why', 'options', 'show_if', 'sort'],
  b.nodes.map((n) => [q(n.id), q(n.themeId), q(n.type), q(!!n.shared), q(n.text), q(n.why ?? null), arr(n.options ?? []), n.showIf ? jsonb(n.showIf) : 'null', String(n.sort)]), 'id')
core += upsert('level_rules', ['id', 'theme_id', 'if_conditions', 'then_level', 'reason'], b.rules.map((r) => [q(r.id), q(r.themeId), jsonb(r.if), q(r.level), q(r.reason)]), 'id')
core += 'delete from public.theme_keywords;\n'
core += upsert('theme_keywords', ['theme_id', 'keyword', 'weight'], b.keywords.map((k) => [q(k.themeId), q(k.keyword), String(k.weight)]), 'theme_id,keyword')
core += upsert('terms', ['term', 'reading', 'description', 'variants'], b.terms.map((t) => [q(t.term), q(t.reading ?? null), q(t.description), arr(t.variants ?? [])]), 'term')
core += 'delete from public.synonyms;\n'
core += upsert('synonyms', ['canonical', 'variant'], b.synonyms.flatMap((s) => s.variants.map((v) => [q(s.canonical), q(v)])), 'canonical,variant')
core += 'commit;\n'
fs.writeFileSync(path.join(outDir, '01_core.sql'), core)

const CH = 90
for (let i = 0; i < b.cases.length; i += CH) {
  const chunk = b.cases.slice(i, i + CH)
  const sql = 'begin;\n' + upsert('cases', ['id', 'industry', 'no', 'stage', 'title', 'summary', 'budget', 'tools', 'detail', 'theme_ids', 'type', 'reviewed_at', 'generated', 'published'],
    chunk.map((c) => [q(c.id), q(c.industry), String(c.no), String(c.stage), q(c.title), q(c.summary), String(c.budget), arr(c.tools), jsonb(c.detail), arr(c.themes), q(c.type), q(`${c.reviewedAt}-01`), q(c.generated), 'true']), 'id') + 'commit;\n'
  fs.writeFileSync(path.join(outDir, `02_cases_${String(i / CH + 1).padStart(2, '0')}.sql`), sql)
}
console.log(fs.readdirSync(outDir).map((f) => `${f} ${(fs.statSync(path.join(outDir, f)).size / 1024).toFixed(0)}KB`).join('\n'))
