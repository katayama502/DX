// S-006 判定結果：レベルを最上部に大きく。理由は必ず1行以上。主ボタンはレベルで変わる
import { useEffect, useMemo } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useApp, useContent } from '../lib/app-context'
import { answerSummary, buildSummaryText, judge, nextNode, nodesForTheme, visibleAnswers } from '../lib/engine'
import { getConsultationId, loadHearing } from '../lib/session'
import { LEVEL_META } from '../lib/types'
import { Bullets, Disclaimer, LevelBadge, Page, ReviewedNote, Section, TopBar, copyText, useToast } from '../components/ui'

export default function Result() {
  const { id } = useParams()
  const { content, session } = useContent()
  const { backend, access } = useApp()
  const [toast, showToast] = useToast()
  const theme = content.themes.find((t) => t.id === id)
  const hearing = loadHearing()
  const rawAnswers = useMemo(() => (theme ? { ...hearing.shared, ...(hearing.byTheme[theme.id] ?? {}) } : {}), [theme, hearing.shared, hearing.byTheme])
  const nodes = useMemo(() => (theme ? nodesForTheme(content, theme.id) : []), [content, theme])
  const answers = useMemo(() => visibleAnswers(nodes, rawAnswers), [nodes, rawAnswers])
  const seenSay = useMemo(() => new Set(theme ? (hearing.seenSay[theme.id] ?? []) : []), [theme, hearing.seenSay])
  const complete = !!theme && nextNode(nodes, answers, seenSay) === null
  const j = useMemo(() => (theme ? judge(theme, content.rules, answers) : null), [theme, content.rules, answers])
  useEffect(() => {
    if (!theme || !complete || access !== 'ok') return
    const k = `navi.counted.hearing.${getConsultationId(theme.id)}`
    try {
      if (!sessionStorage.getItem(k)) {
        sessionStorage.setItem(k, '1')
        void backend.bumpUsage('hearings_done').catch(() => { sessionStorage.removeItem(k) })
      }
    } catch { /* noop */ }
  }, [theme, complete, access, backend])
  if (!theme || !j) return <Navigate to="/themes" replace />
  if (!complete) return <Navigate to={`/themes/${theme.id}/chat`} replace />

  const qa = answerSummary(nodes, answers)
  const meta = LEVEL_META[j.level]
  const copySummary = async () => {
    const ok = await copyText(buildSummaryText({ date: new Date().toLocaleDateString('ja-JP'), orgName: session.org.name, staffName: session.user.name, theme, judgement: j, qa }))
    showToast(ok ? '記録用のテキストをコピーしました' : 'コピーできませんでした')
  }

  return (
    <>
      <TopBar title="判定結果" />
      <Page>
        <div className={`rounded-2xl px-5 py-5 text-center lv-${j.level}`}>
          <LevelBadge level={j.level} size="lg" />
          <p className="mt-2 font-medium">{meta.hint}</p>
        </div>

        {j.level === 'urgent' && theme.checklist.length > 0 && (
          <section className="card border-lv-urgent">
            <h2 className="text-[18px] text-lv-urgent mb-2">🚨 初動チェックリスト（上から順に）</h2>
            <Bullets items={theme.checklist} numbered />
            <div className="mt-3 flex flex-col gap-2">{theme.links.map((l) => <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className="btn-secondary btn-sm">{l.name} ↗</a>)}</div>
          </section>
        )}

        <section className="card">
          <h2 className="text-[16px] text-muted mb-1">この判定になった理由</h2>
          <Bullets items={j.reasons} />
        </section>

        <section className="card">
          <h2 className="text-[16px] text-muted mb-1">その場で伝えられること</h2>
          <Bullets items={theme.firstTell} />
        </section>

        {(j.level === 'red' || j.level === 'urgent') ? (
          <Link to={`/themes/${theme.id}/ticket`} className="btn-primary">📝 相談票を作る</Link>
        ) : (
          <Link to={`/themes/${theme.id}/onepager`} className="btn-accent">🖨 1枚資料を作る</Link>
        )}
        {j.level === 'yellow' && <p className="text-center text-[15px] text-ink-2">資料を渡して、<strong>2週間後を目安</strong>に再相談を案内しましょう</p>}
        <div className="grid grid-cols-2 gap-2">
          {(j.level === 'red' || j.level === 'urgent') ? <Link to={`/themes/${theme.id}/onepager`} className="btn-secondary btn-sm">🖨 1枚資料</Link> : <Link to={`/themes/${theme.id}/ticket`} className="btn-secondary btn-sm">📝 相談票</Link>}
          <button type="button" onClick={copySummary} className="btn-secondary btn-sm">📋 記録用にコピー</button>
        </div>

        <Section title={`回答のまとめ（${qa.length}問）`} defaultOpen={false}>
          <dl className="flex flex-col gap-2 text-[15px]">{qa.map((x, i) => <div key={i}><dt className="text-muted">{x.q}</dt><dd className="font-bold">{x.a}</dd></div>)}</dl>
          <Link to={`/themes/${theme.id}/chat`} className="btn-ghost btn-sm mt-3">回答を修正する</Link>
        </Section>
        <ReviewedNote reviewedAt={theme.reviewedAt} />
        <Disclaimer />
      </Page>
      {toast}
    </>
  )
}
