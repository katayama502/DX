// 使い方・利用規約・プライバシー・アカウント設定
import { useState, type FormEvent } from 'react'
import { useApp } from '../lib/app-context'
import { ErrorText, Field, Notice, Page, TopBar, useToast } from '../components/ui'

export function Guide() {
  const steps = [
    ['🔍', '検索する', 'ホームの検索窓に「キャッシュレス」など相談の言葉を入れると、近い相談テーマが出ます。'],
    ['📖', 'まず伝える', 'テーマを開くと「まず伝えること」が3点。これを事業者に説明するだけでも一次対応になります。'],
    ['💬', 'ヒアリング', '「ヒアリングを始める」で相談ナビが質問します。事業者に聞きながらボタンを押すだけ。'],
    ['🚦', '判定を見る', '青＝その場で対応OK、黄＝資料を渡して検討、赤＝専門家につなぐ、緊急＝すぐに対応。理由も表示されます。'],
    ['🖨', '渡す・つなぐ', '青・黄は1枚資料を印刷かQRで渡す。赤は相談票を作って、自分のメールソフトで専門窓口へ送ります。'],
    ['📋', '記録する', '「記録用にコピー」で、団体の支援記録に貼り付けられる文章が出ます。相談内容はサーバーには保存されません。'],
  ]
  return (
    <>
      <TopBar title="使い方" />
      <Page>
        <p className="text-ink-2">窓口や訪問先で、事業者と一緒に見ながら使えます。</p>
        {steps.map(([icon, t, d], i) => (
          <div key={i} className="card flex gap-3"><span className="text-3xl" aria-hidden="true">{icon}</span><div><p className="font-bold text-[17px]">{i + 1}. {t}</p><p className="text-[15px] text-ink-2">{d}</p></div></div>
        ))}
        <div className="card bg-surface-2"><p className="font-bold">安心して使うために</p><ul className="list-disc pl-5 text-[15px] mt-1"><li>ヒアリングの回答はこのタブ内だけに一時保存され、相談票の本文とともにサーバーへは保存されません</li><li>案内はAIではなく、登録済みの質問と回答で動きます</li><li>迷ったら右上の「ホーム」でいつでも最初に戻れます</li></ul></div>
      </Page>
    </>
  )
}

export function Account() {
  const { session, backend, refreshSession, access } = useApp()
  const [name, setName] = useState(session?.user.name ?? '')
  const [pw, setPw] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [toast, show] = useToast()
  const save = async (e: FormEvent) => {
    e.preventDefault(); setErr(null)
    const cleanName = name.trim()
    if (!cleanName) return setErr('お名前を入力してください')
    if (pw && pw.length < 8) return setErr('パスワードは8文字以上にしてください')
    setBusy(true)
    try {
      if (cleanName !== session?.user.name) await backend.updateMyName(cleanName)
      if (pw) { await backend.updatePassword(pw); setPw('') }
      await refreshSession(); show('保存しました')
    } catch (ex) { setErr((ex as Error).message) }
    finally { setBusy(false) }
  }
  return (
    <>
      <TopBar title="アカウント" />
      <Page>
        {access !== 'ok' && <Notice kind="warn">契約終了後の閲覧期間中は、アカウント情報を変更できません。</Notice>}
        <form onSubmit={save} className="card flex flex-col gap-4">
          <Field label="お名前（相談票に自動で入ります）"><input id="aname" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={50} required disabled={access !== 'ok' || busy} /></Field>
          <Field label="新しいパスワード（変更する場合のみ・8文字以上）"><input id="apw" className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" disabled={access !== 'ok' || busy} /></Field>
          <p className="text-[13px] text-muted">メールアドレス：{session?.user.email}（変更は団体管理者へ）</p>
          <ErrorText msg={err} />
          <button type="submit" className="btn-primary" disabled={access !== 'ok' || busy}>{busy ? '保存中…' : '変更を保存する'}</button>
        </form>
      </Page>
      {toast}
    </>
  )
}

export function Terms() {
  return (
    <>
      <TopBar title="利用規約" />
      <Page>
        <div className="card text-[15px] flex flex-col gap-3">
          <p><strong>1. 利用範囲</strong>　本サービスは、契約団体の職員がその団体の業務（事業者からの相談対応）のために利用できます。</p>
          <p><strong>2. 再配布の禁止</strong>　相談テーマ・事例などのコンテンツを、団体外へ複製・再配布することはできません。ただし「1枚資料」および「共有ページ」は事業者へ渡すことができます。</p>
          <p><strong>3. 免責</strong>　本サービスの情報は一般的な参考情報であり、正確性・最新性を保証するものではありません。導入・申請の判断は利用者および事業者の責任で行ってください。</p>
          <p><strong>4. 著作権</strong>　システムおよびコンテンツの著作権は株式会社クリエットに帰属します。</p>
          <p><strong>5. 契約終了</strong>　契約期間終了後30日間は閲覧のみ可能とし、その後はアカウントを削除します。</p>
          <p className="text-muted text-[13px]">（案。Phase 0 で確定）</p>
        </div>
      </Page>
    </>
  )
}

export function Privacy() {
  return (
    <>
      <TopBar title="プライバシーポリシー" />
      <Page>
        <div className="card text-[15px] flex flex-col gap-3">
          <p><strong>取得する情報</strong>　アカウント情報（メールアドレス・氏名・所属団体）、ログイン日時、利用状況の集計（団体単位の件数）。</p>
          <p><strong>取得しない情報</strong>　ヒアリングの回答、相談票の内容、事業者の名称・連絡先。これらは利用者のブラウザ内でのみ扱い、サーバーへ送信・保存しません。</p>
          <p><strong>保存期間</strong>　アクセスログ・監査ログは90日で削除。アカウント情報は契約終了後90日で削除。</p>
          <p><strong>共有ページ</strong>　個人を特定する情報を含みません。</p>
          <p className="text-muted text-[13px]">（案。Phase 0 で確定）</p>
        </div>
      </Page>
    </>
  )
}
