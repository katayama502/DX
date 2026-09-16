// S-002 ホーム（S-012 検索結果は同じ画面内に表示）
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useContent } from '../lib/app-context'
import { search } from '../lib/engine'
import { Page, ThemeCard } from '../components/ui'
import { CaseRow } from './Cases'

export default function Home() {
  const { content, syn, session } = useContent()
  const [q, setQ] = useState('')
  const result = useMemo(() => (q.trim() ? search(content, syn, q) : null), [content, syn, q])
  const urgent = content.themes.find((t) => t.urgent)
  const frequent = content.themes.filter((t) => t.published && !t.urgent).slice(0, 8)
  const nothing = result && result.themes.length === 0 && result.cases.length === 0 && result.terms.length === 0

  return (
    <>
      <header className="sticky top-0 z-20 bg-surface border-b border-line no-print" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="mx-auto max-w-3xl flex items-center justify-between px-4 h-14">
          <span className="font-bold text-[17px] flex items-center gap-2"><span aria-hidden="true">🧭</span>DX相談ナビ</span>
          <span className="text-[13px] text-muted truncate max-w-[50%]">{session.org.name}</span>
        </div>
      </header>
      <Page>
        <h1 className="text-2xl">どんな相談ですか？</h1>
        <label className="block">
          <span className="sr-only">相談内容を検索</span>
          <input id="search" type="search" className="input text-[18px] min-h-16" placeholder="例：ホームページ、インボイス、SNS" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" enterKeyHint="search" />
        </label>

        {result ? (
          <section aria-live="polite" className="flex flex-col gap-4">
            {nothing ? (
              <div className="card text-center">
                <p className="font-bold">「{q}」に近いテーマが見つかりませんでした</p>
                <p className="text-[14px] text-muted mt-1">言い方を変えるか、下のカテゴリから探してみてください</p>
              </div>
            ) : (
              <>
                {result.themes.length > 0 && <Group title={`相談テーマ（${result.themes.length}件）`}>{result.themes.map((r) => <ThemeCard key={r.theme.id} theme={r.theme} />)}</Group>}
                {result.cases.length > 0 && <Group title={`関連する事例（${result.cases.length}件）`}>{result.cases.map((c) => <CaseRow key={c.id} c={c} industries={content.industries} />)}</Group>}
                {result.terms.length > 0 && (
                  <Group title={`用語（${result.terms.length}件）`}>
                    {result.terms.map((t) => (
                      <Link key={t.term} to={`/glossary#${encodeURIComponent(t.term)}`} className="card hover:border-primary">
                        <span className="font-bold">{t.term}</span><span className="block text-[14px] text-ink-2 line-clamp-2">{t.description}</span>
                      </Link>
                    ))}
                  </Group>
                )}
              </>
            )}
            {(nothing || result.themes.length === 0) && <Categories categories={content.categories} />}
          </section>
        ) : (
          <>
            {urgent && (
              <Link to={`/themes/${urgent.id}`} className="rounded-xl bg-lv-urgent-soft text-lv-urgent font-bold px-4 min-h-16 flex items-center gap-3 border-2 border-lv-urgent/30 hover:border-lv-urgent">
                <span className="text-2xl" aria-hidden="true">🚨</span>
                <span className="flex-1">詐欺・乗っ取り・ウイルスなど「今困っている」</span>
                <span aria-hidden="true">›</span>
              </Link>
            )}
            <Group title="よくある相談">{frequent.map((t) => <ThemeCard key={t.id} theme={t} />)}</Group>
            <Categories categories={content.categories} />
          </>
        )}
      </Page>
    </>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-[14px] font-bold tracking-wide text-muted">{title}</h2>
      {children}
    </section>
  )
}

const CAT_ICON: Record<string, string> = { '集客・発信': '📣', 'お金・会計': '💴', '店舗・販売': '🏪', '社内業務': '🗂️', 'AI活用': '🤖', 'セキュリティ・トラブル': '🛡️', '補助金・制度': '📑' }
export function Categories({ categories }: { categories: string[] }) {
  return (
    <Group title="カテゴリから探す">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {categories.map((c) => (
          <Link key={c} to={`/themes?cat=${encodeURIComponent(c)}`} className="card flex flex-col items-center justify-center min-h-20 font-bold hover:border-primary text-center">
            <span className="text-2xl" aria-hidden="true">{CAT_ICON[c] ?? '📂'}</span>{c}
          </Link>
        ))}
      </div>
    </Group>
  )
}
