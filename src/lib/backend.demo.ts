// デモ用バックエンド：認証と団体データをブラウザ内（localStorage）で模擬する。10月共有会のデモと開発用。
// パスワードは平文比較だがデモ専用（本番は Supabase Auth）。
import type { Backend, Session, SharePayload, UsageKind } from './backend'
import { BackendError } from './backend'
import type { AppUser, ContentBundle, EscalationContact, Invitation, Organization, RegionalCase } from './types'

interface Db {
  orgs: Organization[]
  users: (AppUser & { password: string })[]
  invitations: Invitation[]
  contacts: EscalationContact[]
  regionalCases: RegionalCase[]
  usage: Record<string, Record<UsageKind, number>> // key: org|day
}
// demo モードのときだけ content.json を読み込む（supabase モードのビルドには含めない）
let bundleCache: ContentBundle | null = null
async function loadBundle(): Promise<ContentBundle> {
  if (bundleCache) return bundleCache
  if (import.meta.env.VITE_APP_MODE === 'supabase') throw new BackendError('demo コンテンツは本番ビルドに含まれません')
  const m = await import('../generated/content.json')
  bundleCache = m.default as unknown as ContentBundle
  return bundleCache
}
const KEY = 'navi.demo.db'
const SESSION_KEY = 'navi.demo.session'
const DEMO_PASSWORD = 'demo1234'
const today = new Date()
const iso = (d: Date) => d.toISOString().slice(0, 10)
const plusDays = (n: number) => { const d = new Date(today); d.setDate(d.getDate() + n); return iso(d) }

function seed(): Db {
  return {
    orgs: [
      { code: 'creatte', name: '株式会社クリエット（運営）', kind: 'other', plan: 'basic', status: 'active', contract_start: '2026-04-01', contract_end: '2099-12-31', seat_limit: 5, logo_url: null, contact: null, region_links: [] },
      { code: 'masuda-city', name: '益田市役所 産業振興課', kind: 'city', plan: 'regional', status: 'trial', contract_start: '2026-11-01', contract_end: '2027-03-31', seat_limit: 10, logo_url: null, contact: '0856-31-0000', region_links: [{ name: '益田市 中小企業支援制度', url: 'https://www.city.masuda.lg.jp/' }] },
      { code: 'masuda-cci', name: '益田商工会議所', kind: 'cci', plan: 'regional', status: 'trial', contract_start: '2026-11-01', contract_end: '2027-03-31', seat_limit: 10, logo_url: null, contact: '0856-22-0088', region_links: [] },
      { code: 'old-org', name: '契約終了デモ商工会', kind: 'shokokai', plan: 'basic', status: 'expired', contract_start: '2025-04-01', contract_end: '2026-03-31', seat_limit: 10, logo_url: null, contact: null, region_links: [] },
    ],
    users: [
      { id: 'u-ops', org_code: 'creatte', email: 'ops@creatte.demo', name: 'クリエット 運営', role: 'ops_admin', status: 'active', password: DEMO_PASSWORD },
      { id: 'u-city-admin', org_code: 'masuda-city', email: 'admin@masuda-city.demo', name: '益田市 担当課長', role: 'org_admin', status: 'active', password: DEMO_PASSWORD },
      { id: 'u-cci-admin', org_code: 'masuda-cci', email: 'admin@masuda-cci.demo', name: '会議所 事務局長', role: 'org_admin', status: 'active', password: DEMO_PASSWORD },
      { id: 'u-cci-staff', org_code: 'masuda-cci', email: 'staff@masuda-cci.demo', name: '田中 太郎', role: 'staff', status: 'active', password: DEMO_PASSWORD },
      { id: 'u-cci-staff2', org_code: 'masuda-cci', email: 'suzuki@masuda-cci.demo', name: '鈴木 一郎', role: 'staff', status: 'disabled', password: DEMO_PASSWORD },
      { id: 'u-old', org_code: 'old-org', email: 'expired@old-org.demo', name: '期限切れ 太郎', role: 'staff', status: 'active', password: DEMO_PASSWORD },
    ],
    invitations: [
      { id: 'inv-1', org_code: 'masuda-cci', email: 'sato@masuda-cci.demo', role: 'staff', expires_at: plusDays(5) + 'T00:00:00Z', accepted_at: null },
    ],
    contacts: [
      { id: 'c-1', org_code: 'masuda-city', name: '島根県よろず支援拠点', email: 'yorozu@example.jp', phone: '0852-60-5108', fields: ['全般'], sort: 0 },
    ],
    regionalCases: [
      { id: 'rc-1', org_code: 'masuda-cci', title: '○○食堂｜LINE公式で常連客に週替わり告知', summary: '紙のチラシをやめ、LINE公式アカウントで週替わりメニューを配信。常連客の来店頻度が上がった。',
        detail: { points: ['配信は週1回・スマホから5分で作成', '友だち登録はレジ横のQRコードで案内'], steps: [], tips: '最初は「クーポン付き」の配信が友だち登録を後押しした。', glossary: [] },
        theme_ids: ['sns-start'], interviewed_at: '2026-08', consent: true, published: true },
    ],
    usage: {},
  }
}
function load(): Db {
  try { const raw = localStorage.getItem(KEY); if (raw) return JSON.parse(raw) } catch { /* noop */ }
  const db = seed(); save(db); return db
}
function save(db: Db) { try { localStorage.setItem(KEY, JSON.stringify(db)) } catch { /* noop */ } }
const delay = (ms = 150) => new Promise((r) => setTimeout(r, ms))
const strip = (u: AppUser & { password?: string }): AppUser => { const { password: _p, ...rest } = u; void _p; return rest }

