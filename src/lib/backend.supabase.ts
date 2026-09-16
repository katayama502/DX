// 本番バックエンド：Supabase Auth + Postgres（RLS）。コンテンツは認証後に各テーブルから取得してブラウザ内で検索する
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Backend, Session, SharePayload } from './backend'
import { BackendError } from './backend'
import type { AppUser, Case, ContentBundle, DialogNode, EscalationContact, Invitation, LevelRule, Organization, Role, Synonym, Term, Theme, ThemeKeyword, UserStatus } from './types'
import { CATEGORY_ORDER } from './types'

const ym = (d: string) => String(d).slice(0, 7)

export function createSupabaseBackend(url: string, anonKey: string): Backend {
  const sb: SupabaseClient = createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true } })
  const fail = (msg: string): never => { throw new BackendError(msg) }
  const must = async <T,>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> => {
    const { data, error } = await p
    if (error) fail(error.message)
    return data as T
  }

  return {
    mode: 'supabase',
    async getSession(): Promise<Session | null> {
      const { data: { session } } = await sb.auth.getSession()
      if (!session) return null
      const { data: prof } = await sb.from('profiles').select('*').eq('id', session.user.id).maybeSingle()
      if (!prof) return null
      if (prof.status === 'disabled') { await sb.auth.signOut(); return null }
      const { data: org } = await sb.from('organizations').select('*').eq('code', prof.org_code).single()
      if (!org) return null
      return { user: prof as AppUser, org: org as Organization }
    },
    onAuthChange(cb) { const { data } = sb.auth.onAuthStateChange(() => cb()); return () => data.subscription.unsubscribe() },
    async signIn(email, password) {
      const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password })
      if (error) {
        if (/invalid login/i.test(error.message)) fail('メールアドレスまたはパスワードが違います')
        if (/network|fetch/i.test(error.message)) fail('現在ログインできません。時間をおいてお試しください')
        fail('現在ログインできません。時間をおいてお試しください')
      }
      await sb.from('profiles').update({ last_login_at: new Date().toISOString() }).eq('id', (await sb.auth.getUser()).data.user?.id ?? '')
      await sb.rpc('bump_usage', { p_kind: 'logins' })
    },
    async signOut() { await sb.auth.signOut(); try { await Promise.all((await caches.keys()).map((k) => caches.delete(k))) } catch { /* noop */ } },
    async resetPassword(email) { const { error } = await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${location.origin}/reset` }); if (error) fail('現在送信できません。時間をおいてお試しください') },
    async updatePassword(password) { const { error } = await sb.auth.updateUser({ password }); if (error) fail(error.message) },
    async updateMyName(name) { const u = (await sb.auth.getUser()).data.user; if (u) await must(sb.from('profiles').update({ name }).eq('id', u.id)) },
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
    async bumpUsage(kind) { await sb.rpc('bump_usage', { p_kind: kind }) },
    async getShare(themeId, orgCode) { const data = await must(sb.rpc('get_share', { p_theme: themeId, p_org: orgCode })); return (data ?? { theme: null, org: null }) as SharePayload },
    async listStaff(orgCode) { return must(sb.from('profiles').select('id, org_code, email, name, role, status').eq('org_code', orgCode).order('created_at')) as Promise<AppUser[]> },
    async listInvitations(orgCode) { return must(sb.from('invitations').select('*').eq('org_code', orgCode).is('accepted_at', null).gt('expires_at', new Date().toISOString())) as Promise<Invitation[]> },
    async inviteUser(orgCode, email, role: Role) {
      const { data, error } = await sb.functions.invoke('invite-user', { body: { email, role, org_code: orgCode, redirect_to: `${location.origin}/welcome` } })
      if (error) fail('招待を送れませんでした。時間をおいてお試しください')
      if (data?.error) fail(data.error)
    },
    async cancelInvitation(id) { await must(sb.from('invitations').delete().eq('id', id)) },
    async setUserStatus(userId, status: UserStatus) { const { error } = await sb.rpc('set_user_status', { p_user: userId, p_status: status }); if (error) fail(error.message.includes('own') ? '自分自身の状態は変更できません' : 'この操作を行う権限がありません') },
    async listContacts(orgCode) { return must(sb.from('escalation_contacts').select('*').eq('org_code', orgCode).order('sort')) as Promise<EscalationContact[]> },
    async saveContact(c) {
      if (!c.name.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)) fail('名称とメールアドレスを正しく入力してください')
      await must(sb.from('escalation_contacts').upsert({ ...c, id: c.id ?? undefined }))
    },
    async deleteContact(id) { await must(sb.from('escalation_contacts').delete().eq('id', id)) },
    async updateOrgProfile(_orgCode, p) { const { error } = await sb.rpc('update_org_profile', { p_name: p.name, p_contact: p.contact, p_logo_url: p.logo_url, p_region_links: p.region_links }); if (error) fail(error.message) },
    async listOrgs() { return must(sb.from('organizations').select('*').order('name')) as Promise<Organization[]> },
    async upsertOrg(org) {
      const { admin_email, ...o } = org
      await must(sb.from('organizations').upsert(o))
      if (admin_email) await this.inviteUser(o.code, admin_email, 'org_admin')
    },
    async listUsage(orgCode) { let q = sb.from('usage_daily').select('*').order('day', { ascending: false }).limit(400); if (orgCode) q = q.eq('org_code', orgCode); return must(q) },
  }
}
