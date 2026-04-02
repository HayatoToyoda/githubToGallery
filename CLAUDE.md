# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**githubToGallery / Meadow** — GitHub コミット数を元に Three.js で草原（大地＋草）を生成する静的 Web アプリ＋ Cloudflare Worker バックエンド。

- コミット数が多いほど大地の半径と草の本数が対数スケールで増える
- ログイン不要モード: GitHub 公開 API でコミット数を集計
- OAuth モード: Cloudflare Worker 経由で GitHub GraphQL Contribution Calendar（過去約1年）を取得

## Architecture

```
githubToGallery/
├── meadow/                  # 静的フロントエンド（ビルドなし）
│   ├── index.html           # メインページ・フォーム・OAuth リンク
│   ├── main.js              # Three.js シーン・カメラ・草生成のエントリポイント
│   ├── github-activity.js   # 公開 API でコミット数解決（resolveGithubActivity）
│   ├── oauth-contributions.js  # Worker 経由の OAuth Contribution Calendar 取得
│   └── styles.css
└── workers/meadow-auth/     # Cloudflare Worker
    ├── wrangler.toml
    └── src/
        ├── index.js         # OAuth フロー・セッション管理・GraphQL プロキシ
        └── readme-card.js   # /api/readme-card.svg の SVG 生成
```

### フロントエンド (meadow/)

ビルドステップなし。`<script type="importmap">` で Three.js を CDN から読み込む。

データフロー（`main.js`）:
1. `window.MEADOW_API_BASE` が設定されていれば `fetchOAuthContributionActivity` を試行
2. OAuth 未使用 かつ URL パラメータあり（`?user=` / `?repo=`）なら `resolveGithubActivity` を呼ぶ
3. どちらもなければデモ値（320コミット）
4. `groundRadiusFromCommits` → `bladeCountFromCommits` でスケール計算し Three.js シーンを構築

### Cloudflare Worker (workers/meadow-auth/)

エンドポイント:
- `GET /auth/github` — OAuth 開始（state は HMAC 署名済み JWT）
- `GET /auth/github/callback` — コールバック・アクセストークン取得・セッション Cookie 発行
- `GET /api/contributions` — GraphQL で Contribution Calendar を返す（Cookie 認証）
- `GET /auth/logout` — Cookie クリア
- `GET /api/readme-card.svg` — GitHub ユーザーカード SVG 生成

セッション: `meadow_session` Cookie（HMAC-SHA256 署名・HttpOnly・Secure・SameSite=None・7日間）

## Development Commands

### フロントエンド（meadow/）

ビルド不要。ローカルで開発サーバーを起動するだけ:

```sh
# 任意の静的サーバーで serve（例）
npx serve meadow
# または
python3 -m http.server -d meadow 8080
```

`?user=octocat` のようなクエリパラメータで動作確認。

### Cloudflare Worker

```sh
cd workers/meadow-auth

# ローカル開発
npm run dev    # wrangler dev

# デプロイ
npm run deploy # wrangler deploy
```

#### Worker のシークレット設定

```sh
wrangler secret put GITHUB_CLIENT_ID
wrangler secret put GITHUB_CLIENT_SECRET
wrangler secret put SESSION_SECRET
# 任意（readme-card.svg の API レート緩和）
wrangler secret put GITHUB_TOKEN
```

`wrangler.toml` の `[vars]` で `ALLOWED_ORIGINS` を設定（カンマ区切りの CORS オリジン）。

#### OAuth App 設定

GitHub の OAuth App で Callback URL を `https://<worker-url>/auth/github/callback` に設定する。

## Key Design Notes

- `window.MEADOW_API_BASE` が空文字ならフロントエンドは OAuth を一切使わない
- GitHub contributors API は非同期集計のため `HTTP 202` を返すことがあり、最大6回リトライする（`github-activity.js`）
- ユーザー名のみ指定時: 公開リポ最大12件を走査し、そのユーザーのコミット数が最大のリポを自動選択
- URL パラメータ `?noRotate=1` で自動回転を停止（スクリーンショット・録画用）
