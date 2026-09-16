// 相談ナビの中核ロジック（AI不使用）：正規化・表記ゆれ・テーマ判定・横断検索・対話ツリー・レベル判定
import type { Case, ContentBundle, DialogNode, Level, LevelRule, Term, Theme } from './types'
import { LEVEL_ORDER } from './types'

// ---------- 正規化 ----------
export function normalize(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ぁ-ん]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60)) // ひらがな→カタカナ
    .replace(/[\s　・，,。．.、!！?？「」『』（）()]/g, '')
}

export class Synonymizer {
  private map = new Map<string, string>()
  constructor(list: ContentBundle['synonyms']) {
    for (const s of list) {
      this.map.set(normalize(s.canonical), s.canonical)
      for (const v of s.variants) this.map.set(normalize(v), s.canonical)
    }
    // 長い語から置換する
    this.keys = [...this.map.keys()].sort((a, b) => b.length - a.length)
  }
  private keys: string[]
  /** 入力文に含まれる表記ゆれを正規語に置き換え、含まれていた正規語の一覧も返す */
  apply(input: string): { text: string; canonicals: string[] } {
    let text = normalize(input)
    const found: string[] = []
    for (const k of this.keys) {
      if (k && text.includes(k)) {
        const c = this.map.get(k)!
        if (!found.includes(c)) found.push(c)
        text = text.split(k).join(normalize(c))
      }
    }
    return { text, canonicals: found }
  }
}

// ---------- テーマ判定・横断検索 ----------
export interface SearchResult {
  themes: { theme: Theme; score: number }[]
  cases: Case[]
  terms: Term[]
  /** テーマ判定：確定した1件（2位の1.5倍以上のスコア）。なければ null */
  confident: Theme | null
}

export function search(bundle: ContentBundle, syn: Synonymizer, raw: string, limits = { themes: 5, cases: 5, terms: 3 }): SearchResult {
  const q = raw.trim()
  if (!q) return { themes: [], cases: [], terms: [], confident: null }
  const { text, canonicals } = syn.apply(q)
  // 全文・表記ゆれの正規語・空白区切りの語をすべて照合対象にする
  const tokens = [...new Set([text, ...canonicals.map(normalize), ...q.split(/[\s　,、]+/).map(normalize).filter((t) => t.length >= 2)])]

  const themeScores = new Map<string, number>()
  for (const k of bundle.keywords) {
    const kw = normalize(syn.apply(k.keyword).text)
    if (kw && tokens.some((t) => t.includes(kw))) themeScores.set(k.themeId, (themeScores.get(k.themeId) ?? 0) + k.weight)
  }
  for (const t of bundle.themes) {
    if (!t.published) continue
    const name = normalize(t.name)
    if (tokens.some((tk) => name.includes(tk) || tk.includes(name))) themeScores.set(t.id, (themeScores.get(t.id) ?? 0) + 6)
  }
  const themes = [...themeScores.entries()]
    .map(([id, score]) => ({ theme: bundle.themes.find((t) => t.id === id)!, score }))
    .filter((x) => x.theme?.published)
    .sort((a, b) => b.score - a.score)
    .slice(0, limits.themes)
  const confident = themes.length > 0 && (themes.length === 1 || themes[0].score >= themes[1].score * 1.5) ? themes[0].theme : null

  const cases = bundle.cases
    .filter((c) => { const s = normalize(c.title + c.summary + c.tools.join('')); return tokens.some((t) => s.includes(t)) })
    .sort((a, b) => a.stage - b.stage || a.budget - b.budget)
    .slice(0, limits.cases)
  const terms = bundle.terms
    .filter((t) => { const s = normalize(t.term + (t.reading ?? '') + (t.variants ?? []).join('')); return tokens.some((tk) => s.includes(tk)) })
    .slice(0, limits.terms)
  return { themes, cases, terms, confident }
}

// ---------- 対話ツリー ----------
export type Answers = Record<string, string[]>

export function nodesForTheme(bundle: ContentBundle, themeId: string): DialogNode[] {
  const shared = bundle.nodes.filter((n) => n.themeId === null).sort((a, b) => a.sort - b.sort)
  const own = bundle.nodes.filter((n) => n.themeId === themeId && n.id !== 'end').sort((a, b) => a.sort - b.sort)
  // テーマ固有の冒頭説明（say）→ 共通質問 → テーマ固有の質問。'end' は完了メッセージとして別扱い
  const intro = own.filter((n) => n.type === 'say')
  const rest = own.filter((n) => n.type !== 'say')
  return [...intro, ...shared, ...rest]
}
/** 対話の完了メッセージ（'end' ノード） */
export function endText(bundle: ContentBundle, themeId: string): string {
  return bundle.nodes.find((n) => n.themeId === themeId && n.id === 'end')?.text ?? 'ありがとうございます。ここまでの内容をまとめました。'
}

export function isVisible(node: DialogNode, answers: Answers): boolean {
  if (!node.showIf) return true
  return Object.entries(node.showIf).every(([qid, opts]) => (answers[qid] ?? []).some((a) => opts.includes(a)))
}

