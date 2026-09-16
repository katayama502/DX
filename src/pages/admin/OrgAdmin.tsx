// S-015 団体管理：未設定の警告を最上部に。スタッフ招待・停止、専門相談窓口、団体の表示設定
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useApp } from '../../lib/app-context'
import type { AppUser, EscalationContact, Invitation, Organization } from '../../lib/types'
import { ErrorText, Field, Notice, Page, Section, TopBar, useToast } from '../../components/ui'

const FIELDS = ['全般', '補助金・制度', 'セキュリティ', 'IT導入', '会計・税務', 'Web・集客']
const STATUS = { active: '利用中', invited: '招待中', disabled: '停止中' }

export default function OrgAdmin() {
  const { session, backend, refreshSession } = useApp()
  const [sp] = useSearchParams()
  const ownOrg = session!.org
  const orgCode = (session!.user.role === 'ops_admin' && sp.get('org')) || ownOrg.code
  const [targetOrg, setTargetOrg] = useState<Organization | null>(orgCode === ownOrg.code ? ownOrg : null)
  const [staff, setStaff] = useState<AppUser[]>([])
  const [inv, setInv] = useState<Invitation[]>([])
  const [contacts, setContacts] = useState<EscalationContact[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [toast, show] = useToast()
  const reload = useCallback(async () => {
    try {
      const target = session!.user.role === 'ops_admin' && orgCode !== ownOrg.code
        ? backend.listOrgs().then((all) => all.find((o) => o.code === orgCode) ?? null)
        : Promise.resolve(ownOrg)
      const [s, i, c, o] = await Promise.all([backend.listStaff(orgCode), backend.listInvitations(orgCode), backend.listContacts(orgCode), target])
      if (!o) throw new Error('対象の団体が見つかりません')
      setStaff(s); setInv(i); setContacts(c); setTargetOrg(o); setErr(null)
    }
    catch (e) { setErr((e as Error).message) }
  }, [backend, orgCode, ownOrg, session])
  useEffect(() => { reload() }, [reload])

  const used = staff.filter((u) => u.status !== 'disabled').length + inv.length
  const full = targetOrg ? used >= targetOrg.seat_limit : true
  const run = async (fn: () => Promise<void>, ok: string) => { setErr(null); try { await fn(); await reload(); show(ok) } catch (e) { setErr((e as Error).message) } }

  return (
    <>
      <TopBar title="団体管理" />
      <Page>
        {session!.user.role === 'ops_admin' && targetOrg && targetOrg.code !== ownOrg.code && <Notice>運営管理者として「{targetOrg.name}」を管理しています。</Notice>}
        {contacts.length === 0 && <Notice kind="warn">⚠ 専門相談窓口が未設定です。赤判定のとき相談票をメールで送れません。<a href="#contacts" className="underline ml-1">設定する</a></Notice>}
        <div className="grid grid-cols-2 gap-2">
          <div className="card text-center"><p className="text-3xl font-bold">{used}<span className="text-base text-muted">/{targetOrg?.seat_limit ?? '—'}</span></p><p className="text-[13px] text-muted">アカウント</p></div>
          <div className="card text-center"><p className="text-xl font-bold">{targetOrg?.contract_end ?? '読み込み中'}</p><p className="text-[13px] text-muted">契約期限</p></div>
        </div>
        <ErrorText msg={err} />

        <Section title={`スタッフ（${staff.length}名）`}>
          <ul className="flex flex-col divide-y divide-line">
            {staff.map((u) => (
              <li key={u.id} className="flex items-center gap-2 py-2 min-h-14">
                <span className="flex-1 min-w-0"><span className="font-bold">{u.name || '（氏名未設定）'}</span><span className="block text-[13px] text-muted truncate">{u.email}{u.role === 'org_admin' && '・管理者'}</span></span>
                <span className={`text-[13px] font-bold ${u.status === 'disabled' ? 'text-lv-red' : 'text-muted'}`}>{STATUS[u.status]}</span>
                {u.id !== session!.user.id && u.role !== 'ops_admin' && (
                  <button type="button" className="btn-ghost btn-sm w-auto !min-h-11 text-[14px]" onClick={() => run(() => backend.setUserStatus(u.id, u.status === 'disabled' ? 'active' : 'disabled'), u.status === 'disabled' ? '再開しました' : '停止しました')}>{u.status === 'disabled' ? '再開' : '停止'}</button>
                )}
              </li>
            ))}
            {inv.map((i) => (
              <li key={i.id} className="flex items-center gap-2 py-2 min-h-14">
                <span className="flex-1 min-w-0"><span className="font-bold">招待中</span><span className="block text-[13px] text-muted truncate">{i.email}・{new Date(i.expires_at).toLocaleDateString('ja-JP')}まで有効</span></span>
                <button type="button" className="btn-ghost btn-sm w-auto !min-h-11 text-[14px]" onClick={() => run(() => backend.cancelInvitation(i.id), '招待を取り消しました')}>取消</button>
              </li>
            ))}
          </ul>
          <InviteForm disabled={full} limit={targetOrg?.seat_limit ?? 0} onInvite={(email) => run(() => backend.inviteUser(orgCode, email, 'staff'), `${email} に招待メールを送りました`)} />
        </Section>

        <Section title={`専門相談窓口（${contacts.length}件）`} id="contacts">
          <p className="text-[14px] text-ink-2 mb-2">赤判定の相談票の宛先です。複数登録でき、相談員が送るときに選びます。</p>
          <ul className="flex flex-col gap-2">
            {contacts.map((c) => (
              <li key={c.id} className="card flex items-center gap-2">
                <span className="flex-1 min-w-0"><span className="font-bold">{c.name}</span><span className="block text-[13px] text-muted truncate">{c.email}{c.phone && `　${c.phone}`}</span>{c.fields.length > 0 && <span className="block text-[12px] text-primary">{c.fields.join('・')}</span>}</span>
                <button type="button" className="btn-ghost btn-sm w-auto !min-h-11 text-[14px]" onClick={() => { if (confirm(`「${c.name}」を削除しますか？`)) run(() => backend.deleteContact(c.id), '削除しました') }}>削除</button>
              </li>
            ))}
          </ul>
          <ContactForm orgCode={orgCode} onSave={(c) => run(() => backend.saveContact(c), '窓口を保存しました')} />
        </Section>

        <Section title="団体の表示設定（1枚資料に載ります）" defaultOpen={false}>
          {targetOrg && <OrgProfileForm key={targetOrg.code} org={targetOrg} onSave={(p) => run(async () => { await backend.updateOrgProfile(orgCode, p); if (orgCode === ownOrg.code) await refreshSession() }, '団体の表示設定を保存しました')} />}
        </Section>
        {session!.user.role === 'ops_admin' && <Link to="/admin/ops" className="btn-ghost btn-sm">運営管理へ</Link>}
      </Page>
      {toast}
    </>
  )
}

function InviteForm({ disabled, limit, onInvite }: { disabled: boolean; limit: number; onInvite: (email: string) => void }) {
  const [email, setEmail] = useState('')
  const submit = (e: FormEvent) => { e.preventDefault(); if (email.trim()) { onInvite(email.trim()); setEmail('') } }
  return (
    <form onSubmit={submit} className="mt-3 flex flex-col gap-2">
      {disabled ? <Notice kind="warn">アカウント上限（{limit}）に達しています。停止中のアカウントを整理するか、運営にご相談ください。</Notice> : (
        <>
          <Field label="招待するメールアドレス"><input id="invEmail" className="input" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
          <button type="submit" className="btn-primary btn-sm">＋ スタッフを招待する</button>
          <p className="text-[12px] text-muted">招待メールのリンクは7日間有効です。お名前は本人が初回ログイン時に入力します。</p>
        </>
      )}
    </form>
  )
}

function ContactForm({ orgCode, onSave }: { orgCode: string; onSave: (c: Omit<EscalationContact, 'id'>) => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [phone, setPhone] = useState(''); const [fields, setFields] = useState<string[]>([])
  if (!open) return <button type="button" className="btn-secondary btn-sm mt-3" onClick={() => setOpen(true)}>＋ 窓口を追加する</button>
  const submit = (e: FormEvent) => { e.preventDefault(); onSave({ org_code: orgCode, name: name.trim(), email: email.trim(), phone: phone.trim() || null, fields, sort: 99 }); setOpen(false); setName(''); setEmail(''); setPhone(''); setFields([]) }
  return (
    <form onSubmit={submit} className="mt-3 flex flex-col gap-3 border-t border-line pt-3">
      <Field label="窓口の名称"><input id="cName" className="input" value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} /></Field>
      <Field label="メールアドレス"><input id="cEmail" className="input" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
      <Field label="電話番号（任意）"><input id="cPhone" className="input" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} /></Field>
      <div><span className="label">対応分野（複数可）</span>
        <div className="flex flex-wrap gap-2">{FIELDS.map((f) => { const on = fields.includes(f); return <button key={f} type="button" aria-pressed={on} className={`chip !min-h-11 !text-[14px] ${on ? 'chip-on' : ''}`} onClick={() => setFields(on ? fields.filter((x) => x !== f) : [...fields, f])}>{f}</button> })}</div>
      </div>
      <div className="grid grid-cols-2 gap-2"><button type="button" className="btn-secondary btn-sm" onClick={() => setOpen(false)}>やめる</button><button type="submit" className="btn-primary btn-sm">保存する</button></div>
    </form>
  )
}

