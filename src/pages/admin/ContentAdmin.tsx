// コンテンツ表示管理（運営管理者のみ）：相談テーマ・事例の公開/非公開・表示順、お知らせ配信
// トグルはDBの published/sort 列を直接更新する。次回のコンテンツ同期（npm run content:seed → SQL実行）で上書きされない設計（supabase/seed/load_content.sql参照）
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useApp, useContent } from '../../lib/app-context'
import type { Announcement, CaseSummary, Theme } from '../../lib/types'
import { BUDGET_LABELS, LEVEL_META, STAGE_LABELS } from '../../lib/types'
import { ErrorText, Field, Page, Spinner, TopBar, useToast } from '../../components/ui'
import { localDateISO } from '../../lib/engine'

const TABS = [
  { key: 'themes', label: '相談テーマ' },
  { key: 'cases', label: '事例' },
  { key: 'announcements', label: 'お知らせ' },
] as const
type Tab = (typeof TABS)[number]['key']

export default function ContentAdmin() {
  const [tab, setTab] = useState<Tab>('themes')
  return (
    <>
      <TopBar title="コンテンツ表示管理" />
      <Page>
        <p className="text-[14px] text-ink-2">アプリに表示するテーマ・事例の公開状態と並び順、ホームに出すお知らせを管理します。内容そのもの（本文）の編集は Git（content/）で行います。</p>
        <div className="grid grid-cols-3 gap-2" role="tablist">
          {TABS.map((t) => (
            <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
              className={`min-h-12 rounded-xl font-bold text-[14px] border-2 ${tab === t.key ? 'bg-primary text-white border-primary' : 'bg-surface text-primary border-line-strong'}`}>
              {t.label}
            </button>
          ))}
        </div>
        {tab === 'themes' && <ThemesTab />}
        {tab === 'cases' && <CasesTab />}
        {tab === 'announcements' && <AnnouncementsTab />}
      </Page>
    </>
  )
}

