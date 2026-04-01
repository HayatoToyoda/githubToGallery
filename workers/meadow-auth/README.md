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
| `GET /auth/github` | `return_to` クエリで戻り先（ALLOWED_ORIGINS 内のみ） |
| `GET /auth/github/callback` | GitHub からのコールバック |
| `GET /api/contributions` | Cookie セッション必須。GraphQL の JSON をそのまま返す |
| `GET /auth/logout` | セッション削除 |

## セキュリティ

`.dev.vars` と `wrangler secret` の値は **リポジトリに含めない**。