function OrgProfileForm({ org, onSave }: { org: Organization; onSave: (p: { name: string; contact: string | null; logo_url: string | null; region_links: { name: string; url: string }[] }) => void }) {
  const [name, setName] = useState(org.name); const [contact, setContact] = useState(org.contact ?? ''); const [logo, setLogo] = useState(org.logo_url ?? '')
  const [links, setLinks] = useState(org.region_links.map((l) => `${l.name} ${l.url}`).join('\n'))
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const region_links = links.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const m = l.match(/^(.*?)\s+(https?:\/\/\S+)$/); return m ? { name: m[1], url: m[2] } : null }).filter(Boolean) as { name: string; url: string }[]
    onSave({ name: name.trim(), contact: contact.trim() || null, logo_url: /^https?:\/\//.test(logo.trim()) ? logo.trim() : null, region_links })
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <Field label="団体名（表示用）"><input id="oName" className="input" value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} /></Field>
      <Field label="相談先の電話番号"><input id="oContact" className="input" inputMode="tel" value={contact} onChange={(e) => setContact(e.target.value)} maxLength={30} /></Field>
      <Field label="ロゴ画像のURL（任意・https）"><input id="oLogo" className="input" value={logo} onChange={(e) => setLogo(e.target.value)} /></Field>
      <Field label="地域の支援制度リンク（1行に「名称 URL」）"><textarea id="oLinks" className="input min-h-24 py-3 text-[15px]" value={links} onChange={(e) => setLinks(e.target.value)} /></Field>
      <button type="submit" className="btn-primary btn-sm">保存する</button>
    </form>
  )
}