function ThemesTab() {
  const { backend } = useApp()
  const [themes, setThemes] = useState<Theme[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [toast, show] = useToast()
  const reload = useCallback(async () => { try { setThemes(await backend.listAllThemes()) } catch (e) { setErr((e as Error).message) } }, [backend])
  useEffect(() => { reload() }, [reload])

  const togglePublished = async (t: Theme) => {
    setErr(null)
    try { await backend.setThemeVisibility(t.id, { published: !t.published }); await reload(); show(t.published ? '非公開にしました' : '公開しました') }
    catch (e) { setErr((e as Error).message) }
  }
  const changeOrder = async (t: Theme, order: number) => {
    if (!Number.isFinite(order)) return
    setErr(null)
    try { await backend.setThemeVisibility(t.id, { order }); await reload() }
    catch (e) { setErr((e as Error).message) }
  }

  if (!themes) return <Spinner />
  return (
    <section className="flex flex-col gap-2">
      <ErrorText msg={err} />
      <p className="text-[13px] text-muted">{themes.length}件・表示順が小さいほどホームやテーマ一覧の上位に出ます</p>
      <ul className="flex flex-col gap-2">
        {themes.map((t) => (
          <li key={t.id} className={`card flex items-center gap-3 ${!t.published ? 'opacity-60' : ''}`}>
            <input
              id={`order-${t.id}`}
              className="input !min-h-11 !w-16 !px-2 text-center text-[14px]"
              type="number"
              defaultValue={t.order}
              aria-label={`${t.name}の表示順`}
              onBlur={(e) => changeOrder(t, Number(e.target.value))}
            />
            <span className="text-2xl w-8 text-center" aria-hidden="true">{t.icon}</span>
            <span className="flex-1 min-w-0">
              <span className="block font-bold text-[15px] truncate">{t.name}</span>
              <span className="block text-[12px] text-muted">{t.category}・{LEVEL_META[t.level].label}{t.urgent && '・緊急'}</span>
            </span>
            <label className="flex items-center gap-2 text-[13px] font-bold shrink-0">
              <input type="checkbox" role="switch" className="w-11 h-6 accent-primary" checked={t.published} onChange={() => togglePublished(t)} aria-label={`${t.name}を公開する`} />
              {t.published ? '公開中' : '非公開'}
            </label>
          </li>
        ))}
      </ul>
      {toast}
    </section>
  )
}

const PAGE_SIZE = 40

function CasesTab() {
  const { backend } = useApp()
  const { content } = useContent()
  const [q, setQ] = useState('')
  const [industry, setIndustry] = useState('')
  // cases テーブルには常に type='model'（モデルケース）しか存在しない。地域事例は団体ごとの
  // regional_cases テーブルが別にあり、運営管理画面の「地域事例」で公開設定する（このタブでは扱わない）
  const [cases, setCases] = useState<CaseSummary[] | null>(null)
  const [limit, setLimit] = useState(PAGE_SIZE)
  const [err, setErr] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try { setCases(await backend.listCaseSummaries({ q, industry: industry || undefined })) }
    catch (e) { setErr((e as Error).message) }
  }, [backend, q, industry])
  useEffect(() => { const t = setTimeout(reload, 250); return () => clearTimeout(t) }, [reload])
  useEffect(() => { setLimit(PAGE_SIZE) }, [q, industry])

  const togglePublished = async (c: CaseSummary) => {
    setErr(null)
    try {
      await backend.setCasePublished(c.id, !c.published)
      setCases((prev) => prev?.map((x) => (x.id === c.id ? { ...x, published: !c.published } : x)) ?? null)
    } catch (e) { setErr((e as Error).message) }
  }

  return (
    <section className="flex flex-col gap-2">
      <ErrorText msg={err} />
      <p className="text-[13px] text-muted">ここではDX事例360のモデルケース（360件）を管理します。団体ごとの地域事例は<Link to="/admin/ops#regional" className="underline">運営管理の「地域事例」</Link>で公開設定してください。</p>
      <div className="grid grid-cols-2 gap-2">
        <input id="caseQ" className="input min-h-12 text-[14px] px-2" placeholder="タイトルで検索" value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label="業種" className="input min-h-12 text-[14px] px-2" value={industry} onChange={(e) => setIndustry(e.target.value)}>
          <option value="">業種：すべて</option>{content.industries.map((i) => <option key={i.id} value={i.id}>{i.icon} {i.name}</option>)}
        </select>
      </div>
      {cases === null ? <Spinner /> : (
        <>
          <p className="text-[13px] text-muted">{cases.length}件中 {Math.min(limit, cases.length)}件を表示</p>
          <ul className="flex flex-col gap-2">
            {cases.slice(0, limit).map((c) => {
              const ind = content.industries.find((i) => i.id === c.industry)
              return (
                <li key={c.id} className={`card flex items-center gap-3 ${!c.published ? 'opacity-60' : ''}`}>
                  <span className="text-xl w-7 text-center shrink-0" aria-hidden="true">{ind?.icon}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block font-bold text-[14px] truncate">{c.title}</span>
                    <span className="block text-[12px] text-muted">{ind?.name}・{STAGE_LABELS[c.stage].split(' ')[0]}・{BUDGET_LABELS[c.budget]}{!c.generated && '・詳細未生成'}</span>
                  </span>
                  <label className="flex items-center gap-2 text-[12px] font-bold shrink-0">
                    <input type="checkbox" role="switch" className="w-11 h-6 accent-primary" checked={c.published} onChange={() => togglePublished(c)} aria-label={`${c.title}を公開する`} />
                    {c.published ? '公開中' : '非公開'}
                  </label>
                </li>
              )
            })}
          </ul>
          {limit < cases.length && <button type="button" className="btn-secondary btn-sm" onClick={() => setLimit((n) => n + PAGE_SIZE)}>さらに表示（残り{cases.length - limit}件）</button>}
        </>
      )}
    </section>
  )
}

