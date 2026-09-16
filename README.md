# DX相談ナビ（仮称）

商工会・商工会議所・市役所の職員が、事業者からの DX・IT・AI 相談に「その場で何を聞き・どう答え・自分で答えてよいか」を判断できるようにする一次対応支援アプリ。
設計書：`../dx360-soudan-navi-spec.pdf`（仕様書 v0.1）＋ Artifact「DX相談ナビ 設計書」。

## 特徴
- **AI 不使用**：相談ナビチャットは `content/` に登録した質問・選択肢・判定ルールで動く（運用中の AI 費用ゼロ）
- **個人情報を持たない**：ヒアリング回答・相談票はブラウザの `sessionStorage` のみ。サーバーに送らない
- **3層アカウント**：クリエット管理者（ops_admin）／団体管理者（org_admin）／スタッフ（staff）＋ログイン不要の共有ページ
- **スマホ優先**：本文16px以上・ボタン48px以上・色＋アイコン＋文言の三重表示

## 動かす

```bash
npm install
npm run dev        # http://localhost:5173（demo モード：ローカルで認証を模擬）
```

demo モードのアカウント（パスワードはすべて `demo1234`）：

| 役割 | メール |
|---|---|
| スタッフ（相談員） | staff@masuda-cci.demo |
| 団体管理者 | admin@masuda-cci.demo |
| クリエット管理者 | ops@creatte.demo |
| 契約終了の団体 | expired@old-org.demo |

demo データはブラウザの localStorage（`navi.demo.db`）に保存される。初期化したいときは DevTools で削除する。

## ディレクトリ

```
content/            コンテンツのソース（Git で管理）
  themes/*.md       相談テーマ（frontmatter＋「まず伝えること／よくある誤解／費用・期間の目安／次にやること／用語」）
  dialogs/*.yaml    対話ツリー（_shared.yaml は共通質問）
  rules/*.yaml      対応レベル判定ルール（上げる方向のみ）
  keywords/_all.yaml テーマ判定キーワードと重み
  synonyms.yaml     表記ゆれ辞書
  terms.yaml        用語集（terms.legacy.json は旧 DX事例360 から移行）
  cases/*.json      事例360件（旧 index.html から移行。detail は事前生成後に埋める）
scripts/
  build-content.ts  content/ を検証して src/generated/content.json を生成（--push で Supabase へ投入）
  migrate-legacy.mjs 旧 index.html からの一回きりの移行
src/
  lib/engine.ts     正規化・表記ゆれ・テーマ判定・横断検索・対話ツリー・レベル判定
  lib/backend.*.ts  demo / supabase の2実装（同じ Backend インターフェース）
  pages/            画面（S-001〜S-017）
supabase/
  migrations/0001_init.sql  テーブル・RLS・RPC・トリガー
  functions/invite-user/    スタッフ招待（service role で auth.admin.inviteUserByEmail）
```

## コンテンツを追加する
1. `content/themes/<id>.md`、`content/dialogs/<id>.yaml`、`content/rules/<id>.yaml` を作り、`content/keywords/_all.yaml` にキーワードを足す
2. `npm run content:build` — 必須項目・分岐の参照先・選択肢の存在・事例IDをチェックし、エラーがあれば止まる
3. 本番へは `npm run content:push`（`.env` に `SUPABASE_URL` と `SUPABASE_SERVICE_ROLE_KEY`）

## 本番環境（2026-09-16 展開済み）

| 項目 | 値 |
|---|---|
| アプリ | https://dx-soudan-navi.netlify.app （Netlify site: dx-soudan-navi） |
| Supabase | プロジェクト `DX_MASUDA`（ref: lctaqygbyuchiretbdhc、東京リージョン） |
| 適用済み | migrations 0001〜0003、Edge Function `invite-user`、コンテンツ投入（`supabase/seed/load_content.sql`）、pg_cron で毎日 03:00 JST に契約状態を更新 |
| コンテンツ | 相談テーマ10件（初期候補テーブル全件）、事例360件（全件に詳細生成済み）、用語64語 |
| 団体 | `creatte`（運営）／`masuda-city`／`masuda-cci`（試行・2027-03-31 まで） |

