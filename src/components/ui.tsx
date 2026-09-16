// 共通UI部品。設計書 §02 の原則（1画面1目的・主ボタンは1つ・色＋アイコン＋文言）をここで担保する
import { useEffect, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import type { Level, Theme } from '../lib/types'
import { LEVEL_META } from '../lib/types'
import { formatReviewed, isStale } from '../lib/engine'

/** 画面上部バー：左「戻る」右「ホーム」を常設（原則7） */
export function TopBar({ title, back = true, right, backTo = '/' }: { title: string; back?: boolean; right?: ReactNode; backTo?: string }) {
  const nav = useNavigate()
  const location = useLocation()
  return (
    <header className="sticky top-0 z-20 bg-surface border-b border-line no-print" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
      <div className="mx-auto max-w-3xl flex items-center gap-2 px-2 h-14">
        {back ? (
          <button type="button" onClick={() => (location.key === 'default' ? nav(backTo, { replace: true }) : nav(-1))} className="min-w-12 min-h-12 px-2 flex items-center gap-1 text-primary font-bold rounded-lg hover:bg-primary-soft" aria-label="前の画面に戻る">
            <span aria-hidden="true" className="text-2xl leading-none">‹</span>戻る
          </button>
        ) : <span className="w-3" />}
        <h1 className="flex-1 text-center text-[17px] font-bold truncate">{title}</h1>
        {right ?? (
          <Link to="/" className="min-h-12 min-w-12 px-3 flex items-center justify-center text-primary font-bold border-2 border-primary rounded-lg text-[14px] hover:bg-primary-soft" aria-label="ホームに戻る">ホーム</Link>
        )}
      </div>
    </header>
  )
}

export function Page({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <main className={`mx-auto max-w-3xl px-4 pb-28 pt-4 flex flex-col gap-4 ${className}`}>{children}</main>
}

export function LevelBadge({ level, size = 'md' }: { level: Level; size?: 'sm' | 'md' | 'lg' }) {
  const m = LEVEL_META[level]
  const cls = size === 'lg' ? 'text-[22px] px-5 py-3 rounded-2xl' : size === 'sm' ? 'text-[13px] px-2.5 py-0.5 rounded-md' : 'text-[15px] px-3 py-1 rounded-lg'
  return <span className={`inline-flex items-center gap-1.5 font-bold lv-${level} ${cls}`}><span aria-hidden="true">{m.icon}</span>{m.label}</span>
}

export function ThemeCard({ theme, to }: { theme: Theme; to?: string }) {
  return (
    <Link to={to ?? `/themes/${theme.id}`} className="card flex items-center gap-3 hover:border-primary min-h-16">
      <span className="text-3xl w-10 text-center" aria-hidden="true">{theme.icon}</span>
      <span className="flex-1 min-w-0">
        <span className="block font-bold text-[17px] leading-snug">{theme.name}</span>
        <span className="block mt-1"><LevelBadge level={theme.level} size="sm" /></span>
      </span>
      <span className="text-muted text-2xl" aria-hidden="true">›</span>
    </Link>
  )
}

export function ReviewedNote({ reviewedAt }: { reviewedAt: string }) {
  const stale = isStale(reviewedAt)
  return (
    <p className={`text-[13px] ${stale ? 'text-lv-yellow font-bold' : 'text-muted'}`}>
      確認日：{formatReviewed(reviewedAt)}{stale && '　⚠ 情報が古い可能性があります'}
    </p>
  )
}

export function Disclaimer() {
  return (
    <p className="text-[13px] text-muted border-t border-line pt-3 mt-2">
      本サービスの情報は一般的な参考情報です。製品の価格・仕様や制度の内容は変更されることがあります。導入や申請の前に、必ず提供元や公式情報をご確認ください。特定の製品・事業者を推奨するものではありません。
    </p>
  )
}

export function Section({ title, children, defaultOpen = true, id }: { title: string; children: ReactNode; defaultOpen?: boolean; id?: string }) {
  return (
    <details open={defaultOpen} className="card p-0 group" id={id}>
      <summary className="list-none cursor-pointer flex items-center justify-between px-4 min-h-14 font-bold text-[17px] select-none">
        {title}<span className="text-muted transition-transform group-open:rotate-180" aria-hidden="true">▾</span>
      </summary>
      <div className="px-4 pb-4">{children}</div>
    </details>
  )
}

export function Bullets({ items, numbered = false }: { items: string[]; numbered?: boolean }) {
  const Tag = numbered ? 'ol' : 'ul'
  return (
    <Tag className={`${numbered ? 'list-decimal' : 'list-disc'} pl-6 flex flex-col gap-1.5 text-[16px]`}>
      {items.map((t, i) => <li key={i}>{t}</li>)}
    </Tag>
  )
}

export function Notice({ kind = 'info', children }: { kind?: 'info' | 'warn' | 'urgent'; children: ReactNode }) {
  const cls = { info: 'bg-surface-2 text-ink-2', warn: 'bg-lv-yellow-soft text-lv-yellow', urgent: 'bg-lv-urgent-soft text-lv-urgent' }[kind]
  return <div className={`rounded-xl px-4 py-3 text-[15px] font-bold ${cls}`} role={kind === 'urgent' ? 'alert' : undefined}>{children}</div>
}

export function ErrorText({ msg }: { msg: string | null }) {
  if (!msg) return null
  return <p role="alert" className="text-lv-red font-bold text-[15px]">{msg}</p>
}

export function Spinner({ label = '読み込み中…' }: { label?: string }) {
  return <div className="p-10 text-center text-muted" role="status">{label}</div>
}

/** 一時的な「コピーしました」などの表示 */
export function useToast(): [ReactNode, (msg: string) => void] {
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(null), 2200); return () => clearTimeout(t) }, [msg])
  const node = msg ? <div role="status" className="fixed left-1/2 -translate-x-1/2 bottom-24 z-50 bg-ink text-white px-5 py-3 rounded-xl font-bold shadow-lg">{msg}</div> : null
  return [node, setMsg]
}

export async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true } catch {
    try { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); return true } catch { return false }
  }
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="block text-[13px] text-muted mt-1">{hint}</span>}
    </label>
  )
}
