import { useEffect } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import { RequireAuth, RequireRole } from './components/layout'
import Login from './pages/Login'
import Expired from './pages/Expired'
import Welcome from './pages/Welcome'
import Home from './pages/Home'
import ThemeList from './pages/ThemeList'
import ThemeDetail from './pages/ThemeDetail'
import Chat from './pages/Chat'
import Result from './pages/Result'
import Ticket from './pages/Ticket'
import OnePager from './pages/OnePager'
import Share from './pages/Share'
import CaseList, { CaseDetail } from './pages/Cases'
import Menu from './pages/Menu'
import Glossary from './pages/Glossary'
import Diagnosis from './pages/Diagnosis'
import { Account, Guide, Privacy, Terms } from './pages/Static'
import OrgAdmin from './pages/admin/OrgAdmin'
import OpsAdmin from './pages/admin/OpsAdmin'
import ContentAdmin from './pages/admin/ContentAdmin'
import { ShowModeProvider } from './components/ShowMode'

/** 画面遷移のたびに先頭へ（前の画面のスクロール位置を引き継がない） */
function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  return null
}

export default function App() {
  return (
    <ShowModeProvider>
    <ScrollToTop />
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/expired" element={<Expired />} />
      <Route path="/welcome" element={<Welcome />} />
      <Route path="/reset" element={<Welcome />} />
      <Route path="/share/:id" element={<Share />} />
      <Route element={<RequireAuth />}>
        <Route path="/" element={<Home />} />
        <Route path="/themes" element={<ThemeList />} />
        <Route path="/themes/:id" element={<ThemeDetail />} />
        <Route path="/themes/:id/chat" element={<Chat />} />
        <Route path="/themes/:id/result" element={<Result />} />
        <Route path="/themes/:id/ticket" element={<Ticket />} />
        <Route path="/themes/:id/onepager" element={<OnePager />} />
        <Route path="/cases" element={<CaseList />} />
        <Route path="/cases/:id" element={<CaseDetail />} />
        <Route path="/menu" element={<Menu />} />
        <Route path="/glossary" element={<Glossary />} />
        <Route path="/diagnosis" element={<Diagnosis />} />
        <Route path="/guide" element={<Guide />} />
        <Route path="/account" element={<Account />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route element={<RequireRole roles={['org_admin', 'ops_admin']} />}>
          <Route path="/admin/org" element={<OrgAdmin />} />
        </Route>
        <Route element={<RequireRole roles={['ops_admin']} />}>
          <Route path="/admin/ops" element={<OpsAdmin />} />
          <Route path="/admin/content" element={<ContentAdmin />} />
        </Route>
      </Route>
      <Route path="*" element={<Login />} />
    </Routes>
    </ShowModeProvider>
  )
}
