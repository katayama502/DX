// 下部タブ（ホーム／テーマ／事例／メニュー）と、ログイン・契約状態のガード
import { Navigate, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useApp } from '../lib/app-context'
import { Spinner } from './ui'

const TABS = [
  { to: '/', label: 'ホーム', icon: '🏠', end: true },
  { to: '/themes', label: 'テーマ', icon: '📂' },
  { to: '/cases', label: '事例', icon: '📚' },
  { to: '/menu', label: 'メニュー', icon: '☰' },
]

export function BottomTabs() {
  return (
    <nav className="fixed bottom-0 inset-x-0 z-20 bg-surface border-t border-line no-print" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }} aria-label="主なページ">
      <div className="mx-auto max-w-3xl grid grid-cols-4">
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => `flex flex-col items-center justify-center min-h-16 text-[12px] font-bold ${isActive ? 'text-primary' : 'text-muted'}`}>
            {({ isActive }) => (<><span className="text-2xl leading-none mb-0.5" aria-hidden="true">{t.icon}</span>{t.label}{isActive && <span className="sr-only">（現在のページ）</span>}</>)}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}

/** ログイン必須。契約終了なら /expired へ */
export function RequireAuth() {
  const { session, sessionLoading, access, content, contentError } = useApp()
  const loc = useLocation()
  if (sessionLoading) return <Spinner />
  if (!session) return <Navigate to="/login" replace state={{ from: loc.pathname }} />
  if (access === 'expired') return <Navigate to="/expired" replace />
  if (contentError) return <div className="p-8 text-center"><p className="font-bold text-lv-red">データを読み込めませんでした</p><p className="text-muted text-[14px] mt-2">{contentError}</p></div>
  if (!content) return <Spinner label="相談テーマを読み込んでいます…" />
  return (
    <div className="min-h-full">
      {access === 'grace' && <GraceBanner end={session.org.contract_end} />}
      <Outlet />
      <BottomTabs />
    </div>
  )
}

function GraceBanner({ end }: { end: string }) {
  return (
    <div className="bg-lv-yellow-soft text-lv-yellow text-[14px] font-bold px-4 py-2 text-center no-print">
      契約期間（{end}まで）が終了しています。30日間は閲覧のみ可能です。更新は団体の管理者またはクリエットへご連絡ください。
    </div>
  )
}

export function RequireRole({ roles }: { roles: ('org_admin' | 'ops_admin')[] }) {
  const { session } = useApp()
  if (!session || !roles.includes(session.user.role as 'org_admin' | 'ops_admin')) return <Navigate to="/" replace />
  return <Outlet />
}
