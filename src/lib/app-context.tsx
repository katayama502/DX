// アプリ全体の状態：バックエンド・セッション・コンテンツ・検索エンジン
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Backend, Session } from './backend'
import { createDemoBackend } from './backend.demo'
import { createSupabaseBackend } from './backend.supabase'
import { Synonymizer } from './engine'
import type { ContentBundle } from './types'

const mode = (import.meta.env.VITE_APP_MODE ?? 'demo') as 'demo' | 'supabase'
export const backend: Backend =
  mode === 'supabase' && import.meta.env.VITE_SUPABASE_URL
    ? createSupabaseBackend(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY ?? '')
    : createDemoBackend()

interface AppState {
  backend: Backend
  session: Session | null
  sessionLoading: boolean
  refreshSession: () => Promise<void>
  content: ContentBundle | null
  contentError: string | null
  syn: Synonymizer | null
  /** 団体の契約状態から画面上の扱いを決める */
  access: 'ok' | 'grace' | 'expired' | 'none'
}
const Ctx = createContext<AppState | null>(null)

function accessOf(s: Session | null): AppState['access'] {
  if (!s) return 'none'
  const end = new Date(s.org.contract_end + 'T23:59:59')
  const now = new Date()
  const graceEnd = new Date(end); graceEnd.setDate(graceEnd.getDate() + 30)
  if (s.org.status === 'suspended' || s.org.status === 'expired') return 'expired'
  if (s.org.status === 'grace' || now > end) return now > graceEnd ? 'expired' : 'grace'
  return 'ok'
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [sessionLoading, setLoading] = useState(true)
  const [content, setContent] = useState<ContentBundle | null>(null)
  const [contentError, setContentError] = useState<string | null>(null)

  const refreshSession = useCallback(async () => {
    try { setSession(await backend.getSession()) } catch { setSession(null) } finally { setLoading(false) }
  }, [])
  useEffect(() => { refreshSession(); return backend.onAuthChange(() => { refreshSession() }) }, [refreshSession])

  const access = accessOf(session)
  useEffect(() => {
    if (!session || access === 'expired') { setContent(null); return }
    let alive = true
    backend.loadContent().then((c) => { if (alive) { setContent(c); setContentError(null) } }).catch((e) => { if (alive) setContentError(e.message) })
    return () => { alive = false }
  }, [session, access])

  const syn = useMemo(() => (content ? new Synonymizer(content.synonyms) : null), [content])
  const value = useMemo<AppState>(() => ({ backend, session, sessionLoading, refreshSession, content, contentError, syn, access }), [session, sessionLoading, refreshSession, content, contentError, syn, access])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useApp(): AppState {
  const v = useContext(Ctx)
  if (!v) throw new Error('AppProvider の外で useApp が呼ばれました')
  return v
}
/** ログイン済み・コンテンツ読込済みを前提にする画面用 */
export function useContent(): { content: ContentBundle; syn: Synonymizer; session: Session } {
  const { content, syn, session } = useApp()
  if (!content || !syn || !session) throw new Error('コンテンツ未読込')
  return { content, syn, session }
}
