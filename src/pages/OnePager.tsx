// S-008 事業者向け1枚資料：A4縦1枚。QRコードで共有ページ（ログイン不要）へ
import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import QRCode from 'qrcode'
import { useApp, useContent } from '../lib/app-context'
import { formatReviewed } from '../lib/engine'
import { Page, TopBar } from '../components/ui'

export default function OnePager() {
  const { id } = useParams()
  const { content, session } = useContent()
  const { backend, access } = useApp()
  const theme = content.themes.find((t) => t.id === id)
  const [qr, setQr] = useState('')
  const [big, setBig] = useState(false)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const shareUrl = `${location.origin}/share/${theme?.id}?org=${encodeURIComponent(session.org.code)}`
  useEffect(() => { QRCode.toDataURL(shareUrl, { width: 320, margin: 1 }).then(setQr).catch(() => setQr('')) }, [shareUrl])
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (big && !dialog.open) dialog.showModal()
    if (!big && dialog.open) dialog.close()
  }, [big])
  if (!theme) return <Navigate to="/themes" replace />
  const relCase = theme.cases.map((cid) => content.cases.find((c) => c.id === cid)).find(Boolean)
  const print = () => { if (access === 'ok') void backend.bumpUsage('onepagers').catch(() => undefined); window.print() }

  return (
    <>
      <TopBar title="1枚資料" />
      <Page>
        <article className="card print-sheet p-6 flex flex-col gap-4" lang="ja">
          <header className="flex items-start justify-between gap-3 border-b-2 border-ink pb-2">
            <div>
              <p className="text-[12px] text-muted">DX相談ナビ　事業者向け1枚資料</p>
              <h1 className="text-2xl">{theme.icon} {theme.name}</h1>
            </div>
            {session.org.logo_url && <img src={session.org.logo_url} alt={session.org.name} className="h-12 object-contain" />}
          </header>
          <section>
            <h2 className="text-[17px] mb-1">まず知っておくこと</h2>
            <ul className="list-disc pl-6 text-[16px]">{theme.firstTell.map((t, i) => <li key={i}>{t}</li>)}</ul>
          </section>
          {theme.checklist.length > 0 && (
            <section>
              <h2 className="text-[17px] mb-1">初動チェックリスト</h2>
              <ul className="pl-1 text-[16px]">{theme.checklist.map((t, i) => <li key={i}>☐ {t}</li>)}</ul>
            </section>
          )}
          <section>
            <h2 className="text-[17px] mb-1">次にやること（3ステップ）</h2>
            <ol className="list-decimal pl-6 text-[16px]">{theme.nextSteps.map((t, i) => <li key={i}>{t}</li>)}</ol>
          </section>
          {theme.cost.length > 0 && (
            <section>
              <h2 className="text-[17px] mb-1">費用の目安 <span className="text-[12px] text-muted font-normal">（確認日 {formatReviewed(theme.reviewedAt)}）</span></h2>
              <ul className="list-disc pl-6 text-[15px]">{theme.cost.map((t, i) => <li key={i}>{t}</li>)}</ul>
            </section>
          )}
          {relCase && (
            <section>
              <h2 className="text-[17px] mb-1">参考事例</h2>
              <p className="text-[15px]"><strong>{relCase.title}</strong>　{relCase.summary}<span className="text-muted text-[12px]">（導入イメージを示すモデルケースです）</span></p>
            </section>
          )}
          <footer className="flex items-end justify-between gap-4 border-t border-line pt-3">
            <div className="text-[15px]">
              <p className="font-bold">相談先</p>
              <p>{session.org.name}{session.org.contact && <><br />📞 {session.org.contact}</>}</p>
              {session.org.region_links.map((l) => <p key={l.url} className="text-[13px] text-ink-2">{l.name}：{l.url}</p>)}
              <p className="text-[11px] text-muted mt-2">本資料の情報は一般的な参考情報です。導入や申請の前に、必ず提供元や公式情報をご確認ください。</p>
            </div>
            {qr && (
              <button type="button" onClick={() => setBig(true)} className="shrink-0 text-center" aria-label="QRコードを大きく表示">
                <img src={qr} alt="共有ページのQRコード" className="w-24 h-24" />
                <span className="block text-[10px] text-muted">スマホで読み取り</span>
              </button>
            )}
          </footer>
        </article>
        <div className="grid grid-cols-2 gap-2 no-print">
          <button type="button" className="btn-accent" onClick={print}>🖨 印刷する</button>
          <button type="button" className="btn-secondary" onClick={() => setBig(true)} disabled={!qr}>📱 QRを大きく</button>
        </div>
        <p className="text-[13px] text-muted no-print">PDFで保存するには、印刷画面で「PDFとして保存」を選んでください。共有ページには事業者名や相談内容は含まれません。</p>
        <Link to={`/themes/${theme.id}`} className="btn-ghost btn-sm no-print">テーマに戻る</Link>
      </Page>
      <dialog ref={dialogRef} onCancel={() => setBig(false)} onClose={() => setBig(false)} aria-labelledby="qr-dialog-title" className="m-auto w-full max-w-lg rounded-2xl bg-white text-ink p-6 backdrop:bg-ink/70">
        <div className="flex flex-col items-center justify-center gap-4">
          <p id="qr-dialog-title" className="text-xl font-bold text-center text-ink">{theme.name}</p>
          <img src={qr} alt="共有ページのQRコード" className="w-72 h-72 max-w-full" />
          <p className="text-ink-2 text-center">スマホのカメラで読み取ると、この内容をいつでも見られます</p>
          <button type="button" className="btn-primary max-w-xs" onClick={() => setBig(false)}>閉じる</button>
        </div>
      </dialog>
    </>
  )
}
