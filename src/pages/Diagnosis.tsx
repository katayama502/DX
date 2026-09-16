// S-013 成熟度診断・ROI試算：1問1画面、レーダーチャート、関連テーマ、投資対効果の概算（F-011・既存移植）
import { useMemo, useState } from 'react'
import { useContent } from '../lib/app-context'
import { DIAG_IND_AVG, DIAG_LEVELS, DIAG_QUESTIONS } from '../data/diagnosis'
import { Page, Section, ThemeCard, TopBar } from '../components/ui'

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
            <RoiCalculator initialSavingRate={Math.max(10, 60 - Math.round(avg) * 10)} />
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

/** ROI試算：削減率・従業員数などから月間の効果を概算する（既存 DX事例360 のロジックを移植） */
function RoiCalculator({ initialSavingRate }: { initialSavingRate: number }) {
  const [emp, setEmp] = useState(10)
  const [hours, setHours] = useState(20)
  const [wage, setWage] = useState(1500)
  const [sales, setSales] = useState('')
  const [savingRate, setSavingRate] = useState(initialSavingRate)
  const [revenueRate, setRevenueRate] = useState(0)
  const [calculated, setCalculated] = useState(false)

  const result = useMemo(() => {
    const totalHours = Math.max(0, emp) * Math.max(0, hours)
    const savedHours = Math.round((totalHours * savingRate) / 100)
    const savedCost = savedHours * Math.max(0, wage)
    const monthlySales = sales ? Number(sales) * 10000 : 0
    const revenueGain = monthlySales > 0 && revenueRate > 0 ? Math.round((monthlySales * revenueRate) / 100) : 0
    const annualSaving = (savedCost + revenueGain) * 12
    return { savedHours, savedCost, revenueGain, annualSaving }
  }, [emp, hours, wage, sales, savingRate, revenueRate])

  return (
    <Section title="💹 投資対効果（ROI）を試算する" defaultOpen={false}>
      <p className="text-[14px] text-ink-2 mb-3">数字を入れて、DXツール導入の効果を大まかにイメージするための試算です。実際の効果を保証するものではありません。</p>
      <div className="grid grid-cols-2 gap-3">
        <label className="block"><span className="label">従業員数（人）</span><input type="number" min={1} className="input" value={emp} onChange={(e) => setEmp(Number(e.target.value))} /></label>
        <label className="block"><span className="label">関連業務（時間/月・1人）</span><input type="number" min={1} className="input" value={hours} onChange={(e) => setHours(Number(e.target.value))} /></label>
        <label className="block"><span className="label">平均時給（円）</span><input type="number" min={1} className="input" value={wage} onChange={(e) => setWage(Number(e.target.value))} /></label>
        <label className="block"><span className="label">月間売上（万円・任意）</span><input type="number" min={0} className="input" value={sales} onChange={(e) => setSales(e.target.value)} placeholder="例：500" /></label>
        <label className="block"><span className="label">見込み削減率（%）</span><input type="number" min={0} max={95} className="input" value={savingRate} onChange={(e) => setSavingRate(Number(e.target.value))} /></label>
        <label className="block"><span className="label">見込み売上向上率（%・任意）</span><input type="number" min={0} max={200} className="input" value={revenueRate} onChange={(e) => setRevenueRate(Number(e.target.value))} /></label>
      </div>
      <button type="button" className="btn-primary mt-3" onClick={() => setCalculated(true)}>📊 試算する</button>
      {calculated && (
        <div className="grid grid-cols-3 gap-2 mt-3">
          <div className="card text-center"><p className="text-2xl font-bold text-primary">{result.savedHours.toLocaleString()}h</p><p className="text-[12px] text-muted">月間削減時間</p></div>
          <div className="card text-center"><p className="text-2xl font-bold text-primary">約{Math.round(result.savedCost / 10000)}万円</p><p className="text-[12px] text-muted">月間コスト削減額</p></div>
          <div className="card text-center"><p className="text-2xl font-bold text-primary">約{Math.round(result.annualSaving / 10000)}万円</p><p className="text-[12px] text-muted">年間の効果（概算）</p></div>
        </div>
      )}
      <p className="text-[12px] text-muted mt-2">※ 削減率・売上向上率はあくまで見込み値です。導入前に、同業他社の事例や提供元の実績値もあわせてご確認ください。</p>
    </Section>
  )
}
