// S-016 運営管理（クリエット）：団体・契約・利用状況
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../../lib/app-context'
import type { Organization } from '../../lib/types'
import { ErrorText, Field, Page, Section, TopBar, useToast } from '../../components/ui'

const KIND = { city: '市町村', shokokai: '商工会', cci: '商工会議所', other: 'その他' }
const STATUS = { trial: '試行', active: '契約中', grace: '猶予', expired: '終了', suspended: '停止' }
const empty = (): Organization & { admin_email?: string } => ({ code: '', name: '', kind: 'shokokai', plan: 'basic', status: 'trial', contract_start: new Date().toISOString().slice(0, 10), contract_end: '', seat_limit: 10, logo_url: null, contact: null, region_links: [], admin_email: '' })
type OrgDraft = Organization & { admin_email?: string }
type Editor = { mode: 'create' | 'edit'; value: OrgDraft }

export default function OpsAdmin() {
  const { backend } = useApp()
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [usage, setUsage] = useState<Awaited<ReturnType<typeof backend.listUsage>>>([])
  const [editor, setEditor] = useState<Editor | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [toast, show] = useToast()
  const reload = useCallback(async () => { try { setOrgs(await backend.listOrgs()); setUsage(await backend.listUsage()) } catch (e) { setErr((e as Error).message) } }, [backend])
  useEffect(() => { reload() }, [reload])
  const soon = orgs.filter((o) => { const d = (new Date(o.contract_end).getTime() - Date.now()) / 86400000; return d >= 0 && d <= 30 })
  const sum = (code: string) => usage.filter((u) => u.org_code === code).reduce((a, u) => ({ logins: a.logins + u.logins, hearings: a.hearings + u.hearings_done, tickets: a.tickets + u.tickets_made }), { logins: 0, hearings: 0, tickets: 0 })

  const save = async (e: FormEvent) => {
    e.preventDefault(); if (!editor) return; setErr(null)
    const draft = editor.value
    if (editor.mode === 'create' && orgs.some((o) => o.code === draft.code)) return setErr('この団体コードは既に使われています')
    try {
      await backend.upsertOrg({ ...draft, admin_email: editor.mode === 'create' ? (draft.admin_email?.trim() || undefined) : undefined })
      setEditor(null); await reload(); show(editor.mode === 'create' ? '団体を登録しました' : '団体情報を更新しました')
    } catch (ex) { setErr((ex as Error).message) }
  }

  return (
    <>
      <TopBar title="運営管理" />
      <Page>
        <div className="grid grid-cols-2 gap-2">
          <div className="card text-center"><p className="text-3xl font-bold">{orgs.filter((o) => ['trial', 'active'].includes(o.status)).length}</p><p className="text-[13px] text-muted">契約団体</p></div>
          <div className="card text-center"><p className="text-3xl font-bold text-lv-yellow">{soon.length}</p><p className="text-[13px] text-muted">30日以内に期限</p></div>
        </div>
        <ErrorText msg={err} />
        <Section title={`団体（${orgs.length}）`}>
          <ul className="divide-y divide-line">
            {orgs.map((o) => { const s = sum(o.code); return (
              <li key={o.code} className="py-2 flex flex-wrap items-center gap-2 min-h-14">
                <span className="flex-1 min-w-[200px]"><span className="font-bold">{o.name}</span><span className="block text-[13px] text-muted">{KIND[o.kind]}・{o.plan === 'regional' ? '地域版' : '基本'}・{STATUS[o.status]} 〜{o.contract_end}・上限{o.seat_limit}</span><span className="block text-[12px] text-muted">ログイン{s.logins}／ヒアリング{s.hearings}／相談票{s.tickets}</span></span>
                <Link to={`/admin/org?org=${o.code}`} className="btn-ghost btn-sm w-auto !min-h-11 text-[14px]">団体管理</Link>
                <button type="button" className="btn-ghost btn-sm w-auto !min-h-11 text-[14px]" onClick={() => setEditor({ mode: 'edit', value: { ...o } })}>編集</button>
              </li>) })}
          </ul>
          {!editor && <button type="button" className="btn-primary btn-sm mt-3" onClick={() => setEditor({ mode: 'create', value: empty() })}>＋ 団体を登録</button>}
        </Section>
        {editor && (
          <form onSubmit={save} className="card flex flex-col gap-3">
            <h2 className="text-[18px]">{editor.mode === 'create' ? '新しい団体を登録' : `団体を編集：${editor.value.name}`}</h2>
            <Field label="団体コード（英小文字・数字・ハイフン）" hint="共有ページのURLに使います。後から変更できません"><input id="eCode" className="input" value={editor.value.code} onChange={(e) => setEditor({ ...editor, value: { ...editor.value, code: e.target.value } })} disabled={editor.mode === 'edit'} required pattern="[a-z0-9-]{3,32}" /></Field>
            <Field label="団体名"><input id="eName" className="input" value={editor.value.name} onChange={(e) => setEditor({ ...editor, value: { ...editor.value, name: e.target.value } })} required /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="種別"><select id="eKind" className="input" value={editor.value.kind} onChange={(e) => setEditor({ ...editor, value: { ...editor.value, kind: e.target.value as Organization['kind'] } })}>{Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
              <Field label="プラン"><select id="ePlan" className="input" value={editor.value.plan} onChange={(e) => setEditor({ ...editor, value: { ...editor.value, plan: e.target.value as Organization['plan'] } })}><option value="basic">基本</option><option value="regional">地域版</option></select></Field>
              <Field label="状態"><select id="eStatus" className="input" value={editor.value.status} onChange={(e) => setEditor({ ...editor, value: { ...editor.value, status: e.target.value as Organization['status'] } })}>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
              <Field label="アカウント上限"><input id="eSeat" className="input" type="number" min={1} max={200} value={editor.value.seat_limit} onChange={(e) => setEditor({ ...editor, value: { ...editor.value, seat_limit: Number(e.target.value) } })} /></Field>
              <Field label="契約開始"><input id="eStart" className="input" type="date" value={editor.value.contract_start} onChange={(e) => setEditor({ ...editor, value: { ...editor.value, contract_start: e.target.value } })} required /></Field>
              <Field label="契約終了"><input id="eEnd" className="input" type="date" value={editor.value.contract_end} onChange={(e) => setEditor({ ...editor, value: { ...editor.value, contract_end: e.target.value } })} required /></Field>
            </div>
            {editor.mode === 'create' && <Field label="団体管理者のメール（招待を送ります）"><input id="eAdmin" className="input" type="email" value={editor.value.admin_email ?? ''} onChange={(e) => setEditor({ ...editor, value: { ...editor.value, admin_email: e.target.value } })} /></Field>}
            <div className="grid grid-cols-2 gap-2"><button type="button" className="btn-secondary btn-sm" onClick={() => setEditor(null)}>やめる</button><button type="submit" className="btn-primary btn-sm">{editor.mode === 'create' ? '団体を登録する' : '変更を保存する'}</button></div>
          </form>
        )}
        <Section title="コンテンツ" defaultOpen={false}>
          <p className="text-[14px] text-ink-2">テーマ・事例・用語は Git（content/）で管理し、<code>npm run content:push</code> で反映します。公開状態の切替と確認日の一括更新は Phase 1 で追加予定。</p>
        </Section>
      </Page>
      {toast}
    </>
  )
}
