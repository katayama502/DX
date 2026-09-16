// S-009 共有ページ（ログイン不要）：テーマの公開項目＋団体の相談先だけ。他ページへのリンクなし
import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { backend } from '../lib/app-context'
import type { SharePayload } from '../lib/backend'
import { formatReviewed } from '../lib/engine'

export default function Share() {
  const { id } = useParams()
  const [sp] = useSearchParams()
  const org = (sp.get('org') ?? '').replace(/[^a-z0-9-]/g, '')
  const [data, setData] = useState<SharePayload | null | 'error'>(null)
  useEffect(() => { backend.getShare(id ?? '', org).then(setData).catch(() => setData('error')) }, [id, org])
  if (data === null) return <main className="p-8 text-center text-muted">読み込み中…</main>
  if (data === 'error' || !data.theme) return <main className="p-8 text-center"><p className="font-bold">このページは表示できません</p><p className="text-muted text-[15px] mt-2">相談した窓口にお問い合わせください。</p></main>
  const t = data.theme
  return (
    <main className="mx-auto max-w-xl px-5 py-6 flex flex-col gap-5 text-[18px] leading-relaxed">
      <p className="text-[13px] text-muted">DX相談ナビ{data.org && <>　{data.org.name}</>}</p>
      <h1 className="text-[26px]">{t.icon} {t.name}</h1>
      <p className="text-[13px] text-muted -mt-3">確認日：{formatReviewed(t.reviewedAt)}</p>
      <Block title="まず知っておくこと"><ul className="list-disc pl-6">{t.firstTell.map((x, i) => <li key={i}>{x}</li>)}</ul></Block>
      {t.checklist.length > 0 && <Block title="初動チェックリスト"><ul className="pl-1">{t.checklist.map((x, i) => <li key={i}>☐ {x}</li>)}</ul></Block>}
      <Block title="次にやること"><ol className="list-decimal pl-6">{t.nextSteps.map((x, i) => <li key={i}>{x}</li>)}</ol></Block>
      {t.cost.length > 0 && <Block title="費用の目安"><ul className="list-disc pl-6 text-[16px]">{t.cost.map((x, i) => <li key={i}>{x}</li>)}</ul></Block>}
      {t.links.length > 0 && <Block title="公式情報">{t.links.map((l) => <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className="block text-primary underline break-all">{l.name}</a>)}</Block>}
      {data.org && (
        <Block title="相談先">
          <p className="font-bold">{data.org.name}</p>
          {data.org.contact && <a href={`tel:${data.org.contact.replace(/[^\d+]/g, '')}`} className="block text-primary underline text-[20px]">📞 {data.org.contact}</a>}
          {data.org.region_links.map((l) => <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className="block text-primary underline text-[16px]">{l.name}</a>)}
        </Block>
      )}
      <p className="text-[13px] text-muted border-t border-line pt-3">本サービスの情報は一般的な参考情報です。製品の価格・仕様や制度の内容は変更されることがあります。導入や申請の前に、必ず提供元や公式情報をご確認ください。特定の製品・事業者を推奨するものではありません。</p>
    </main>
  )
}
function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="bg-surface border border-line rounded-xl p-4"><h2 className="text-[18px] mb-2">{title}</h2>{children}</section>
}
