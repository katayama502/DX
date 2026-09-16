// アプリ全体で共有する型。content/ のソースと build-content の出力、Supabase のテーブルはこの型に揃える

export type Level = 'blue' | 'yellow' | 'red' | 'urgent'
export const LEVEL_ORDER: Level[] = ['blue', 'yellow', 'red', 'urgent']

export type Role = 'staff' | 'org_admin' | 'ops_admin'
export type InvitableRole = Exclude<Role, 'ops_admin'>
export type OrgStatus = 'trial' | 'active' | 'grace' | 'expired' | 'suspended'
export type UserStatus = 'invited' | 'active' | 'disabled'

export interface Theme {
  id: string
  name: string
  category: string
  icon: string
  level: Level
  urgent?: boolean
  order: number
  cases: string[]
  links: { name: string; url: string }[]
  reviewedAt: string // YYYY-MM
  published: boolean
  firstTell: string[]
  misconceptions: string[]
  cost: string[]
  nextSteps: string[]
  checklist: string[]
  terms: string[]
}

export type QuestionType = 'say' | 'ask_single' | 'ask_multi' | 'ask_text'

export interface DialogNode {
  id: string
  themeId: string | null // null = 共通質問
  type: QuestionType
  shared?: boolean
  text: string
  why?: string
  options?: string[]
  showIf?: Record<string, string[]>
  sort: number
}

export interface LevelRule {
  id: string
  themeId: string
  if: Record<string, string[]>
  level: Level
  reason: string
}

export interface ThemeKeyword {
  themeId: string
  keyword: string
  weight: number
}

export interface Synonym {
  canonical: string
  variants: string[]
}

export interface Term {
  term: string
  reading?: string
  description: string
  variants?: string[]
}

export interface CaseTool {
  name: string
  what: string
  how: string
  url: string | null
}

export interface Case {
  id: string
  industry: string
  no: number
  stage: 1 | 2 | 3
  title: string
  summary: string
  budget: number // 0..5
  tools: string[]
  detail: {
    points: string[]
    steps: { title: string; desc: string }[]
    tips: string
    tool: CaseTool | null
    glossary: { term: string; desc: string }[]
  }
  themes: string[]
  type: 'model' | 'regional'
  reviewedAt: string
  generated: boolean
}

export interface Industry {
  id: string
  name: string
  icon: string
}

export interface ContentBundle {
  builtAt: string
  themes: Theme[]
  nodes: DialogNode[]
  rules: LevelRule[]
  keywords: ThemeKeyword[]
  synonyms: Synonym[]
  terms: Term[]
  cases: Case[]
  industries: Industry[]
  categories: string[]
}

export const BUDGET_LABELS = ['無料', '〜月1,000円', '〜月5,000円', '〜月3万円', '〜月10万円', '月10万円超']
export const STAGE_LABELS: Record<number, string> = { 1: 'S1 はじめの一歩', 2: 'S2 業務の効率化', 3: 'S3 事業の変革' }

export const CATEGORY_ORDER = ['集客・発信', 'お金・会計', '店舗・販売', '社内業務', 'AI活用', 'セキュリティ・トラブル', '補助金・制度']

export const LEVEL_META: Record<Level, { icon: string; label: string; hint: string; action: string }> = {
  blue: { icon: '🟢', label: 'その場で対応OK', hint: '基本情報の案内で解決できることが多い相談です', action: '1枚資料を作る' },
  yellow: { icon: '🟡', label: '資料を渡して検討', hint: '事業者側で比較・検討が必要です。資料を渡して再相談の目安を伝えましょう', action: '1枚資料を作る' },
  red: { icon: '🔴', label: '専門家につなぐ', hint: '相談票を作って専門相談窓口へ引き継ぎましょう', action: '相談票を作る' },
  urgent: { icon: '🚨', label: 'すぐに対応', hint: '被害が進行中の可能性があります。初動チェックリストを上から順に', action: '初動チェックリストを見る' },
}

// 団体・ユーザー（Supabase のテーブルと同じ形）
export interface Organization {
  code: string
  name: string
  kind: 'city' | 'shokokai' | 'cci' | 'other'
  plan: 'regional' | 'basic'
  status: OrgStatus
  contract_start: string
  contract_end: string
  seat_limit: number
  logo_url: string | null
  contact: string | null
  region_links: { name: string; url: string }[]
}

export interface AppUser {
  id: string
  org_code: string
  email: string
  name: string
  role: Role
  status: UserStatus
}

export interface EscalationContact {
  id: string
  org_code: string
  name: string
  email: string
  phone: string | null
  fields: string[]
  sort: number
}

export interface Announcement {
  id: string
  title: string
  body: string
  starts_at: string // YYYY-MM-DD
  ends_at: string | null // null = 終了日を設定しない
}

/** コンテンツ管理画面の事例一覧用（detail を含まない軽量版） */
export interface CaseSummary {
  id: string
  industry: string
  no: number
  stage: 1 | 2 | 3
  title: string
  type: 'model' | 'regional'
  budget: number
  generated: boolean
  published: boolean
}

export interface RegionalCase {
  id: string
  org_code: string
  title: string
  summary: string
  detail: { points: string[]; steps: { title: string; desc: string }[]; tips: string; glossary: { term: string; desc: string }[] }
  theme_ids: string[]
  interviewed_at: string // YYYY-MM
  consent: boolean
  published: boolean
}

export interface Invitation {
  id: string
  org_code: string
  email: string
  role: InvitableRole
  expires_at: string
  accepted_at: string | null
}
