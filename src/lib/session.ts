// ヒアリング回答は sessionStorage のみ（サーバーには送らない）。タブを閉じると消える。
import type { Answers } from './engine'

const KEY = 'navi.hearing'
const OWNER_KEY = 'navi.hearing.owner'
interface HearingState {
  shared: Answers                    // 共通質問（テーマをまたいで引き継ぐ）
  byTheme: Record<string, Answers>   // テーマ固有の回答
  seenSay: Record<string, string[]>
  consultationIds: Record<string, string> // 同じテーマをやり直した場合も別相談として数える
}
const empty = (): HearingState => ({ shared: {}, byTheme: {}, seenSay: {}, consultationIds: {} })

const newConsultationId = () => {
  try { return crypto.randomUUID() } catch { return `${Date.now()}-${Math.random().toString(36).slice(2)}` }
}

export function loadHearing(): HearingState {
  try { const raw = sessionStorage.getItem(KEY); return raw ? { ...empty(), ...JSON.parse(raw) } : empty() } catch { return empty() }
}
export function saveHearing(s: HearingState) {
  try { sessionStorage.setItem(KEY, JSON.stringify(s)) } catch { /* private mode 等では保持しない */ }
}
export function clearHearing() {
  try { sessionStorage.removeItem(KEY); sessionStorage.removeItem(OWNER_KEY) } catch { /* noop */ }
}
/** 同じタブで別ユーザーに切り替わった場合に、前ユーザーの相談内容を破棄する。 */
export function bindHearingToUser(userId: string) {
  try {
    const owner = sessionStorage.getItem(OWNER_KEY)
    if (owner !== userId) sessionStorage.removeItem(KEY)
    sessionStorage.setItem(OWNER_KEY, userId)
  } catch { /* private mode 等では保持しない */ }
}
export function clearThemeHearing(themeId: string) {
  const s = loadHearing()
  delete s.byTheme[themeId]
  delete s.seenSay[themeId]
  s.consultationIds[themeId] = newConsultationId()
  saveHearing(s)
}
export function getConsultationId(themeId: string): string {
  const s = loadHearing()
  if (!s.consultationIds[themeId]) {
    s.consultationIds[themeId] = newConsultationId()
    saveHearing(s)
  }
  return s.consultationIds[themeId]
}

// 「事業者に見せるモード」など画面上の好みは localStorage（個人情報なし）
export function getPref<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(`navi.pref.${key}`); return v === null ? fallback : (JSON.parse(v) as T) } catch { return fallback }
}
export function setPref<T>(key: string, value: T) {
  try { localStorage.setItem(`navi.pref.${key}`, JSON.stringify(value)) } catch { /* noop */ }
}
