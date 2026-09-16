// S-010 事例一覧・S-011 事例詳細（既存360件の移植）
import { useMemo } from 'react'
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom'
import { useContent } from '../lib/app-context'
import type { Case, Industry } from '../lib/types'
import { BUDGET_LABELS, STAGE_LABELS } from '../lib/types'
import { Bullets, Disclaimer, Notice, Page, ReviewedNote, Section, ThemeCard, TopBar } from '../components/ui'

export function CaseRow({ c, industries }: { c: Case; industries: Industry[] }) {
  const ind = industries.find((i) => i.id === c.industry)
  return (
    <Link to={`/cases/${c.id}`} className={`card hover:border-primary flex items-center gap-3 ${c.type === 'regional' ? 'border-accent' : ''}`}>
      <span className="text-2xl w-9 text-center" aria-hidden="true">{c.type === 'regional' ? '📍' : ind?.icon}</span>
      <span className="flex-1 min-w-0">
        <span className="block font-bold text-[16px] leading-snug">{c.title}</span>
        <span className="block text-[13px] text-muted">{c.type === 'regional' ? '地域事例' : ind?.name}・{STAGE_LABELS[c.stage].split(' ')[0]}・{BUDGET_LABELS[c.budget]}</span>
      </span>
      <span className="text-muted text-2xl" aria-hidden="true">›</span>
    </Link>
  )
}

export default function CaseList() {
  const { content } = useContent()
  const [sp, setSp] = useSearchParams()
  const ind = sp.get('ind') ?? ''
  const stage = sp.get('stage') ?? ''
  const budget = sp.get('budget') ?? ''
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); setSp(n) }
  const list = useMemo(() => content.cases.filter((c) => (!ind || c.industry === ind) && (!stage || String(c.stage) === stage) && (!budget || String(c.budget) === budget)), [content.cases, ind, stage, budget])
  const regional = list.filter((c) => c.type === 'regional')
  const model = list.filter((c) => c.type === 'model').slice(0, 60)
  return (
    <>
      <TopBar title="事例" back={false} />
      <Page>
        <div className="grid grid-cols-3 gap-2">
          <select aria-label="業種" className="input min-h-12 text-[14px] px-2" value={ind} onChange={(e) => set('ind', e.target.value)}>
            <option value="">業種：すべて</option>{content.industries.map((i) => <option key={i.id} value={i.id}>{i.icon} {i.name}</option>)}
          </select>
          <select aria-label="段階" className="input min-h-12 text-[14px] px-2" value={stage} onChange={(e) => set('stage', e.target.value)}>
            <option value="">段階：すべて</option>{[1, 2, 3].map((s) => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
          </select>
          <select aria-label="予算" className="input min-h-12 text-[14px] px-2" value={budget} onChange={(e) => set('budget', e.target.value)}>
            <option value="">予算：すべて</option>{BUDGET_LABELS.map((b, i) => <option key={i} value={i}>{b}</option>)}
          </select>
        </div>
        <p className="text-[13px] text-muted">{list.length}件</p>
        {regional.length > 0 && <section className="flex flex-col gap-2"><h2 className="text-[14px] font-bold text-muted">📍 地域の事例</h2>{regional.map((c) => <CaseRow key={c.id} c={c} industries={content.industries} />)}</section>}
        <section className="flex flex-col gap-2">
          <h2 className="text-[14px] font-bold text-muted">モデルケース</h2>
          {model.map((c) => <CaseRow key={c.id} c={c} industries={content.industries} />)}
          {list.filter((c) => c.type === 'model').length > 60 && <p className="text-[13px] text-muted text-center">絞り込むと、さらに表示されます</p>}
        </section>
      </Page>
    </>
  )
}

export function CaseDetail() {
  const { id } = useParams()
  const { content } = useContent()
  const c = content.cases.find((x) => x.id === id)
  if (!c) return <Navigate to="/cases" replace />
  const ind = content.industries.find((i) => i.id === c.industry)
  const themes = c.themes.map((t) => content.themes.find((x) => x.id === t)).filter(Boolean)
  const tool = c.detail.tool
  return (
    <>
      <TopBar title="事例詳細" />
      <Page>
        {c.type === 'model' ? <Notice>ℹ 本事例は導入イメージを示すモデルケースです（実在の企業の事例ではありません）</Notice> : <Notice>📍 地域事例（取材日 {c.reviewedAt}）</Notice>}
        <h1 className="text-2xl">{c.title}</h1>
        <div className="flex flex-wrap gap-2 text-[13px]">
          <span className="chip !min-h-8 !text-[13px] !border-line-strong !text-ink-2">{ind?.icon} {ind?.name}</span>
          <span className="chip !min-h-8 !text-[13px] !border-line-strong !text-ink-2">{STAGE_LABELS[c.stage]}</span>
          <span className="chip !min-h-8 !text-[13px] !border-line-strong !text-ink-2">{BUDGET_LABELS[c.budget]}</span>
        </div>
        <p className="text-[17px]">{c.summary}</p>
        {c.detail.points.length > 0 && <Section title="ポイント"><Bullets items={c.detail.points} /></Section>}
        {c.detail.steps.length > 0 && <Section title="導入の手順"><ol className="list-decimal pl-6 flex flex-col gap-2">{c.detail.steps.map((s, i) => <li key={i}><strong>{s.title}</strong> {s.desc}</li>)}</ol></Section>}
        {tool && (
          <Section title={`使うツール：${tool.name}`}>
            <p className="text-[15px] mb-2">{tool.what}</p>
            <p className="text-[15px] text-ink-2">{tool.how}</p>
            {tool.url && <a href={tool.url} target="_blank" rel="noreferrer" className="btn-secondary btn-sm mt-3">{tool.name} の公式サイト ↗</a>}
            <p className="text-[12px] text-muted mt-2">特定の製品を推奨するものではありません。同種のツールは複数あります。</p>
          </Section>
        )}
        {c.detail.tips && <Section title="コツ"><p className="text-[15px]">{c.detail.tips}</p></Section>}
        {!c.generated && c.detail.points.length === 0 && <p className="text-[13px] text-muted">※ この事例の詳細（ポイント・手順・コツ）は準備中です。</p>}
        {themes.length > 0 && <section className="flex flex-col gap-2"><h2 className="text-[14px] font-bold text-muted">関連する相談テーマ</h2>{themes.map((t) => <ThemeCard key={t!.id} theme={t!} />)}</section>}
        <ReviewedNote reviewedAt={c.reviewedAt} />
        <Disclaimer />
      </Page>
    </>
  )
}
