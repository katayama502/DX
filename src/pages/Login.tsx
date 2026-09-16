import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useApp } from '../lib/app-context'
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '../lib/backend.demo'
import { ErrorText, Field } from '../components/ui'

export default function Login() {
  const { backend, session, sessionLoading } = useApp()
  const nav = useNavigate()
  const loc = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [resetSent, setResetSent] = useState(false)

  if (!sessionLoading && session) return <Navigate to={(loc.state as { from?: string })?.from ?? '/'} replace />

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr(null); setBusy(true)
    try { await backend.signIn(email, password); nav((loc.state as { from?: string })?.from ?? '/', { replace: true }) }
    catch (ex) { setErr((ex as Error).message) } finally { setBusy(false) }
  }
  const reset = async () => {
    if (!email) { setErr('パスワード再設定には、まずメールアドレスを入力してください'); return }
    setErr(null); await backend.resetPassword(email); setResetSent(true)
  }

  return (
    <main className="min-h-full flex flex-col justify-center mx-auto max-w-md px-5 py-10 gap-5">
      <div className="text-center">
        <div className="text-5xl mb-2" aria-hidden="true">🧭</div>
        <h1 className="text-3xl">DX相談ナビ</h1>
        <p className="text-muted mt-1">商工会・商工会議所・市役所の相談窓口のために</p>
      </div>
      <form onSubmit={submit} className="card flex flex-col gap-4 p-5" noValidate>
        <Field label="メールアドレス">
          <input id="email" className="input" type="email" autoComplete="username" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label="パスワード">
          <div className="relative">
            <input id="password" className="input pr-20" type={show ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            <button type="button" onClick={() => setShow(!show)} className="absolute right-2 top-1/2 -translate-y-1/2 min-h-11 px-3 text-primary font-bold text-[14px]" aria-pressed={show}>{show ? '隠す' : '表示'}</button>
          </div>
        </Field>
        <ErrorText msg={err} />
        {resetSent && <p role="status" className="text-[15px] text-ink-2">パスワード再設定の案内をメールで送りました（登録済みのアドレスの場合）。</p>}
        <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'ログイン中…' : 'ログイン'}</button>
        <button type="button" onClick={reset} className="btn-ghost btn-sm">パスワードを忘れた方はこちら</button>
        <p className="text-[13px] text-muted text-center">ログインできない場合は、団体の管理者にお問い合わせください。</p>
      </form>
      {backend.mode === 'demo' && (
        <div className="card bg-accent-soft border-accent/40 text-[14px]">
          <p className="font-bold mb-2">デモ用アカウント（パスワードはすべて <code>{DEMO_PASSWORD}</code>）</p>
          <div className="grid grid-cols-2 gap-2">
            {DEMO_ACCOUNTS.map((a) => (
              <button key={a.email} type="button" className="btn-secondary btn-sm !min-h-11 text-[13px]" onClick={() => { setEmail(a.email); setPassword(DEMO_PASSWORD) }}>{a.label}</button>
            ))}
          </div>
        </div>
      )}
    </main>
  )
}
