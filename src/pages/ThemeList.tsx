// S-003 テーマ一覧（カテゴリ別）
import { Link, useSearchParams } from 'react-router-dom'
import { useContent } from '../lib/app-context'
import { Page, ThemeCard, TopBar } from '../components/ui'

export default function ThemeList() {
  const { content } = useContent()
  const [sp, setSp] = useSearchParams()
  const cat = sp.get('cat')
  const cats = cat ? [cat] : content.categories
  return (
    <>
      <TopBar title="相談テーマ" back={!!cat} />
      <Page>
        {cat ? (
          <button type="button" onClick={() => setSp({})} className="btn-ghost btn-sm self-start">‹ すべてのカテゴリ</button>
        ) : (
          <p className="text-ink-2">相談内容に近いテーマを選んでください。</p>
        )}
        {cats.map((c) => {
          const list = content.themes.filter((t) => t.category === c && t.published)
          return (
            <section key={c} className="flex flex-col gap-2">
              <h2 className="text-[18px] flex items-center justify-between">{c}{!cat && <Link to={`/themes?cat=${encodeURIComponent(c)}`} className="text-[14px] text-primary font-bold">このカテゴリだけ</Link>}</h2>
              {list.length === 0 ? <p className="text-muted text-[14px]">準備中です</p> : list.map((t) => <ThemeCard key={t.id} theme={t} />)}
            </section>
          )
        })}
      </Page>
    </>
  )
}
