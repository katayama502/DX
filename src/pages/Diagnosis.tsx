// S-013 成熟度診断：1問1画面、レーダーチャート、関連テーマへ
import { useState } from 'react'
import { useContent } from '../lib/app-context'
import { DIAG_IND_AVG, DIAG_LEVELS, DIAG_QUESTIONS } from '../data/diagnosis'
import { Page, ThemeCard, TopBar } from '../components/ui'

export default function Diagnosis() {
  const { content } = useContent()
  const [ind, setInd] = useState('')
  const [ans, setAns] = useState<number[]>([])
  const i = ans.length
  const done = i >= DIAG_QUESTIONS.length
  const avg = done ? ans.reduce((a, b) => a + b, 0) / ans.length : 0
  const level = DIAG_LEVELS[Math.min(4, Math.max(0, Math.round(avg) - 1))]
  const themes = level.themes.map((t) => content.themes.find((x) => x.id === t)).filter(Boolean)

  return (
    <>
      <TopBar title="DX成熟度診断" />
      <Page>
        {!done ? (
          <>
            {i === 0 && (
              <label className="block"><span className="label">業種（参考値の比較に使います）</span>
                <select id="ind" className="input" value={ind} onChange={(e) => setInd(e.target.value)}><option value="">選ばない</option>{content.industries.map((x) => <option key={x.id} value={x.id}>{x.icon} {x.name}</option>)}</select>
              </label>
            )}
            <p className="text-[13px] text-muted">{i + 1} / {DIAG_QUESTIONS.length} 問</p>
            <h1 className="text-xl">{DIAG_QUESTIONS[i].q}</h1>
            <div className="flex flex-col gap-2">
              {DIAG_QUESTIONS[i].opts.map((o, k) => <button key={o} type="button" className="btn-secondary justify-start text-left" onClick={() => setAns([...ans, k + 1])}>{o}</button>)}
            </div>
            {i > 0 && <button type="button" className="btn-ghost btn-sm" onClick={() => setAns(ans.slice(0, -1))}>‹ 1つ前へ</button>}
          </>
        ) : (
          <>
            <div className="card text-center">
              <p className="text-[14px] text-muted">総合スコア</p>
              <p className="text-5xl font-bold text-primary">{avg.toFixed(1)}<span className="text-lg text-muted"> / 5</span></p>
              <p className="font-bold text-xl mt-1">{level.name}</p>
              <p className="text-[15px] text-ink-2">{level.desc}</p>
              <p className="text-[13px] text-muted mt-2">{ind ? content.industries.find((x) => x.id === ind)?.name : '全業種'}平均（参考値）：{DIAG_IND_AVG[ind] ?? 3.0}</p>
            </div>
            <Radar values={ans} />
            {themes.length > 0 && <section className="flex flex-col gap-2"><h2 className="text-[14px] font-bold text-muted">おすすめの相談テーマ</h2>{themes.map((t) => <ThemeCard key={t!.id} theme={t!} />)}</section>}
            <button type="button" className="btn-secondary" onClick={() => setAns([])}>もう一度診断する</button>
            <p className="text-[12px] text-muted">※ 業種別平均は根拠データの出典を整理するまでの参考値です。診断結果は保存されません。</p>
          </>
        )}
      </Page>
    </>
  )
}

function Radar({ values }: { values: number[] }) {
  const n = values.length, cx = 150, cy = 150, r = 110
  const pt = (v: number, k: number) => { const a = (Math.PI * 2 * k) / n - Math.PI / 2; return [cx + Math.cos(a) * r * (v / 5), cy + Math.sin(a) * r * (v / 5)] }
  const poly = values.map((v, k) => pt(v, k).join(',')).join(' ')
  return (
    <svg viewBox="0 0 300 300" className="w-full max-w-xs mx-auto" role="img" aria-label="6軸のレーダーチャート">
      {[1, 2, 3, 4, 5].map((g) => <polygon key={g} points={values.map((_, k) => pt(g, k).join(',')).join(' ')} fill="none" stroke="#d6dde5" />)}
      <polygon points={poly} fill="#1f4e8c" fillOpacity=".25" stroke="#1f4e8c" strokeWidth="2" />
      {DIAG_QUESTIONS.map((q, k) => { const [x, y] = pt(6.2, k); return <text key={q.key} x={x} y={y} fontSize="11" textAnchor="middle" dominantBaseline="middle" fill="#4b5866">{q.axis}</text> })}
    </svg>
  )
}
