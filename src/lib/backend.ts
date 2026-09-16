// 認証・データアクセスの抽象。demo（ローカル模擬）と supabase（本番）の2実装を同じ形で使う
import type { AppUser, ContentBundle, EscalationContact, Invitation, InvitableRole, Organization, UserStatus } from './types'

export interface Session { user: AppUser; org: Organization }

export interface SharePayload {
  theme: { id: string; name: string; icon: string; firstTell: string[]; nextSteps: string[]; cost: string[]; checklist: string[]; links: { name: string; url: string }[]; reviewedAt: string } | null
  org: { code: string; name: string; contact: string | null; logo_url: string | null; region_links: { name: string; url: string }[] } | null
}

export type UsageKind = 'logins' | 'theme_views' | 'hearings_done' | 'tickets_made' | 'onepagers'

export interface Backend {
  readonly mode: 'demo' | 'supabase'
  getSession(): Promise<Session | null>
  onAuthChange(cb: () => void): () => void
  signIn(email: string, password: string): Promise<void>
  signOut(): Promise<void>
  resetPassword(email: string): Promise<void>
  updatePassword(password: string): Promise<void>
  updateMyName(name: string): Promise<void>
  loadContent(): Promise<ContentBundle>
  bumpUsage(kind: UsageKind): Promise<void>
  getShare(themeId: string, orgCode: string): Promise<SharePayload>
  // 団体管理
  listStaff(orgCode: string): Promise<AppUser[]>
  listInvitations(orgCode: string): Promise<Invitation[]>
  inviteUser(orgCode: string, email: string, role: InvitableRole): Promise<void>
  cancelInvitation(id: string): Promise<void>
  setUserStatus(userId: string, status: UserStatus): Promise<void>
  listContacts(orgCode: string): Promise<EscalationContact[]>
  saveContact(c: Omit<EscalationContact, 'id'> & { id?: string }): Promise<void>
  deleteContact(id: string): Promise<void>
  updateOrgProfile(orgCode: string, p: { name: string; contact: string | null; logo_url: string | null; region_links: { name: string; url: string }[] }): Promise<void>
  // 運営管理
  listOrgs(): Promise<Organization[]>
  upsertOrg(org: Organization & { admin_email?: string }): Promise<void>
  listUsage(orgCode?: string): Promise<{ org_code: string; day: string; logins: number; theme_views: number; hearings_done: number; tickets_made: number; onepagers: number }[]>
}

export class BackendError extends Error {}
