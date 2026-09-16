// S-007 相談票：サーバーに保存しない。送信は相談員自身のメールソフト（mailto:）で行う
import { useEffect, useMemo, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { useApp, useContent } from '../lib/app-context'
import { answerSummary, buildSummaryText, judge, nodesForTheme } from '../lib/engine'
import { loadHearing } from '../lib/session'
import type { EscalationContact } from '../lib/types'
import { LEVEL_META } from '../lib/types'
import { Field, LevelBadge, Notice, Page, TopBar, copyText, useToast } from '../components/ui'

export default function Ticket() {
  const { id } = useParams()
  const { content, session } = useContent()
  const { backend } = useApp()
  const [toast, showToast] = useToast()
  const theme = content.themes.find((t) => t.id === id)
  const hearing = loadHearing()
  const answers = useMemo(() => (theme ? { ...hearing.shared, ...(hearing.byTheme[theme.id] ?? {}) } : {}), [theme, hearing.shared, hearing.byTheme])
  const nodes = useMemo(() => (theme ? nodesForTheme(content, theme.id) : []), [content, theme])
  const j = useMemo(() => (theme ? judge(theme, content.rules, answers) : null), [theme, content.rules, answers])
  const [contacts, setContacts] = useState<EscalationContact[] | null>(null)
  const [consent, setConsent] = useState(false)
  const [bizName, setBizName] = useState('')
  const [bizContact, setBizContact] = useState('')
  const [opinion, setOpinion] = useState('')
  const [to, setTo] = useState<string>('')
  useEffect(() => { backend.listContacts(session.org.code).then((c) => { setContacts(c); if (c[0]) setTo(c[0].id) }).catch(() => setContacts([])) }, [backend, session.org.code])
  if (!theme || !j) return <Navigate to="/themes" replace />

  const qa = answerSummary(nodes, answers)
  const date = new Date().toLocaleDateString('ja-JP')
  const body = () => {
    const base = buildSummaryText({ date, orgName: session.org.name, staffName: session.user.name, theme, judgement: j, qa, opinion: opinion.trim() || undefined })
    const biz = consent && (bizName.trim() || bizContact.trim()) ? `\n■事業者（同意取得済み）\n${bizName.trim()}${bizContact.trim() ? `　${bizContact.trim()}` : ''}\n` : ''
    return `【相談票】${theme.name}\n${base}${biz}`
  }
  const contact = contacts?.find((c) => c.id === to)
  const mailto = contact ? `mailto:${encodeURIComponent(contact.email)}?subject=${encodeURIComponent(`【DX相談票】${theme.name}（${session.org.name}）`)}&body=${encodeURIComponent(body())}` : ''
  const onSend = () => backend.bumpUsage('tickets_made')
  const copy = async () => { showToast((await copyText(body())) ? '相談票をコピーしました' : 'コピーできませんでした'); onSend() }
  const print = () => { onSend(); window.print() }

  return (
    <>
      <TopBar title="相談票" />
      <Page>
        <Notice kind="warn">この内容はサーバーに保存されません。送信は自分のメールソフトで行います。</Notice>
        <section className="card no-print">
          <p className="label">自動で入ります</p>
          <p className="text-[15px]">作成日 {date}　{session.org.name}　{session.user.name || '（氏名未設定）'}</p>
          <p className="text-[15px] mt-1">テーマ：{theme.name}　<LevelBadge level={j.level} size="sm" /></p>
        </section>

        <section className="card flex flex-col gap-3 no-print">
          <p className="label">事業者名・連絡先（任意）</p>
          <label className="flex items-start gap-3 text-[15px]">
            <input type="checkbox" id="consent" className="mt-1 w-6 h-6 shrink-0 accent-primary" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>事業者から、連絡先を専門相談窓口に伝えることの同意を得ました</span>
          </label>
          <Field label="事業者名"><input id="bizName" className="input" value={bizName} onChange={(e) => setBizName(e.target.value)} disabled={!consent} maxLength={100} /></Field>
          <Field label="連絡先（電話・メール）"><input id="bizContact" className="input" value={bizContact} onChange={(e) => setBizContact(e.target.value)} disabled={!consent} maxLength={100} /></Field>
        </section>

        <section className="card no-print">
          <Field label={`相談員の所見（${opinion.length}/400字）`}>
            <textarea id="opinion" className="input min-h-32 py-3" value={opinion} onChange={(e) => setOpinion(e.target.value.slice(0, 400))} placeholder="気になった点、事業者の希望、これまでの経緯など" />
          </Field>
        </section>

        {contacts === null ? null : contacts.length === 0 ? (
          <Notice kind="warn">専門相談窓口が未設定です。団体管理者に窓口の設定を依頼してください。（コピー・印刷は利用できます）</Notice>
        ) : (
          <section className="card flex flex-col gap-3 no-print">
            <Field label="送り先（専門相談窓口）">
              <select id="to" className="input" value={to} onChange={(e) => setTo(e.target.value)}>
                {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}{c.fields.length ? `（${c.fields.join('・')}）` : ''}</option>)}
              </select>
            </Field>
            <a href={mailto} className="btn-primary" onClick={onSend}>✉ メールで送る（自分のメールソフトが開きます）</a>
          </section>
        )}
        <div className="grid grid-cols-2 gap-2 no-print">
          <button type="button" className="btn-secondary btn-sm" onClick={copy}>📋 コピー</button>
          <button type="button" className="btn-secondary btn-sm" onClick={print}>📄 印刷・PDF</button>
        </div>

        {/* 印刷用レイアウト */}
        <div className="print-only print-sheet">
          <h1 className="text-xl mb-2">相談票　{theme.name}</h1>
          <table className="w-full text-[11pt] border-collapse">
            <tbody>
              <tr><th className="text-left border p-1 w-32">作成日</th><td className="border p-1">{date}</td></tr>
              <tr><th className="text-left border p-1">作成団体・担当</th><td className="border p-1">{session.org.name}　{session.user.name}</td></tr>
              <tr><th className="text-left border p-1">対応レベル</th><td className="border p-1">{LEVEL_META[j.level].icon} {LEVEL_META[j.level].label}　理由：{j.reasons.join('／')}</td></tr>
              {consent && (bizName || bizContact) && <tr><th className="text-left border p-1">事業者（同意済）</th><td className="border p-1">{bizName}　{bizContact}</td></tr>}
            </tbody>
          </table>
          <h2 className="text-[12pt] mt-3 mb-1">ヒアリング内容</h2>
          <ul className="list-disc pl-5 text-[10.5pt]">{qa.map((x, i) => <li key={i}>{x.q} → {x.a}</li>)}</ul>
          <h2 className="text-[12pt] mt-3 mb-1">既に伝えた内容</h2>
          <ul className="list-disc pl-5 text-[10.5pt]">{theme.firstTell.map((x, i) => <li key={i}>{x}</li>)}</ul>
          {opinion && <><h2 className="text-[12pt] mt-3 mb-1">相談員の所見</h2><p className="text-[10.5pt] whitespace-pre-wrap">{opinion}</p></>}
          <p className="text-[9pt] mt-4">※本サービスの情報は一般的な参考情報です（確認日 {theme.reviewedAt}）</p>
        </div>
      </Page>
      {toast}
    </>
  )
}
