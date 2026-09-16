// ContentBundle を Supabase の各テーブルへ upsert する（service role キー必須。ブラウザからは呼ばない）
import { createClient } from '@supabase/supabase-js'
import type { ContentBundle } from '../src/lib/types'

export async function pushToSupabase(b: ContentBundle) {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY を環境変数で指定してください')
  const sb = createClient(url, key, { auth: { persistSession: false } })
  const up = async (table: string, rows: unknown[], onConflict: string) => {
    if (rows.length === 0) return
    const { error } = await sb.from(table).upsert(rows as never, { onConflict })
    if (error) throw new Error(`${table}: ${error.message}`)
    console.log(`  ${table}: ${rows.length}`)
  }
  await up('themes', b.themes.map((t) => ({
    id: t.id, name: t.name, category: t.category, icon: t.icon, default_level: t.level, urgent: !!t.urgent, sort: t.order,
    case_ids: t.cases, links: t.links, reviewed_at: `${t.reviewedAt}-01`, published: t.published,
    first_tell: t.firstTell, misconceptions: t.misconceptions, cost: t.cost, next_steps: t.nextSteps, checklist: t.checklist, term_names: t.terms,
  })), 'id')
  await up('questions', b.nodes.map((n) => ({ id: n.id, theme_id: n.themeId, type: n.type, shared: !!n.shared, text: n.text, why: n.why ?? null, options: n.options ?? [], show_if: n.showIf ?? null, sort: n.sort })), 'key')
  await up('level_rules', b.rules.map((r) => ({ id: r.id, theme_id: r.themeId, if_conditions: r.if, then_level: r.level, reason: r.reason })), 'id')
  await sb.from('theme_keywords').delete().neq('theme_id', '')
  await up('theme_keywords', b.keywords.map((k) => ({ theme_id: k.themeId, keyword: k.keyword, weight: k.weight })), 'theme_id,keyword')
  await up('terms', b.terms.map((t) => ({ term: t.term, reading: t.reading ?? null, description: t.description, variants: t.variants ?? [] })), 'term')
  await sb.from('synonyms').delete().neq('canonical', '')
  await up('synonyms', b.synonyms.flatMap((s) => s.variants.map((v) => ({ canonical: s.canonical, variant: v }))), 'canonical,variant')
  await up('cases', b.cases.map((c) => ({ id: c.id, industry: c.industry, no: c.no, stage: c.stage, title: c.title, summary: c.summary, budget: c.budget, tools: c.tools, detail: c.detail, theme_ids: c.themes, type: c.type, reviewed_at: `${c.reviewedAt}-01`, generated: c.generated, published: true })), 'id')
  await up('industries', b.industries.map((i, idx) => ({ id: i.id, name: i.name, icon: i.icon, sort: idx })), 'id')
  console.log('push complete')
}
