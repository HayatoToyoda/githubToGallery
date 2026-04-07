# meadow-auth（Cloudflare Worker）

GitHub OAuth と GraphQL の `viewer.contributionsCollection` を中継し、`meadow/` の静的サイトから **Contribution Calendar** を安全に読むための Worker です。

## セットアップ概要

1. GitHub で **OAuth App** を作成し、Callback URL を  
   `https://<Worker デプロイ後のホスト>/auth/github/callback` に設定する。  
2. ローカル検証用に同じ App の Callback に  
   `http://127.0.0.1:8787/auth/github/callback` などを追加する。  
3. Cloudflare で `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `SESSION_SECRET` を Secret に登録する。  
4. `ALLOWED_ORIGINS` に、GitHub Pages のオリジン（例: `https://<user>.github.io`）とローカル開発用 URL をカンマ区切りで入れる。  
5. `npx wrangler deploy`

## ローカル

```bash
cd workers/meadow-auth
npm install
cp .dev.vars.example .dev.vars
# .dev.vars を編集してから
npx wrangler dev
```

## エンドポイント

| Path | 説明 |
|------|------|
| `GET /api/readme-card.svg` | **README 埋め込み用 SVG**。`?user=`（必須）、`theme`、`show_icons`、`width`。公開 GitHub Users API を使用。OAuth・CORS 不要。 |
| `GET /auth/github` | `return_to` クエリで戻り先（ALLOWED_ORIGINS 内のみ） |
| `GET /auth/github/callback` | GitHub からのコールバック |
| `GET /api/contributions` | Cookie セッション必須。GraphQL の JSON をそのまま返す |
| `GET /auth/logout` | セッション削除 |

### README カード用の任意 Secret

`GET /api/readme-card.svg` は認証なしでも動作しますが、**未認証の GitHub API は時間あたりの呼び出し上限が厳しい**です。負荷が高い場合は `wrangler secret put GITHUB_TOKEN` で **read 権限の PAT** を登録してください（公開ユーザー情報の取得のみに使います）。

## トラブルシュート（OAuth 後にユーザーサイトのトップだけ開く）

ログイン後に `https://<user>.github.io/` だけに飛び、**meadow に戻らない**ときは、多くの場合 **`return_to` が `ALLOWED_ORIGINS` と一致しない**ため、Worker が先頭のオリジンへフォールバックしている状態です。

- **Cloudflare の `ALLOWED_ORIGINS`** に、meadow を開いている **オリジン**（`https://<user>.github.io` のみ。パスは不要）を入れる。ブラウザのコンソールで `location.origin` をコピーして貼ると確実。
- **ホスト名の大文字小文字**が設定とブラウザで違うと、旧実装では一致しませんでした（現在はオリジンを小文字比較で検証）。
- ログインボタンのリンクに **`return_to=`** が付いているか（`window.MEADOW_API_BASE` が空だと OAuth ボタン自体が出ません）。

詳細（原因・再現条件・記事化の構成案）は **[docs/OAUTH_RETURN_TO_CASE_SENSITIVITY.md](../../docs/OAUTH_RETURN_TO_CASE_SENSITIVITY.md)** を参照。

**補足**: OAuth は通るが **`/api/contributions` が CORS で失敗**（Network で `net::ERR_FAILED`）し、REST の **「集計がタイムアウト」**に落ちる場合は、多くは **`ALLOWED_ORIGINS` のホスト表記**とブラウザの `Origin`（小文字の `github.io`）の不一致が原因。`corsForRequest` は Origin を **大文字小文字無視で照合**する（コード参照）。

## セキュリティ

`.dev.vars` と `wrangler secret` の値は **リポジトリに含めない**。
