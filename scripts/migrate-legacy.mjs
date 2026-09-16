// 既存 DX事例360 (../index.html) から事例・ツール・用語データを抽出し content/ に書き出す（1回きりの移行スクリプト）
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

const src = fs.readFileSync(path.resolve('../index.html'), 'utf8')
const lines = src.split('\n')
const slice = (from, to) => lines.slice(from - 1, to).join('\n')

// 行番号は index.html の grep 結果に基づく
const code = [
  slice(695, 708),   // INDUSTRIES
  slice(709, 1082),  // CASES
  slice(2490, 2851), // TOOL_MAP
  slice(2878, 2951), // BUDGET
  slice(2957, 3046), // TOOL_URLS
  slice(3058, 3100), // GLOSSARY_DICT
].join('\n')
const ctx = {}
vm.runInNewContext(code + '\n;__out={INDUSTRIES,CASES,TOOL_MAP,BUDGET,TOOL_URLS,GLOSSARY_DICT}', ctx)
const { INDUSTRIES, CASES, TOOL_MAP, BUDGET, TOOL_URLS, GLOSSARY_DICT } = ctx.__out

const outDir = path.resolve('content/cases')
fs.mkdirSync(outDir, { recursive: true })
let n = 0
for (const [industry, no, stage, title, summary] of CASES) {
  const key = `${industry}_${no}`
  const tool = TOOL_MAP[key]
  const id = `${industry}-${String(no).padStart(3, '0')}`
  const obj = {
    id,
    industry,
    no,
    stage,
    title,
    summary,
    budget: BUDGET[key] ?? 0,
    tools: tool ? [tool.name] : [],
    detail: tool
      ? { points: [], steps: [], tips: '', tool: { name: tool.name, what: tool.what, how: tool.how, url: TOOL_URLS[tool.name] ?? null }, glossary: [] }
      : { points: [], steps: [], tips: '', tool: null, glossary: [] },
    themes: [],
    type: 'model',
    reviewedAt: '2026-09',
    generated: false, // 事前生成（AI）と人の確認が済んだら true にする
  }
  fs.writeFileSync(path.join(outDir, `${id}.json`), JSON.stringify(obj, null, 2) + '\n')
  n++
}
fs.writeFileSync('content/industries.json', JSON.stringify(INDUSTRIES, null, 2) + '\n')
fs.writeFileSync('content/tool-urls.json', JSON.stringify(TOOL_URLS, null, 2) + '\n')

// 用語集：正規表現パターンを表記ゆれ配列に変換
const terms = GLOSSARY_DICT.map((g) => ({
  term: g.term,
  description: g.desc,
  variants: String(g.pattern).replace(/^\/|\/[a-z]*$/g, '').split('|'),
}))
fs.writeFileSync('content/terms.legacy.json', JSON.stringify(terms, null, 2) + '\n')
console.log(`cases: ${n}, industries: ${INDUSTRIES.length}, tools: ${Object.keys(TOOL_URLS).length}, terms: ${terms.length}`)
