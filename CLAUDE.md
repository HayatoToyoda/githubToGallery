# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**githubToGallery / Meadow** — GitHub コミット数を元に Three.js で **球体の大地＋草**を生成する静的 Web アプリ＋ Cloudflare Worker バックエンド。

- 活動量が多いほど **北極からの緑の球冠角**（最大 π で球全体）と草の本数が増える（ログスケール）。ロード時に球冠角・草の本数をイージングで伸ばす
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
2. OAuth 未使用 かつ URL パラメータあり（`?user=`）なら `resolveGithubActivity` を呼ぶ
3. どちらもなければデモ値（十分大きい活動量で「育った畑」）
4. `growthAngleFromActivity` → `bladeCountFromCommits` でスケール計算し **球体**シーンを構築（土壌はシェーダで茶／緑混合）

### Cloudflare Worker (workers/meadow-auth/)

エンドポイント:
- `GET /auth/github` — OAuth 開始（state は HMAC 署名済み JWT）
- `GET /auth/github/callback` — コールバック・アクセストークン取得・セッション Cookie 発行
- `GET /api/contributions` — GraphQL で Contribution Calendar を返す（Cookie 認証）
- `GET /auth/logout` — Cookie クリア
- `GET /api/readme-card.svg` — GitHub ユーザーカード SVG 生成

セッション: `meadow_session` Cookie（HMAC-SHA256 署名・HttpOnly・Secure・SameSite=None・7日間）

## Git / GitHub 運用（必須）

- **`main` への直接コミット・直接プッシュはしない**。変更は **`feature/*` / `fix/*` / `chore/*`** などのブランチで行う。
- **`main` に取り込む前に必ず Pull Request を開く**（`gh pr create` 等）。マージは PR 経由のみ。
- 詳細は **`.cursor/rules/git-pr-workflow.mdc`** およびルート **`AGENTS.md`** を参照。

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
