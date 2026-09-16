// S-005 相談ナビチャット：DBの質問ノードを吹き出しで1問ずつ出す。AIは使わない
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { useContent } from '../lib/app-context'
import { type Answers, endText, isVisible, nextNode, nodesForTheme, progress, pruneHiddenAnswers } from '../lib/engine'
import { clearThemeHearing, loadHearing, saveHearing } from '../lib/session'
import type { DialogNode } from '../lib/types'
import { TopBar } from '../components/ui'

const SKIPPED = '（とばした）'

export default function Chat() {
  const { id } = useParams()
  const { content } = useContent()
  const nav = useNavigate()
  const theme = content.themes.find((t) => t.id === id)
  const nodes = useMemo(() => (theme ? nodesForTheme(content, theme.id) : []), [content, theme])

  const [answers, setAnswers] = useState<Answers>({})
  const [seenSay, setSeenSay] = useState<Set<string>>(new Set())
  const [inherited, setInherited] = useState<Set<string>>(new Set())
  const [typing, setTyping] = useState(false)
  const [multi, setMulti] = useState<string[]>([])
  const [text, setText] = useState('')
  const bottom = useRef<HTMLDivElement>(null)

  // 復元：共通質問は他テーマの回答を引き継ぐ
  useEffect(() => {
    if (!theme) return
    const s = loadHearing()
    const own = s.byTheme[theme.id] ?? {}
    const merged: Answers = { ...s.shared, ...own }
    setAnswers(pruneHiddenAnswers(nodes, merged))
    setInherited(new Set(Object.keys(s.shared).filter((k) => own[k] === undefined)))
    setSeenSay(new Set(s.seenSay[theme.id] ?? []))
  }, [theme, nodes])

  const persist = useCallback((a: Answers, say: Set<string>) => {
    if (!theme) return
    const s = loadHearing()
    const sharedIds = new Set(nodes.filter((n) => n.shared).map((n) => n.id))
    const shared: Answers = { ...s.shared }; const own: Answers = {}
    for (const id of sharedIds) delete shared[id]
    for (const [k, v] of Object.entries(a)) (sharedIds.has(k) ? shared : own)[k] = v
    s.shared = shared; s.byTheme[theme.id] = own; s.seenSay[theme.id] = [...say]
    saveHearing(s)
  }, [theme, nodes])

  const current = useMemo(() => nextNode(nodes, answers, seenSay), [nodes, answers, seenSay])
  const prog = progress(nodes, answers)

  // 「…」を短く見せてから吹き出しを出す（考えている感。0.5秒）
  useEffect(() => {
    if (!current) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) { setTyping(false); return }
    setTyping(true); const t = setTimeout(() => setTyping(false), 500); return () => clearTimeout(t)
  }, [current?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [current?.id, typing, multi.length])

  if (!theme) return <Navigate to="/themes" replace />

  const answer = (node: DialogNode, value: string[]) => {
    const a = pruneHiddenAnswers(nodes, { ...answers, [node.id]: value })
    setAnswers(a); setMulti([]); setText('')
    setInherited((s) => { const n = new Set(s); n.delete(node.id); return n })
    persist(a, seenSay)
  }
  const proceedSay = (node: DialogNode) => { const s = new Set(seenSay); s.add(node.id); setSeenSay(s); persist(answers, s) }
  const back = () => {
    // 表示順で最後に答えた質問を取り消す。選択中だった複数選択・自由記述の入力欄もリセットする
    setMulti([]); setText('')
    const answered = nodes.filter((n) => n.type !== 'say' && answers[n.id] !== undefined && isVisible(n, answers))
    const last = answered[answered.length - 1]
    if (!last) { nav(`/themes/${theme.id}`); return }
    const next = { ...answers }; delete next[last.id]
    const a = pruneHiddenAnswers(nodes, next); setAnswers(a); persist(a, seenSay)
  }
  const restart = () => { clearThemeHearing(theme.id); const s = loadHearing(); setAnswers({ ...s.shared }); setSeenSay(new Set()); setInherited(new Set(Object.keys(s.shared))) }

  // 会話ログ：表示対象で、回答済み or 現在
  const transcript = nodes.filter((n) => isVisible(n, answers) && (n.type === 'say' ? seenSay.has(n.id) || n === current : answers[n.id] !== undefined || n === current))

  return (
    <div className="min-h-dvh flex flex-col">
      <TopBar title="相談ナビ" right={<Link to={`/themes/${theme.id}`} className="min-h-12 px-3 flex items-center text-primary font-bold text-[14px]">テーマに戻る</Link>} />
      <div className="mx-auto max-w-3xl w-full px-4 pt-3">
        <div className="h-2 rounded-full bg-surface-2 overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={prog.total} aria-valuenow={prog.done} aria-label="ヒアリングの進み具合">
          <div className="h-full bg-primary transition-all" style={{ width: `${prog.total ? (prog.done / prog.total) * 100 : 0}%` }} />
        </div>
        <p className="text-[12px] text-muted text-right mt-1">{prog.done} / {prog.total} 問　回答はこのタブ内だけに一時保存されます</p>
      </div>

      <main className="mx-auto max-w-3xl w-full px-4 pb-72 flex-1 flex flex-col gap-3 pt-2" aria-live="polite">
        <p className="text-[15px] text-ink-2 text-center"><span aria-hidden="true">{theme.icon}</span> {theme.name}</p>
        {transcript.map((n) => (
          <div key={n.id} className="flex flex-col gap-2">
            {(n !== current || !typing) && (
              <div className="flex flex-col gap-1">
                <BotName />
                <div className="bubble-bot">
                  <p className="text-[17px]">{n.text}</p>
                  {n.why && <p className="staff-only text-[13px] text-muted mt-1">📝 {n.why}</p>}
                </div>
              </div>
            )}
            {n.type !== 'say' && answers[n.id] !== undefined && (
              <div className="bubble-user text-[16px] font-bold">
                {answers[n.id].join('、')}
                {inherited.has(n.id) && <span className="block text-[12px] font-normal opacity-80">前の相談から引き継ぎました</span>}
              </div>
            )}
          </div>
        ))}
        {typing && current && <div className="flex flex-col gap-1"><BotName /><div className="bubble-bot text-muted tracking-widest" aria-label="入力中">…</div></div>}

        {!current && (
          <div className="flex flex-col gap-2 mt-2">
            <BotName /><div className="bubble-bot text-[17px]">{endText(content, theme.id)}</div>
            <Link to={`/themes/${theme.id}/result`} className="btn-primary mt-2">判定結果を見る</Link>
            <button type="button" onClick={restart} className="btn-ghost btn-sm">最初からやり直す</button>
          </div>
        )}
        <div ref={bottom} />
      </main>

      {current && !typing && (
        <div className="fixed inset-x-0 z-10 bg-bg/95 backdrop-blur border-t border-line px-4 pt-3 pb-3" style={{ bottom: 'calc(64px + env(safe-area-inset-bottom, 0px))' }}>
          <div className="mx-auto max-w-3xl flex flex-col gap-2">
            {current.type === 'say' && <button type="button" className="btn-primary" onClick={() => proceedSay(current)}>次へ</button>}
            {current.type === 'ask_single' && (
              <div className="flex flex-wrap gap-2">
                {current.options!.map((o) => <button key={o} type="button" className="chip" onClick={() => answer(current, [o])}>{o}</button>)}
              </div>
            )}
            {current.type === 'ask_multi' && (
              <>
                <div className="flex flex-wrap gap-2">
                  {current.options!.map((o) => { const on = multi.includes(o); return <button key={o} type="button" className={`chip ${on ? 'chip-on' : ''}`} aria-pressed={on} onClick={() => setMulti(on ? multi.filter((x) => x !== o) : [...multi, o])}>{on ? '✓ ' : ''}{o}</button> })}
                </div>
                <button type="button" className="btn-primary" disabled={multi.length === 0} onClick={() => answer(current, multi)}>決定（{multi.length}件）</button>
              </>
            )}
            {current.type === 'ask_text' && (
              <div className="flex gap-2">
                <label htmlFor={`t-${current.id}`} className="sr-only">{current.text}への回答</label>
                <input id={`t-${current.id}`} className="input" value={text} onChange={(e) => setText(e.target.value)} maxLength={100} />
                <button type="button" className="btn-primary w-auto px-5" disabled={!text.trim()} onClick={() => answer(current, [text.trim()])}>決定</button>
              </div>
            )}
            <div className="flex justify-between text-[15px] font-bold">
              <button type="button" onClick={back} className="min-h-11 px-2 text-primary">‹ 1つ前へ</button>
              {current.type !== 'say' && <button type="button" onClick={() => answer(current, [SKIPPED])} className="min-h-11 px-2 text-primary">この質問をとばす ›</button>}
            </div>
            <p className="text-[11px] text-muted text-center">この案内はAIではなく、登録済みの質問と回答で動いています</p>
          </div>
        </div>
      )}
    </div>
  )
}

function BotName() {
  return <span className="text-[12px] text-muted flex items-center gap-1.5"><span className="w-4 h-4 rounded-full bg-accent inline-block" aria-hidden="true" />相談ナビ</span>
}