export function createDemoBackend(): Backend {
  const listeners = new Set<() => void>()
  const notify = () => listeners.forEach((l) => l())
  const currentUserId = () => { try { return localStorage.getItem(SESSION_KEY) } catch { return null } }
  const requireOpsOrAdmin = (orgCode: string) => {
    const db = load(); const me = db.users.find((u) => u.id === currentUserId())
    if (!me || !(me.role === 'ops_admin' || (me.role === 'org_admin' && me.org_code === orgCode))) throw new BackendError('この操作を行う権限がありません')
    return db
  }
  const requireOps = () => {
    const db = load(); const me = db.users.find((u) => u.id === currentUserId())
    if (!me || me.role !== 'ops_admin') throw new BackendError('この操作を行う権限がありません')
    return db
  }

  return {
    mode: 'demo',
    async getSession(): Promise<Session | null> {
      const db = load(); const id = currentUserId(); if (!id) return null
      const u = db.users.find((x) => x.id === id); if (!u || u.status !== 'active') { try { localStorage.removeItem(SESSION_KEY) } catch { /* noop */ } return null }
      const org = db.orgs.find((o) => o.code === u.org_code)!
      return { user: strip(u), org }
    },
    onAuthChange(cb) { listeners.add(cb); return () => listeners.delete(cb) },
    async signIn(email, password) {
      await delay(400)
      const db = load(); const u = db.users.find((x) => x.email.toLowerCase() === email.trim().toLowerCase())
      if (!u || u.password !== password) throw new BackendError('メールアドレスまたはパスワードが違います')
      if (u.status !== 'active') throw new BackendError('このアカウントは利用できません。団体の管理者にお問い合わせください')
      try { localStorage.setItem(SESSION_KEY, u.id) } catch { /* noop */ }
      await this.bumpUsage('logins'); notify()
    },
    async signOut() { try { localStorage.removeItem(SESSION_KEY) } catch { /* noop */ } notify() },
    async resetPassword() { await delay(400) },
    async updatePassword(password) { const db = load(); const u = db.users.find((x) => x.id === currentUserId()); if (u) { u.password = password; save(db) } },
    async updateMyName(name) { const db = load(); const u = db.users.find((x) => x.id === currentUserId()); if (u) { u.name = name; save(db); notify() } },
    async loadContent() { await delay(100); return loadBundle() },
    async bumpUsage(kind) {
      const db = load(); const u = db.users.find((x) => x.id === currentUserId()); if (!u) return
      const k = `${u.org_code}|${iso(today)}`
      db.usage[k] = db.usage[k] ?? { logins: 0, theme_views: 0, hearings_done: 0, tickets_made: 0, onepagers: 0 }
      db.usage[k][kind]++; save(db)
    },
    async getShare(themeId, orgCode): Promise<SharePayload> {
      const db = load(); const t = (await loadBundle()).themes.find((x) => x.id === themeId && x.published)
      const now = today.getTime()
      const o = db.orgs.find((x) => x.code === orgCode && ['trial', 'active', 'grace'].includes(x.status)
        && new Date(`${x.contract_start}T00:00:00Z`).getTime() <= now
        && new Date(`${x.contract_end}T00:00:00Z`).getTime() + 30 * 86400000 >= now)
      return {
        theme: t && o ? { id: t.id, name: t.name, icon: t.icon, firstTell: t.firstTell, nextSteps: t.nextSteps, cost: t.cost, checklist: t.checklist, links: t.links, reviewedAt: t.reviewedAt } : null,
        org: o ? { code: o.code, name: o.name, contact: o.contact, logo_url: o.logo_url, region_links: o.region_links } : null,
      }
    },
    async listStaff(orgCode) { const db = requireOpsOrAdmin(orgCode); return db.users.filter((u) => u.org_code === orgCode).map(strip) },
    async listInvitations(orgCode) { const db = requireOpsOrAdmin(orgCode); return db.invitations.filter((i) => i.org_code === orgCode && !i.accepted_at && new Date(i.expires_at) > new Date()) },
    async inviteUser(orgCode, email, role) {
      const db = requireOpsOrAdmin(orgCode); const org = db.orgs.find((o) => o.code === orgCode)!
      const me = db.users.find((u) => u.id === currentUserId())!
      if (me.role === 'org_admin' && role !== 'staff') throw new BackendError('団体管理者が招待できるのはスタッフのみです')
      if (!['trial', 'active'].includes(org.status) || org.contract_start > iso(today) || org.contract_end < iso(today)) throw new BackendError('契約中の団体ではありません')
      const e = email.trim().toLowerCase()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new BackendError('メールアドレスの形式が正しくありません')
      const used = db.users.filter((u) => u.org_code === orgCode && u.status === 'active').length + db.invitations.filter((i) => i.org_code === orgCode && !i.accepted_at && new Date(i.expires_at) > new Date()).length
      if (used >= org.seat_limit) throw new BackendError(`アカウント上限（${org.seat_limit}）に達しています。停止中のアカウントを整理するか、運営にご相談ください`)
      if (db.users.some((u) => u.email === e) || db.invitations.some((i) => i.email === e && !i.accepted_at)) throw new BackendError('このメールアドレスは登録済みまたは招待中です')
      db.invitations.push({ id: `inv-${Date.now()}`, org_code: orgCode, email: e, role, expires_at: plusDays(7) + 'T00:00:00Z', accepted_at: null }); save(db)
    },
    async cancelInvitation(id) { const db = load(); const inv = db.invitations.find((i) => i.id === id); if (!inv) return; requireOpsOrAdmin(inv.org_code); db.invitations = db.invitations.filter((i) => i.id !== id); save(db) },
    async setUserStatus(userId, status) {
      const db = load(); const u = db.users.find((x) => x.id === userId); if (!u) throw new BackendError('見つかりません')
      if (u.id === currentUserId()) throw new BackendError('自分自身の状態は変更できません')
      const authorized = requireOpsOrAdmin(u.org_code)
      const me = authorized.users.find((x) => x.id === currentUserId())!
      if (me.role === 'org_admin' && u.role !== 'staff') throw new BackendError('団体管理者が状態を変更できるのはスタッフのみです')
      if (status === 'active' && u.status !== 'active') {
        const org = db.orgs.find((o) => o.code === u.org_code)!
        const used = db.users.filter((x) => x.org_code === u.org_code && x.status === 'active').length + db.invitations.filter((i) => i.org_code === u.org_code && !i.accepted_at && new Date(i.expires_at) > new Date()).length
        if (used >= org.seat_limit) throw new BackendError(`アカウント上限（${org.seat_limit}）に達しています`)
      }
      u.status = status; save(db)
    },
    async listContacts(orgCode) { const db = load(); return db.contacts.filter((c) => c.org_code === orgCode).sort((a, b) => a.sort - b.sort) },
    async saveContact(c) {
      const db = requireOpsOrAdmin(c.org_code)
      if (!c.name.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)) throw new BackendError('名称とメールアドレスを正しく入力してください')
      const normalized = { ...c, name: c.name.trim(), email: c.email.trim().toLowerCase() }
      if (c.id) { const i = db.contacts.findIndex((x) => x.id === c.id); if (i >= 0) db.contacts[i] = { ...db.contacts[i], ...normalized, id: c.id } }
      else db.contacts.push({ ...normalized, id: `c-${Date.now()}` })
      save(db)
    },
    async deleteContact(id) { const db = load(); const c = db.contacts.find((x) => x.id === id); if (!c) return; requireOpsOrAdmin(c.org_code); db.contacts = db.contacts.filter((x) => x.id !== id); save(db) },
    async updateOrgProfile(orgCode, p) { const db = requireOpsOrAdmin(orgCode); const o = db.orgs.find((x) => x.code === orgCode)!; Object.assign(o, p); save(db); notify() },
    async listOrgs() { const db = requireOps(); return db.orgs },
    async upsertOrg(org) {
      const db = requireOps(); const { admin_email, ...o } = org
      if (!/^[a-z0-9-]{3,32}$/.test(o.code)) throw new BackendError('団体コードは英小文字・数字・ハイフン 3〜32文字')
      const i = db.orgs.findIndex((x) => x.code === o.code)
      if (i >= 0) db.orgs[i] = { ...db.orgs[i], ...o }; else db.orgs.push(o)
      if (admin_email && !db.invitations.some((x) => x.email === admin_email)) db.invitations.push({ id: `inv-${Date.now()}`, org_code: o.code, email: admin_email, role: 'org_admin', expires_at: plusDays(7) + 'T00:00:00Z', accepted_at: null })
      save(db)
    },
    async listUsage(orgCode) {
      const db = load()
      return Object.entries(db.usage).filter(([k]) => !orgCode || k.startsWith(orgCode + '|')).map(([k, v]) => { const [org_code, day] = k.split('|'); return { org_code, day, ...v } })
    },
    async listRegionalCases(orgCode) { const db = load(); return db.regionalCases.filter((c) => c.org_code === orgCode) },
    async getRegionalCase(id) { const db = load(); return db.regionalCases.find((c) => c.id === id) ?? null },
    async saveRegionalCase(rc) {
      const db = requireOps()
      if (!rc.title.trim() || !rc.summary.trim()) throw new BackendError('タイトルと概要を入力してください')
      if (rc.published && !rc.consent) throw new BackendError('掲載には事業者の掲載許諾（同意）が必要です')
      if (rc.id) { const i = db.regionalCases.findIndex((x) => x.id === rc.id); if (i >= 0) db.regionalCases[i] = { ...rc, id: rc.id } }
      else db.regionalCases.push({ ...rc, id: `rc-${Date.now()}` })
      save(db)
    },
    async deleteRegionalCase(id) { const db = requireOps(); db.regionalCases = db.regionalCases.filter((c) => c.id !== id); save(db) },
  }
}

export const DEMO_ACCOUNTS = [
  { label: 'スタッフ（相談員）', email: 'staff@masuda-cci.demo' },
  { label: '団体管理者', email: 'admin@masuda-cci.demo' },
  { label: 'クリエット管理者', email: 'ops@creatte.demo' },
  { label: '契約終了の団体', email: 'expired@old-org.demo' },
]
export { DEMO_PASSWORD }
