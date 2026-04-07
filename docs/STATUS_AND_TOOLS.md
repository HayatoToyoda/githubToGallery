# 現在地とツール一覧

この文書は、リポジトリの **実装・運用上の現状スナップショット** と、開発・デプロイ・素材制作で使う **ツールの一覧** をまとめたものです。マイルストーンや環境が変わったら、ここを更新してください。アーキテクチャの説明は [PROJECT.md](PROJECT.md) を参照。**経緯・展望のストーリー**は [HISTORY_AND_OUTLOOK.md](HISTORY_AND_OUTLOOK.md) を参照。

---

## 1. 現在地（プロダクト）

| 項目 | 状態 |
|------|------|
| **目的** | GitHub README 用ビジュアル（GIF・静止画）と、活動量に連動する **`meadow/`** の Web デモを同一リポジトリで管理する。 |
| **静的デモ** | `meadow/` — Three.js（CDN の `three@0.160.0`）＋ ES modules。**球体**の土壌と球冠の緑、草は球面配置。活動スカラーは OAuth（任意）→ 公開 REST → デモ値の優先順位で取得。 |
| **OAuth 層** | `workers/meadow-auth` — Cloudflare Worker。未デプロイ・未設定でもフロントは公開 API モードで動作可能。 |
| **README 動的画像** | 同一 Worker の **`GET /api/readme-card.svg`** — 公開ユーザー API から SVG カードを生成し、[github-readme-stats](https://github.com/anuraghazra/github-readme-stats) のように `<img>` で README に埋め込める（[README.md](../README.md) の該当節を参照）。 |
| **ドキュメント** | 利用者向け [README.md](../README.md)、全体マップ [PROJECT.md](PROJECT.md)、本書、録画 [../meadow/CAPTURE.md](../meadow/CAPTURE.md)、Worker [../workers/meadow-auth/README.md](../workers/meadow-auth/README.md)。 |

---

## 2. 現在地（リポジトリとプレースホルダ）

| 項目 | 状態 |
|------|------|
| **ルート `package.json`** | なし（`meadow/` はビルド不要の静的ファイル）。**`tools/meadow-capture/package.json`** のみ、README 素材の自動キャプチャ用。 |
| **`assets/`** | README 用 `hero.gif` / `3d-showcase.png` を配置。[`tools/meadow-capture`](../tools/meadow-capture) で再生成可能。 |
| **README の Live demo URL** | `YOUR_USERNAME` 等の **プレースホルダ**（実際の GitHub ユーザー名・リポ名に置き換えが必要）。 |
| **`meadow/index.html` の `MEADOW_API_BASE`** | 既定は空文字。Worker を使う場合のみデプロイ後のオリジンを設定。 |
| **旧パス** | `night-field/` → `meadow/` に移行済み。旧 URL のブックマークは無効。 |

---

## 3. 現在地（任意・未実装の拡張）

| 項目 | 説明 |
|------|------|
| **GitHub Actions + PAT → JSON** | [README.md](../README.md) に「`data/contributions.json` を読む拡張として可能」とある。**本体コードへの組み込みは未実装**（設計上のオプション）。 |
| **リポジトリ名のリネーム** | README に `readme-visual-lab` 等への変更可の記載あり。実施する場合は URL・remote・Pages のパスと整合させる。 |

---

## 4. ツール一覧（役割別）

### 4.1 ランタイム・ホスト

| ツール | 用途 |
|--------|------|
| **モダンな Web ブラウザ** | `meadow/` の表示・OAuth リダイレクト・GitHub API 呼び出し。 |
| **GitHub** | リポジトリホスト、**GitHub Pages**（静的ファイルの公開）、OAuth App の登録。 |
| **Cloudflare** | Worker のホスト（`workers/meadow-auth` のデプロイ先）。Secrets に Client Secret 等。 |

### 4.2 フロントエンド（依存関係の置き場）

| ツール / ライブラリ | バージョン目安 | 用途 |
|---------------------|----------------|------|
| **three**（CDN） | 0.160.0（`meadow/index.html` の importmap） | 3D シーン。 |
| **Google Fonts** | （HTML で指定） | タイポグラフィ。 |

**`meadow/` 単体に `npm install` は不要**。README 用 GIF・PNG を自動生成するときだけ [`tools/meadow-capture`](../tools/meadow-capture) で `npm install` する。

### 4.3 Worker（Node / npm）

| ツール | 用途 |
|--------|------|
| **Node.js** | `workers/meadow-auth` の実行・`wrangler` の前提。 |
| **npm** | `workers/meadow-auth` で `npm install`。 |
| **Wrangler**（`devDependencies`） | `wrangler dev`（ローカル）、`wrangler deploy`（本番）。バージョンは [package.json](../workers/meadow-auth/package.json) を参照。 |

### 4.4 ローカル静的サーバー（任意）

| ツール | 用途 |
|--------|------|
| **Python 3** | `python3 -m http.server <port>` で `meadow/` をローカル確認（[CAPTURE.md](../meadow/CAPTURE.md)）。 |
| **その他** | 任意の静的サーバー（`npx serve` 等）でも可。CORS は GitHub API 直叩きのため、オリジンはローカルに合わせて Worker の `ALLOWED_ORIGINS` を調整する場合あり。 |

### 4.5 素材・README 向け（オプション）

| ツール | 用途 |
|--------|------|
| **[tools/meadow-capture](../tools/meadow-capture)** | `assets/hero.gif` / `assets/3d-showcase.png` を一括生成。`cd tools/meadow-capture && npm install && npx playwright install chromium && npm run capture`。Node 内蔵の静的サーバで `meadow/` を配信し、ヘッドレス Chromium で撮影、`gifenc` で GIF を書き出す。 |
| **Playwright**（上記の依存） | ヘッドレス **Chromium** でページを開き PNG を取得。 |
| **gifenc**（上記の依存） | フレームをパレット化して `hero.gif` をエンコード。 |
| **pngjs**（上記の依存） | スクリーンショット PNG を RGBA にデコード。 |
| **ffmpeg** | 手動で録画したクリップから `assets/hero.gif` へ変換する例（[CAPTURE.md](../meadow/CAPTURE.md)）。自動スクリプトでは不要。 |
| **gifsicle** | GIF の最適化（[README.md](../README.md) で言及）。 |
| **スクリーンショット（手動）** | `assets/3d-showcase.png` をブラウザだけで撮る場合（`?noRotate=1` で撮影しやすい）。 |

### 4.6 バージョン管理・CLI（任意）

| ツール | 用途 |
|--------|------|
| **git** | ソース管理・GitHub への push。 |
| **GitHub CLI (`gh`)** | Issue/PR 操作など（プロジェクト必須ではない）。 |

---

## 5. 関連ドキュメント

- [PROJECT.md](PROJECT.md) — 目的・境界・データの流れ・エージェント向けファイル対応表  
- [README.md](../README.md) — デプロイ手順、OAuth、CORS、Live demo  
- [meadow/CAPTURE.md](../meadow/CAPTURE.md) — 録画・GIF・静止画  
- [workers/meadow-auth/README.md](../workers/meadow-auth/README.md) — Worker 専用  
- [OAUTH_RETURN_TO_CASE_SENSITIVITY.md](OAUTH_RETURN_TO_CASE_SENSITIVITY.md) — OAuth 後にトップだけ開く問題（オリジン大文字小文字）の整理・記事用メモ

---

*最終更新の目安: リリース前・主要な構成変更のたびに本書の「現在地」セクションを見直す。*