**展開後に手動で行う設定（ダッシュボード）**
1. 運営アカウント：`supabase/seed/bootstrap_ops.sql` の手順（Auth でユーザー作成 → profiles に ops_admin を挿入）
2. Authentication → URL Configuration：Site URL を `https://dx-soudan-navi.netlify.app`、Redirect URLs に `https://dx-soudan-navi.netlify.app/welcome` と `/reset` を追加
3. Authentication → Sign In / Providers：「Allow new users to sign up」を OFF（招待制のため）
4. Edge Functions → `invite-user` → Secrets：`SITE_URL=https://dx-soudan-navi.netlify.app`（招待メールのリンク先の許可リスト）
5. Netlify：GitHub リポジトリ `katayama502/DX` と連携すると push で自動デプロイになる（現在は MCP からの手動デプロイ）

**再デプロイ**：`netlify.toml` にビルド設定があるので、Netlify の Deploys →「Trigger deploy」またはリポジトリ連携で更新できる。
**コンテンツ更新**：`npm run content:seed` → commit & push → Supabase SQL Editor で `supabase/seed/load_content.sql` を実行。

## 別環境に構築する場合
1. Supabase プロジェクトを作成し、`supabase/migrations/0001_init.sql` を SQL Editor で実行
2. Edge Function `invite-user` をデプロイ（`supabase functions deploy invite-user`）
3. Auth → Email テンプレートの招待リンク先を `https://<ドメイン>/welcome`、再設定を `/reset` に
4. 最初の運営アカウント：Auth で ops ユーザーを作成し、`profiles` に `role='ops_admin'` の行を手で入れる（団体 `creatte` を先に insert）
5. `npm run content:push` でコンテンツ投入
6. `.env` を `VITE_APP_MODE=supabase`、`VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY` に設定して `npm run build` → `dist/` を Cloudflare Pages へ（SPA なので `/*  /index.html  200` の `_redirects` を置く）
7. pg_cron が使えるなら `select cron.schedule('rollover', '0 3 * * *', $$select public.rollover_contracts()$$);`

## 残っている手動作業・既知の課題

- **Supabase Auth の管理画面設定**（API未対応のため手動）：Site URL / Redirect URLs の登録、公開サインアップの無効化、Edge Function `invite-user` への `SITE_URL` シークレット設定。詳細は上の「展開後に手動で行う設定」参照
- **Netlify ⇄ GitHub 連携**：現在は手動アップロードでデプロイしている（API からリポジトリ連携を張れないため）。Netlify ダッシュボード → Site settings → Build & deploy → Link repository で `katayama502/DX` を選び、Base directory を空欄（リポジトリ直下）にすると、以後は `git push` で自動デプロイになる
- **360事例の詳細コンテンツ**：AIが事前生成した内容（`generated: true`）。仕様書10.1の運用フロー通り、価格・固有名詞の公式情報での確認と、専門分野（セキュリティ・補助金・法令）の有識者レビューを公開前に行うことを推奨
- **多要素認証（MFA）**：仕様書F-001で「任意設定」とされているが、UI上の設定画面は未実装（Supabase Auth自体はTOTPをサポート）
- **利用規約・プライバシーポリシー**：ドラフト表示のまま（`/terms` `/privacy`）。Phase 0での所属機関確認・契約書式確定を待って正式版に切り替える

## 受入テストの観点（仕様書12章）
- 未ログインで `/share/:id` 以外が見えないこと（RLS：`org_can_read()`）
- 契約終了（expired）で S-017 のみ表示、grace は閲覧のみバナー
- 判定ルールの全件で想定レベル・理由が出ること（`content:build` が分岐と選択肢の整合を検証）
- 相談票・回答が通信に乗らないこと（Network タブで確認）
- 1枚資料が A4 縦1枚に収まること（Chrome / Safari の印刷）
# DX
