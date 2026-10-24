# Flick

開いた瞬間にメモでき、フリックでステータスを動かすタスク管理Webアプリ（iOS Safari / ホーム画面追加向け）。

- 右フリック: 未着手 → 進行中 → 完了 → 削除
- 左フリック: 完了 → 進行中 → 未着手 → 削除（削除・移動は直後に「元に戻す」）
- タップ: 編集シート（タイトル変更・ステータス・削除）
- ✨ボタン: Workers AI がメモを複数タスクに分解

## 技術スタックと選定理由

| 領域 | 採用 | 理由 |
|---|---|---|
| ホスティング/API | **Cloudflare Workers**（Static Assets 同居） | フロントとAPIを1つのWorkerで配信でき、同一オリジンなのでCORS不要・Cookie認証が素直。エッジ配信でTTFBが短く「開いた瞬間」に効く |
| API フレームワーク | **Hono** | Workers向けに設計された軽量ルーター。依存が小さくコールドスタートに影響しない |
| DB | **Cloudflare D1** (SQLite) | Workersからバインディングで直接叩ける。ユーザー×タスクのリレーショナルデータに最適、無料枠も十分 |
| AI | **Workers AI** `@cf/meta/llama-3.3-70b-instruct-fp8-fast` | 指定どおりWorkers AI。JSON Schema 出力に対応し日本語も実用的な速度/品質。AIが落ちても行・箇条書き分割にフォールバック |
| 認証 | **Google OAuth 2.0（自前実装, PKCE + state）** | Google限定なので認証ライブラリ不要。IDトークンはGoogleのトークンエンドポイントから直接取得し検証。セッションはランダムトークンをSHA-256でD1に保存、HttpOnly/SameSite=Lax Cookie |
| フロント | **React 19 + Vite** | `@cloudflare/vite-plugin` で開発中もWorkers実行環境(workerd)とD1をそのまま再現できる |
| アニメーション/ジェスチャ | **Motion**（旧 Framer Motion） | ドラッグ速度ベースのフリック判定、layout アニメーション、AnimatePresence による退出アニメ、共有レイアウト(セグメントのピル)を1ライブラリで |
| スタイル | **素のCSS** | Liquid Glass は `backdrop-filter`・多層 inset shadow・鏡面ハイライト擬似要素の組み合わせ。ユーティリティCSSより直接書く方が細かく制御できる |
| 即時メモ | **ローカルファースト** (localStorage + 送信キュー) + **Service Worker** | 入力は即ローカル反映→バックグラウンド同期。オフラインでも書け、未ログインでも書けてログイン後に自動アップロード。SWがアプリシェルをキャッシュし次回以降ネットワーク待ちゼロで起動 |
| スケルトン | **index.html にインラインCSSのスケルトン** + React側スケルトン | JS到着前の最初の描画から全画面スケルトン。入力欄だけは即座に本物を出してフォーカス |
| テスト | **Playwright**（WebKit iPhone 15 Pro / Chromium Pixel 7） | iOS Safari と同じ WebKit エンジンで実際のポインタ操作によるフリックまで検証 |

## 開発

```bash
npm install
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev            # http://localhost:5173 （/auth/dev でローカルログイン）
npm run test:e2e
```

Workers AI はクラウドでのみ動くため、ローカルでは `CF_REMOTE=1 npm run dev`（要 `wrangler login`）で本物を、未設定時はフォールバック分割を使います。

## デプロイ

1. `npx wrangler login`
2. `npx wrangler d1 create flick-tasks` → 出力された `database_id` を `wrangler.jsonc` に設定
3. Google Cloud Console で OAuth クライアント（ウェブアプリ）を作成し、承認済みリダイレクトURIに `https://<your-worker>.workers.dev/auth/callback` を追加
4. `npx wrangler secret put GOOGLE_CLIENT_ID` / `npx wrangler secret put GOOGLE_CLIENT_SECRET`
5. `npm run deploy`
