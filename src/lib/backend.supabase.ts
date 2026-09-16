// 本番バックエンド：Supabase Auth + Postgres（RLS）。コンテンツは認証後に各テーブルから取得してブラウザ内で検索する
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Backend, Session, SharePayload } from './backend'
import { BackendError } from './backend'
import type { AppUser, Case, ContentBundle, DialogNode, EscalationContact, Invitation, InvitableRole, LevelRule, Organization, RegionalCase, Synonym, Term, Theme, ThemeKeyword, UserStatus } from './types'
import { CATEGORY_ORDER } from './types'

const ym = (d: string) => String(d).slice(0, 7)

// DB・Auth の内部エラーコード（英語・短文）を、画面に出しても恥ずかしくない日本語に翻訳する。
// 一致しないものは「現在この操作を行えません」に丸め、内部の詳細文言は表示しない。
const DB_ERROR_JA: [RegExp, string][] = [
  [/invalid name/i, '名前を正しく入力してください'],
  [/invalid contact/i, '連絡先は500文字以内で入力してください'],
  [/invalid logo url/i, 'ロゴのURLは https:// から始まる形式で入力してください'],
  [/invalid region links?/i, '地域の支援制度リンクの形式が正しくありません'],
  [/invalid email/i, 'メールアドレスの形式が正しくありません'],
  [/invalid status/i, '指定できない状態です'],
  [/invalid usage kind/i, '指定できない項目です'],
  [/invalid role/i, '指定できない権限です'],
  [/organization not found/i, '団体が見つかりません'],
  [/organization is not under contract/i, '契約中の団体ではありません'],
  [/profile not found/i, 'アカウント情報が見つかりません'],
  [/invitation not found|invitation state mismatch|no pending invitation/i, 'この招待は無効または期限切れです'],
  [/email already registered or invited/i, 'このメールアドレスは登録済みまたは招待中です'],
  [/seat limit reached/i, 'アカウント上限に達しています'],
  [/cannot change own status/i, '自分自身の状態は変更できません'],
  [/forbidden|not found/i, 'この操作を行う権限がありません'],
  [/password should be at least/i, 'パスワードは8文字以上にしてください'],
  [/network|fetch|timeout/i, '通信状況をご確認のうえ、時間をおいてお試しください'],
]
const toJa = (msg: string): string => DB_ERROR_JA.find(([re]) => re.test(msg))?.[1] ?? '現在この操作を行えません。時間をおいてお試しください'

