// S-004 テーマ詳細：「まず伝えること」がファーストビューに収まる。主ボタンは「ヒアリングを始める」1つ
import { useEffect } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useApp, useContent } from '../lib/app-context'
import { Bullets, Disclaimer, LevelBadge, Notice, Page, ReviewedNote, Section, TopBar } from '../components/ui'
import { LEVEL_META } from '../lib/types'
import { CaseRow } from './Cases'
import { ShowModeToggle } from '../components/ShowMode'

export default function ThemeDetail() {
  const { id } = useParams()
  const { content } = useContent()
  const { backend } = useApp()
  const theme = content.themes.find((t) => t.id === id)
  useEffect(() => { if (theme) backend.bumpUsage('theme_views') }, [theme, backend])
  if (!theme) return <Navigate to="/themes" replace />
  const cases = theme.cases.map((cid) => content.cases.find((c) => c.id === cid)).filter(Boolean).slice(0, 3)
  const terms = theme.terms.map((n) => content.terms.find((t) => t.term === n)).filter(Boolean)

  return (
    <>
      <TopBar title="相談テーマ" />
      <Page>
        <div className="flex items-start gap-3">
          <span className="text-4xl" aria-hidden="true">{theme.icon}</span>
          <h1 className="text-2xl flex-1">{theme.name}</h1>
        </div>
        <div className={`rounded-2xl px-4 py-3 lv-${theme.level}`}>
          <LevelBadge level={theme.level} />
          <p className="text-[14px] mt-1 font-medium">{LEVEL_META[theme.level].hint}</p>
        </div>
        {theme.urgent && theme.checklist.length > 0 && (
          <section className="card border-lv-urgent bg-lv-urgent-soft/40">
            <h2 className="text-[18px] text-lv-urgent mb-2">🚨 初動チェックリスト（上から順に）</h2>
            <ol className="flex flex-col gap-2">
              {theme.checklist.map((c, i) => (
                <li key={i} className="flex gap-3 items-start"><input type="checkbox" id={`chk-${i}`} className="mt-1.5 w-6 h-6 shrink-0 accent-lv-urgent" /><label htmlFor={`chk-${i}`} className="text-[16px]">{c}</label></li>
              ))}
            </ol>
            {theme.links.length > 0 && (
              <div className="mt-3 flex flex-col gap-2">
                {theme.links.map((l) => <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className="btn-secondary btn-sm">{l.name} ↗</a>)}
              </div>
            )}
          </section>
        )}

        <section className="card border-l-4 border-l-primary">
          <h2 className="text-[18px] mb-2">まず伝えること</h2>
          <ol className="flex flex-col gap-2">
            {theme.firstTell.map((t, i) => (
              <li key={i} className="flex gap-3 text-[17px]"><span className="shrink-0 w-7 h-7 rounded-full bg-primary text-white font-bold text-[15px] flex items-center justify-center">{i + 1}</span><span>{t}</span></li>
            ))}
          </ol>
        </section>

        <Link to={`/themes/${theme.id}/chat`} className="btn-primary">💬 ヒアリングを始める</Link>
        <ShowModeToggle />

        {theme.misconceptions.length > 0 && <Section title="よくある誤解" defaultOpen={false}><Bullets items={theme.misconceptions} /></Section>}
        {theme.cost.length > 0 && <Section title="費用・期間の目安" defaultOpen={false}><Bullets items={theme.cost} /><div className="mt-2"><ReviewedNote reviewedAt={theme.reviewedAt} /></div></Section>}
        {cases.length > 0 && (
          <Section title={`関連事例（${cases.length}件）`} defaultOpen={false}>
            <div className="flex flex-col gap-2">{cases.map((c) => <CaseRow key={c!.id} c={c!} industries={content.industries} />)}</div>
          </Section>
        )}
        {!theme.urgent && theme.links.length > 0 && (
          <Section title="関連する制度・公式情報" defaultOpen={false}>
            <div className="flex flex-col gap-2">{theme.links.map((l) => <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className="btn-secondary btn-sm">{l.name} ↗</a>)}</div>
            <p className="text-[13px] text-muted mt-2">外部サイトが開きます</p>
          </Section>
        )}
        {terms.length > 0 && (
          <Section title="用語の説明" defaultOpen={false}>
            <dl className="flex flex-col gap-3">{terms.map((t) => <div key={t!.term}><dt className="font-bold">{t!.term}{t!.reading && <span className="text-muted font-normal text-[13px]">（{t!.reading}）</span>}</dt><dd className="text-[15px] text-ink-2">{t!.description}</dd></div>)}</dl>
          </Section>
        )}

        <Link to={`/themes/${theme.id}/onepager`} className="btn-accent">🖨 1枚資料を作る</Link>
        {theme.level === 'red' && !theme.urgent && <Notice kind="warn">このテーマは専門家の判断が必要になることが多い相談です。ヒアリング後に相談票を作成できます。</Notice>}
        <ReviewedNote reviewedAt={theme.reviewedAt} />
        <Disclaimer />
      </Page>
    </>
  )
}
