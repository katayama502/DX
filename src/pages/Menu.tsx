// メニュー（S-013/S-014 への入口・団体管理・アカウント・ログアウト）
import { Link } from 'react-router-dom'
import { useApp } from '../lib/app-context'
import { Page, TopBar } from '../components/ui'

const ROLE_LABEL = { staff: 'スタッフ', org_admin: '団体管理者', ops_admin: 'クリエット管理者' }

export default function Menu() {
  const { session, backend } = useApp()
  if (!session) return null
  const { user, org } = session
  const Item = ({ to, icon, title, sub, hl }: { to: string; icon: string; title: string; sub?: string; hl?: boolean }) => (
    <Link to={to} className={`card flex items-center gap-3 hover:border-primary min-h-16 ${hl ? 'border-primary' : ''}`}>
      <span className="text-2xl w-9 text-center" aria-hidden="true">{icon}</span>
      <span className="flex-1"><span className="block font-bold text-[16px]">{title}</span>{sub && <span className="block text-[13px] text-muted">{sub}</span>}</span>
      <span className="text-muted text-2xl" aria-hidden="true">›</span>
    </Link>
  )
  return (
    <>
      <TopBar title="メニュー" back={false} right={<span />} />
      <Page>
        <Item to="/diagnosis" icon="📊" title="DX成熟度診断" sub="6つの質問で現在地を確認" />
        <Item to="/glossary" icon="📖" title="用語集" sub="五十音順・検索" />
        <Item to="/guide" icon="❓" title="使い方（3分）" />
        {(user.role === 'org_admin' || user.role === 'ops_admin') && <Item to="/admin/org" icon="⚙️" title="団体管理" sub="スタッフ・専門相談窓口・団体の設定" hl />}
        {user.role === 'ops_admin' && <Item to="/admin/ops" icon="🏢" title="運営管理（クリエット）" sub="団体・契約・利用状況" hl />}
        <section className="card">
          <p className="label">アカウント</p>
          <p className="font-bold">{user.name || '（氏名未設定）'} <span className="text-[13px] text-muted font-normal">{ROLE_LABEL[user.role]}</span></p>
          <p className="text-[15px]">{org.name}</p>
          <p className="text-[13px] text-muted">契約：{org.contract_end} まで（{org.status === 'trial' ? '試行利用' : '契約中'}）</p>
          <Link to="/account" className="btn-ghost btn-sm mt-2">氏名・パスワードの変更</Link>
        </section>
        <button type="button" className="btn-secondary" onClick={() => backend.signOut()}>ログアウト</button>
        <p className="text-[12px] text-muted text-center">DX相談ナビ v0.1（デモ版）・株式会社クリエット・<Link to="/terms" className="underline">利用規約</Link>・<Link to="/privacy" className="underline">プライバシー</Link></p>
      </Page>
    </>
  )
}