export function createSupabaseBackend(url: string, anonKey: string): Backend {
  const sb: SupabaseClient = createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true } })
  const fail = (msg: string): never => { throw new BackendError(msg) }
  const must = async <T,>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> => {
    const { data, error } = await p
    if (error) fail(toJa(error.message))
    return data as T
  }

  return {
    mode: 'supabase',
    async getSession(): Promise<Session | null> {
      const { data: { session }, error: sessionError } = await sb.auth.getSession()
      if (sessionError) fail(sessionError.message)
      if (!session) return null
      // 招待ユーザーは、招待リンク経由でセッションが成立した時点でのみ active にする。
      const { error: activateError } = await sb.rpc('activate_my_invitation')
      if (activateError && !/no pending invitation/i.test(activateError.message)) {
        await sb.auth.signOut()
        return null
      }
      const { data: prof, error: profError } = await sb.from('profiles').select('*').eq('id', session.user.id).maybeSingle()
      if (profError) fail(profError.message)
      if (!prof || prof.status !== 'active') { await sb.auth.signOut(); return null }
      const { data: org, error: orgError } = await sb.from('organizations').select('*').eq('code', prof.org_code).single()
      if (orgError) fail(orgError.message)
      if (!org) return null
      return { user: prof as AppUser, org: org as Organization }
    },
    onAuthChange(cb) { const { data } = sb.auth.onAuthStateChange(() => cb()); return () => data.subscription.unsubscribe() },
    async signIn(email, password) {
      const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password })
      if (error) {
        if (/invalid login/i.test(error.message)) fail('メールアドレスまたはパスワードが違います')
        fail('現在ログインできません。時間をおいてお試しください')
      }
      // 招待リンク経由の初回ログインだけ、ここで invited → active に遷移させる
      const { error: activateError } = await sb.rpc('activate_my_invitation')
      if (activateError && !/no pending invitation/i.test(activateError.message)) {
        await sb.auth.signOut()
        fail('この招待は無効または期限切れです。団体の管理者にお問い合わせください')
      }
      // パスワードは合っていても、団体アカウントが未登録・停止中ならここで弾く（内部エラーを見せない）
      const { data: { user } } = await sb.auth.getUser()
      const { data: prof } = await sb.from('profiles').select('status').eq('id', user?.id ?? '').maybeSingle()
      if (!prof || prof.status !== 'active') {
        await sb.auth.signOut()
        fail('このアカウントはまだ利用できません。団体の管理者にお問い合わせください')
      }
      // 利用状況カウントの失敗でログイン自体を止めない
      try { await sb.rpc('bump_usage', { p_kind: 'logins' }) } catch { /* noop */ }
    },
    async signOut() { await sb.auth.signOut(); try { await Promise.all((await caches.keys()).map((k) => caches.delete(k))) } catch { /* noop */ } },
    async resetPassword(email) { const { error } = await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${location.origin}/reset` }); if (error) fail('現在送信できません。時間をおいてお試しください') },
    async updatePassword(password) { const { error } = await sb.auth.updateUser({ password }); if (error) fail(toJa(error.message)) },
    async updateMyName(name) { await must(sb.rpc('update_my_name', { p_name: name })) },
    async loadContent(): Promise<ContentBundle> {
      const [themes, questions, rules, keywords, cases, industries, terms, synonyms] = await Promise.all([
        must(sb.from('themes').select('*').eq('published', true).order('sort')),
        must(sb.from('questions').select('*').order('sort')),
        must(sb.from('level_rules').select('*')),
        must(sb.from('theme_keywords').select('*')),
        must(sb.from('cases').select('*').eq('published', true)),
        must(sb.from('industries').select('*').order('sort')),
        must(sb.from('terms').select('*')),
        must(sb.from('synonyms').select('*')),
      ]) as [Record<string, unknown>[], Record<string, unknown>[], Record<string, unknown>[], Record<string, unknown>[], Record<string, unknown>[], Record<string, unknown>[], Record<string, unknown>[], Record<string, unknown>[]]
      const synMap = new Map<string, string[]>()
      for (const s of synonyms) { const c = s.canonical as string; synMap.set(c, [...(synMap.get(c) ?? []), s.variant as string]) }
      const th: Theme[] = themes.map((t) => ({
        id: t.id as string, name: t.name as string, category: t.category as string, icon: t.icon as string, level: t.default_level as Theme['level'], urgent: t.urgent as boolean, order: t.sort as number,
        cases: (t.case_ids as string[]) ?? [], links: (t.links as Theme['links']) ?? [], reviewedAt: ym(t.reviewed_at as string), published: true,
        firstTell: t.first_tell as string[], misconceptions: t.misconceptions as string[], cost: t.cost as string[], nextSteps: t.next_steps as string[], checklist: t.checklist as string[], terms: t.term_names as string[],
      }))
      return {
        builtAt: new Date().toISOString(),
        themes: th,
        nodes: questions.map((q): DialogNode => ({ id: q.id as string, themeId: (q.theme_id as string | null), type: q.type as DialogNode['type'], shared: q.shared as boolean, text: q.text as string, why: (q.why as string) ?? undefined, options: q.options as string[], showIf: (q.show_if as Record<string, string[]>) ?? undefined, sort: q.sort as number })),
        rules: rules.map((r): LevelRule => ({ id: r.id as string, themeId: r.theme_id as string, if: r.if_conditions as Record<string, string[]>, level: r.then_level as LevelRule['level'], reason: r.reason as string })),
        keywords: keywords.map((k): ThemeKeyword => ({ themeId: k.theme_id as string, keyword: k.keyword as string, weight: k.weight as number })),
        synonyms: [...synMap.entries()].map(([canonical, variants]): Synonym => ({ canonical, variants })),
        terms: terms.map((t): Term => ({ term: t.term as string, reading: (t.reading as string) ?? undefined, description: t.description as string, variants: t.variants as string[] })),
        cases: cases.map((c): Case => ({ id: c.id as string, industry: c.industry as string, no: c.no as number, stage: c.stage as Case['stage'], title: c.title as string, summary: c.summary as string, budget: c.budget as number, tools: c.tools as string[], detail: c.detail as Case['detail'], themes: c.theme_ids as string[], type: c.type as Case['type'], reviewedAt: ym(c.reviewed_at as string), generated: c.generated as boolean })),
        industries: industries.map((i) => ({ id: i.id as string, name: i.name as string, icon: i.icon as string })),
        categories: CATEGORY_ORDER.filter((c) => th.some((t) => t.category === c)),
      }
    },
    async bumpUsage(kind) { await must(sb.rpc('bump_usage', { p_kind: kind })) },
    async getShare(themeId, orgCode) { const data = await must(sb.rpc('get_share', { p_theme: themeId, p_org: orgCode })); return (data ?? { theme: null, org: null }) as SharePayload },
    async listStaff(orgCode) { return must(sb.from('profiles').select('id, org_code, email, name, role, status').eq('org_code', orgCode).neq('status', 'invited').order('created_at')) as Promise<AppUser[]> },
    async listInvitations(orgCode) { return must(sb.from('invitations').select('*').eq('org_code', orgCode).is('accepted_at', null).gt('expires_at', new Date().toISOString())) as Promise<Invitation[]> },
    async inviteUser(orgCode, email, role: InvitableRole) {
      const { data, error } = await sb.functions.invoke('invite-user', { body: { action: 'invite', email, role, org_code: orgCode, redirect_to: `${location.origin}/welcome` } })
      if (error) fail('招待を送れませんでした。時間をおいてお試しください')
      if (data?.error) fail(data.error)
    },
    async cancelInvitation(id) {
      const { data, error } = await sb.functions.invoke('invite-user', { body: { action: 'cancel', invitation_id: id } })
      if (error) fail('招待を取り消せませんでした。時間をおいてお試しください')
      if (data?.error) fail(data.error)
    },
    async setUserStatus(userId, status: UserStatus) {
      const { error } = await sb.rpc('set_user_status', { p_user: userId, p_status: status })
      if (error) fail(toJa(error.message))
    },
    async listContacts(orgCode) { return must(sb.from('escalation_contacts').select('*').eq('org_code', orgCode).order('sort')) as Promise<EscalationContact[]> },
    async saveContact(c) {
      if (!c.name.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)) fail('名称とメールアドレスを正しく入力してください')
      await must(sb.from('escalation_contacts').upsert({ ...c, name: c.name.trim(), email: c.email.trim().toLowerCase(), id: c.id ?? undefined }))
    },
    async deleteContact(id) { await must(sb.from('escalation_contacts').delete().eq('id', id)) },
    async updateOrgProfile(orgCode, p) { const { error } = await sb.rpc('update_org_profile', { p_org_code: orgCode, p_name: p.name, p_contact: p.contact, p_logo_url: p.logo_url, p_region_links: p.region_links }); if (error) fail(toJa(error.message)) },
    async listOrgs() { return must(sb.from('organizations').select('*').order('name')) as Promise<Organization[]> },
    async upsertOrg(org) {
      const { admin_email, ...o } = org
      await must(sb.from('organizations').upsert(o))
      if (admin_email) await this.inviteUser(o.code, admin_email, 'org_admin')
    },
    async listUsage(orgCode) { let q = sb.from('usage_daily').select('*').order('day', { ascending: false }).limit(400); if (orgCode) q = q.eq('org_code', orgCode); return must(q) },
    async listRegionalCases(orgCode) { return must(sb.from('regional_cases').select('*').eq('org_code', orgCode).order('interviewed_at', { ascending: false })) as Promise<RegionalCase[]> },
    async getRegionalCase(id) { const { data, error } = await sb.from('regional_cases').select('*').eq('id', id).maybeSingle(); if (error) fail(toJa(error.message)); return (data as RegionalCase) ?? null },
    async saveRegionalCase(rc) {
      if (!rc.title.trim() || !rc.summary.trim()) fail('タイトルと概要を入力してください')
      if (rc.published && !rc.consent) fail('掲載には事業者の掲載許諾（同意）が必要です')
      await must(sb.from('regional_cases').upsert({ ...rc, title: rc.title.trim(), summary: rc.summary.trim(), id: rc.id ?? undefined }))
    },
    async deleteRegionalCase(id) { await must(sb.from('regional_cases').delete().eq('id', id)) },
  }
}