function AnnouncementsTab() {
  const { backend } = useApp()
  const [list, setList] = useState<Announcement[] | null>(null)
  const [editing, setEditing] = useState<Announcement | 'new' | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const reload = useCallback(async () => { try { setList(await backend.listAnnouncements()) } catch (e) { setErr((e as Error).message) } }, [backend])
  useEffect(() => { reload() }, [reload])
  const today = localDateISO()
  const isActive = (a: Announcement) => a.starts_at <= today && (!a.ends_at || a.ends_at >= today)

  if (!list) return <Spinner />
  return (
    <section className="flex flex-col gap-2">
      <ErrorText msg={err} />
      <ul className="flex flex-col gap-2">
        {list.map((a) => (
          <li key={a.id} className={`card ${isActive(a) ? '' : 'opacity-60'}`}>
            <div className="flex items-start gap-2">
              <span className="flex-1 min-w-0">
                <span className="block font-bold text-[15px]">{a.title}</span>
                <span className="block text-[13px] text-ink-2 mt-1">{a.body}</span>
                <span className="block text-[12px] text-muted mt-1">{a.starts_at} 〜 {a.ends_at ?? '（終了日なし）'}{isActive(a) && '　🟢 表示中'}</span>
              </span>
              <div className="flex flex-col gap-1 shrink-0">
                <button type="button" className="btn-ghost btn-sm w-auto !min-h-9 text-[13px]" onClick={() => setEditing(a)}>編集</button>
                <button type="button" className="btn-ghost btn-sm w-auto !min-h-9 text-[13px]" onClick={async () => { if (confirm(`「${a.title}」を削除しますか？`)) { await backend.deleteAnnouncement(a.id); await reload() } }}>削除</button>
              </div>
            </div>
          </li>
        ))}
        {list.length === 0 && <p className="text-[13px] text-muted">お知らせはまだありません。</p>}
      </ul>
      {editing ? (
        <AnnouncementForm value={editing === 'new' ? null : editing} onCancel={() => setEditing(null)} onSave={async (a) => { setErr(null); try { await backend.saveAnnouncement(a); setEditing(null); await reload() } catch (e) { setErr((e as Error).message) } }} />
      ) : (
        <button type="button" className="btn-primary btn-sm" onClick={() => setEditing('new')}>＋ お知らせを追加する</button>
      )}
    </section>
  )
}

function AnnouncementForm({ value, onCancel, onSave }: { value: Announcement | null; onCancel: () => void; onSave: (a: Omit<Announcement, 'id'> & { id?: string }) => void }) {
  const [title, setTitle] = useState(value?.title ?? '')
  const [body, setBody] = useState(value?.body ?? '')
  const [startsAt, setStartsAt] = useState(value?.starts_at ?? localDateISO())
  const [endsAt, setEndsAt] = useState(value?.ends_at ?? '')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    onSave({ id: value?.id, title, body, starts_at: startsAt, ends_at: endsAt || null })
  }
  return (
    <form onSubmit={submit} className="card flex flex-col gap-3">
      <h3 className="text-[16px] font-bold">{value ? 'お知らせを編集' : 'お知らせを追加'}</h3>
      <Field label="タイトル"><input id="annTitle" className="input" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={60} /></Field>
      <Field label="本文"><textarea id="annBody" className="input min-h-20 py-3" value={body} onChange={(e) => setBody(e.target.value)} required maxLength={300} /></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="表示開始日"><input id="annStart" className="input" type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required /></Field>
        <Field label="表示終了日（任意）"><input id="annEnd" className="input" type="date" value={endsAt} min={startsAt} onChange={(e) => setEndsAt(e.target.value)} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="btn-secondary btn-sm" onClick={onCancel}>やめる</button>
        <button type="submit" className="btn-primary btn-sm">保存する</button>
      </div>
    </form>
  )
}