/** 分岐変更で非表示になった回答を取り除く。連鎖して非表示になる場合も収束するまで整理する。 */
export function pruneHiddenAnswers(nodes: DialogNode[], answers: Answers): Answers {
  let next = { ...answers }
  let changed = true
  while (changed) {
    changed = false
    for (const node of nodes) {
      if (node.type !== 'say' && next[node.id] !== undefined && !isVisible(node, next)) {
        delete next[node.id]
        changed = true
      }
    }
  }
  return next
}

/** 判定・出力に使ってよい、現在表示されている質問の回答だけを返す。 */
export function visibleAnswers(nodes: DialogNode[], answers: Answers): Answers {
  const pruned = pruneHiddenAnswers(nodes, answers)
  return Object.fromEntries(nodes
    .filter((node) => node.type !== 'say' && isVisible(node, pruned) && pruned[node.id] !== undefined)
    .map((node) => [node.id, pruned[node.id]]))
}

/** 回答済み・非表示をスキップして、次に表示すべきノードを返す。すべて終わっていれば null */
export function nextNode(nodes: DialogNode[], answers: Answers, seenSay: Set<string>): DialogNode | null {
  for (const n of nodes) {
    if (!isVisible(n, answers)) continue
    if (n.type === 'say') { if (!seenSay.has(n.id)) return n; continue }
    if (answers[n.id] === undefined) return n
  }
  return null
}

/** 進捗表示用：表示対象の質問数と回答済み数 */
export function progress(nodes: DialogNode[], answers: Answers): { done: number; total: number } {
  const qs = nodes.filter((n) => n.type !== 'say' && isVisible(n, answers))
  return { done: qs.filter((q) => answers[q.id] !== undefined).length, total: qs.length }
}

// ---------- レベル判定 ----------
export interface Judgement {
  level: Level
  reasons: string[]
  matched: LevelRule[]
}

const UNKNOWN_ANSWERS = new Set(['わからない', '答えたくない', 'まだわからない', 'まだ決めていない', '（とばした）'])

export function judge(theme: Theme, rules: LevelRule[], answers: Answers): Judgement {
  let level: Level = theme.level
  const reasons: string[] = []
  const matched: LevelRule[] = []
  const rank = (l: Level) => LEVEL_ORDER.indexOf(l)
  for (const r of rules.filter((r) => r.themeId === theme.id)) {
    const hit = Object.entries(r.if).every(([qid, opts]) => (answers[qid] ?? []).some((a) => opts.includes(a)))
    if (!hit) continue
    matched.push(r)
    reasons.push(r.reason)
    if (rank(r.level) > rank(level)) level = r.level
  }
  // 「わからない」が3問以上続いたら黄に上げる（下げることはない）
  const unknowns = Object.values(answers).filter((a) => a.every((x) => UNKNOWN_ANSWERS.has(x))).length
  if (unknowns >= 3 && rank('yellow') > rank(level)) {
    level = 'yellow'
    reasons.push('「わからない」が3問以上あり、状況の把握が難しいため資料を渡して再相談を')
  }
  if (reasons.length === 0) reasons.push(`このテーマの基本の対応レベルです（${themeLevelReason(theme.level)}）`)
  return { level, reasons, matched }
}
function themeLevelReason(l: Level) {
  return { blue: '基本情報の案内で解決できることが多い', yellow: '事業者側での比較検討が必要', red: '専門知識や個別判断が必要', urgent: '被害が発生している可能性' }[l]
}

// ---------- サマリー・相談票テキスト ----------
export function answerSummary(nodes: DialogNode[], answers: Answers): { q: string; a: string }[] {
  const visible = visibleAnswers(nodes, answers)
  return nodes
    .filter((n) => n.type !== 'say' && visible[n.id] !== undefined)
    .map((n) => ({ q: n.text, a: visible[n.id].join('、') }))
}

export function buildSummaryText(opts: { date: string; orgName: string; staffName: string; theme: Theme; judgement: Judgement; qa: { q: string; a: string }[]; opinion?: string }): string {
  const meta = { blue: '青：その場で対応OK', yellow: '黄：資料を渡して検討', red: '赤：専門家につなぐ', urgent: '緊急：すぐに対応' }[opts.judgement.level]
  const lines = [
    `【DX相談ナビ 相談サマリー】`,
    `日付：${opts.date}`,
    `団体・担当：${opts.orgName} ${opts.staffName}`,
    `相談テーマ：${opts.theme.name}`,
    `対応レベル：${meta}`,
    `判定理由：${opts.judgement.reasons.join('／')}`,
    ``,
    `■ヒアリング内容`,
    ...opts.qa.map((x) => `・${x.q} → ${x.a}`),
    ``,
    `■伝えた内容`,
    ...opts.theme.firstTell.map((x) => `・${x}`),
  ]
  if (opts.opinion) lines.push(``, `■相談員の所見`, opts.opinion)
  lines.push(``, `※本サービスの情報は一般的な参考情報です（確認日 ${opts.theme.reviewedAt}）`)
  return lines.join('\n')
}

/** 確認日から12か月を超えていれば true */
export function isStale(reviewedAt: string, now = new Date()): boolean {
  const [y, m] = reviewedAt.split('-').map(Number)
  const d = new Date(y, m - 1, 1)
  return now.getTime() - d.getTime() > 366 * 24 * 3600 * 1000
}
export function formatReviewed(reviewedAt: string): string {
  const [y, m] = reviewedAt.split('-')
  return `${y}年${Number(m)}月`
}
