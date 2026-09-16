// 「事業者に見せるモード」：相談員向けの注釈（.staff-only）を隠し、文字を大きくする
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { getPref, setPref } from '../lib/session'

const ShowModeContext = createContext<[boolean, (v: boolean) => void] | null>(null)

export function ShowModeProvider({ children }: { children: ReactNode }) {
  const [on, setOn] = useState<boolean>(() => getPref('showMode', false))
  useEffect(() => {
    document.documentElement.classList.toggle('show-mode', on)
    setPref('showMode', on)
  }, [on])
  useEffect(() => () => document.documentElement.classList.remove('show-mode'), [])
  return <ShowModeContext.Provider value={[on, setOn]}>{children}</ShowModeContext.Provider>
}

export function useShowMode(): [boolean, (v: boolean) => void] {
  const value = useContext(ShowModeContext)
  if (!value) throw new Error('ShowModeProvider の外で useShowMode が呼ばれました')
  return value
}

export function ShowModeToggle() {
  const [on, setOn] = useShowMode()
  return (
    <label className="flex items-center justify-between gap-3 card py-2 min-h-12 no-print cursor-pointer">
      <span className="text-[15px]"><span aria-hidden="true">👀</span> 事業者に見せるモード<span className="block text-[12px] text-muted">相談員向けのメモを隠して文字を大きくします</span></span>
      <input type="checkbox" role="switch" className="w-12 h-7 accent-primary" checked={on} onChange={(e) => setOn(e.target.checked)} aria-label="事業者に見せるモード" />
    </label>
  )
}
