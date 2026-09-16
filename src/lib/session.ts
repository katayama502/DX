// ヒアリング回答は sessionStorage のみ（サーバーには送らない）。タブを閉じると消える。
import type { Answers } from './engine'

const KEY = 'navi.hearing'
interface HearingState {
  shared: Answers                    // 共通質問（テーマをまたいで引き継ぐ）
  byTheme: Record<string, Answers>   // テーマ固有の回答
  seenSay: Record<string, string[]>
}
const empty = (): HearingState => ({ shared: {}, byTheme: {}, seenSay: {} })

export function loadHearing(): HearingState {
  try { const raw = sessionStorage.getItem(KEY); return raw ? { ...empty(), ...JSON.parse(raw) } : empty() } catch { return empty() }
}
export function saveHearing(s: HearingState) {
  try { sessionStorage.setItem(KEY, JSON.stringify(s)) } catch { /* private mode 等では保持しない */ }
}
export function clearHearing() {
  try { sessionStorage.removeItem(KEY) } catch { /* noop */ }
}
export function clearThemeHearing(themeId: string) {
  const s = loadHearing(); delete s.byTheme[themeId]; delete s.seenSay[themeId]; saveHearing(s)
}

// 「事業者に見せるモード」など画面上の好みは localStorage（個人情報なし）
export function getPref<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(`navi.pref.${key}`); return v === null ? fallback : (JSON.parse(v) as T) } catch { return fallback }
}
export function setPref<T>(key: string, value: T) {
  try { localStorage.setItem(`navi.pref.${key}`, JSON.stringify(value)) } catch { /* noop */ }
}
