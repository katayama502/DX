// S-014 用語集
import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useContent } from '../lib/app-context'
import { normalize } from '../lib/engine'
import { Page, TopBar } from '../components/ui'

export default function Glossary() {
  const { content } = useContent()
  const [q, setQ] = useState('')
  const loc = useLocation()
  const list = useMemo(() => { const n = normalize(q); return content.terms.filter((t) => !n || normalize(t.term + (t.reading ?? '') + (t.variants ?? []).join('') + t.description).includes(n)) }, [content.terms, q])
  useEffect(() => { if (loc.hash) { const el = document.getElementById(decodeURIComponent(loc.hash.slice(1))); el?.scrollIntoView({ block: 'center' }); el?.classList.add('border-primary') } }, [loc.hash, list])
  return (
    <>
      <TopBar title="用語集" />
      <Page>
        <input id="gq" type="search" className="input" placeholder="用語をさがす" value={q} onChange={(e) => setQ(e.target.value)} aria-label="用語をさがす" />
        <p className="text-[13px] text-muted">{list.length}語</p>
        {list.map((t) => (
          <div key={t.term} id={t.term} className="card">
            <p className="font-bold text-[17px]">{t.term}{t.reading && <span className="text-muted font-normal text-[13px]">（{t.reading}）</span>}</p>
            <p className="text-[15px] text-ink-2">{t.description}</p>
          </div>
        ))}
      </Page>
    </>
  )
}
