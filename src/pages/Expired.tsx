import { Navigate } from 'react-router-dom'
import { useApp } from '../lib/app-context'

export default function Expired() {
  const { session, backend, access, sessionLoading } = useApp()
  if (sessionLoading) return null
  if (!session) return <Navigate to="/login" replace />
  if (access !== 'expired') return <Navigate to="/" replace />
  return (
    <main className="min-h-full flex flex-col justify-center mx-auto max-w-md px-5 py-10 gap-5 text-center">
      <div className="text-5xl" aria-hidden="true">📭</div>
      <h1 className="text-2xl">契約期間が終了しました</h1>
      <p className="text-ink-2">
        {session.org.name} の契約は <strong>{session.org.contract_end}</strong> で終了しました。<br />
        更新については、団体の管理者または株式会社クリエットへご連絡ください。
      </p>
      <div className="card text-left text-[15px]">
        <p className="font-bold">お問い合わせ</p>
        <p>株式会社クリエット　info@creatte.example（仮）</p>
      </div>
      <button type="button" className="btn-secondary" onClick={() => backend.signOut()}>ログアウト</button>
    </main>
  )
}
