// 招待メールのリンクから到着：氏名とパスワードを設定して利用開始
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../lib/app-context'
import { ErrorText, Field } from '../components/ui'

export default function Welcome() {
  const { backend, refreshSession } = useApp()
  const nav = useNavigate()
  const [name, setName] = useState('')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr(null)
    if (name.trim().length < 1) return setErr('お名前を入力してください')
    if (pw.length < 8) return setErr('パスワードは8文字以上にしてください')
    if (pw !== pw2) return setErr('確認用のパスワードが一致しません')
    setBusy(true)
    try { await backend.updatePassword(pw); await backend.updateMyName(name.trim()); await refreshSession(); nav('/', { replace: true }) }
    catch (ex) { setErr((ex as Error).message) } finally { setBusy(false) }
  }
  return (
    <main className="min-h-full flex flex-col justify-center mx-auto max-w-md px-5 py-10 gap-5">
      <h1 className="text-2xl text-center">はじめまして</h1>
      <p className="text-ink-2 text-center">お名前とパスワードを決めてください。お名前は相談票に自動で入ります。</p>
      <form onSubmit={submit} className="card flex flex-col gap-4 p-5" noValidate>
        <Field label="お名前"><input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></Field>
        <Field label="パスワード（8文字以上）"><input id="pw" className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" /></Field>
        <Field label="パスワード（確認）"><input id="pw2" className="input" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" /></Field>
        <ErrorText msg={err} />
        <button type="submit" className="btn-primary" disabled={busy}>利用を始める</button>
      </form>
    </main>
  )
}
