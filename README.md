# githubToGallery

> **プロジェクト全体の説明（目的・構成・データの流れ・エージェント向けの変更ガイド）**: [docs/PROJECT.md](docs/PROJECT.md)  
> **現在地・ツール一覧**: [docs/STATUS_AND_TOOLS.md](docs/STATUS_AND_TOOLS.md)  
> **経緯・展望**: [docs/HISTORY_AND_OUTLOOK.md](docs/HISTORY_AND_OUTLOOK.md)

自分の GitHub README を更新するためのビジュアル（ヒーロー GIF・3D キャプチャ）と、公開用インタラクティブデモ（**`meadow/`**）をまとめたリポジトリです。リポジトリ名を **`readme-visual-lab`** などへ変えてもよいです（GitHub の Rename。ローカルフォルダ名は `git remote` と揃えると管理しやすいです）。

**移行メモ**: デモのパスは **`night-field/` から `meadow/` に変更**しました。旧 URL のブックマークは切れます。

## ビジュアル方針（日中ポップ × コミット連動）

| 項目 | 内容 |
|------|------|
| **ひと言コンセプト** | **コミットの大地** — コミットが増えるほど土地が広がり、草が生える。 |
| **記憶に残す主役** | **太陽光の下の緑**（明るい半球光＋太陽風ディレクショナル、淡いフォグ）。 |
| **シーン案（採用）** | **`meadow/`** の Three.js フィールド。活動量で **緑が広がる半径**と**草の本数**が変わり、外周は土壌（OAuth 時は過去約1年の Contribution 合計に連動）。 |
| **`assets/hero.gif`** | **動きの「ドカン」**：録画用。README 先頭のヒーロー。 |
| **`assets/3d-showcase.png`** | **キービジュアルの静止画**：同シーンのスクリーンショットなど。 |

撮影手順・`ffmpeg` 例は **[meadow/CAPTURE.md](meadow/CAPTURE.md)** を参照。

### GitHub 活動と草（データソース）

**狙い**: **コミット／Contribution**に応じて **土地が広がり草が増える**「畑」を、README / Pages から楽しめるようにする。

**優先順位（`meadow/main.js`）**

1. **OAuth + GraphQL（Contribution Calendar）** — [`workers/meadow-auth`](workers/meadow-auth) をデプロイし、[`meadow/index.html`](meadow/index.html) の `window.MEADOW_API_BASE` に Worker のオリジンを書いたとき。ログイン済みなら **過去約1年の `totalContributions`** を使用。  
2. **公開 REST API** — URL またはフォームで **`?user=` / `?repo=`** を指定したとき（[meadow/github-activity.js](meadow/github-activity.js)）。

**公開 API の挙動**

- **ユーザー名のみ**: 同名リポジトリ（`user/user`）と、公開リポジトリ一覧から最大 **12 件**を試し、**あなたのコミット数が最も多いリポ**を自動選択（[contributors](https://docs.github.com/en/rest/metrics/statistics) の `total`）。  
- **リポジトリも指定**（`owner/name`）: そのリポだけを使い、任意で **`&user=`** により **特定ユーザーのコミット**に限定。  
- **リポジトリだけ**（`?repo=` のみ）: そのリポの **全 contributors 合計コミット**。  
- クエリなし: **デモ用の固定コミット数相当**。  
- 認証なし API には **レート制限**があります。統計が未生成のときは **HTTP 202** でリトライします。

---

## OAuth + Cloudflare Worker（Contribution Calendar）

GitHub Pages だけでは OAuth の **client secret** を安全に保持できないため、**[workers/meadow-auth](workers/meadow-auth)** に Worker を置きます（フローは [Authorizing OAuth Apps](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps) と同型）。

### 1. GitHub で OAuth App を作成

1. GitHub → **Settings → Developer settings → OAuth Apps → New**.  
2. **Authorization callback URL**: デプロイ後の Worker に合わせて  
   `https://<あなたのWorkerホスト>/auth/github/callback`  
   （ローカル検証時は `http://127.0.0.1:8787/auth/github/callback` などを **別 OAuth App** か同一 App に追加）。  
3. **Scopes**: `read:user`（GraphQL の `viewer.contributionsCollection` 用）。  
4. **Client ID / Client Secret** を控える（リポジトリにコミットしない）。

### 2. Cloudflare にシークレットを登録

`workers/meadow-auth` で:

```bash
cd workers/meadow-auth && npm install
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
npx wrangler secret put SESSION_SECRET
```

`SESSION_SECRET` はランダムな長い文字列（セッション署名用）。

### 3. 変数 `ALLOWED_ORIGINS`（CORS）

**GitHub Pages のオリジン**（例: `https://hayatotoyoda.github.io`）と **ローカル**（例: `http://127.0.0.1:8080`）を **カンマ区切り**で設定します。`credentials: 'include'` を使うため **具体オリジン**が必須です。

- Dashboard の Worker → **Settings → Variables** で `ALLOWED_ORIGINS` を追加するか、[`wrangler.toml`](workers/meadow-auth/wrangler.toml) の `[vars]` に書く（公開してよい値のみ）。

### 4. デプロイ

```bash
cd workers/meadow-auth && npx wrangler deploy
```

表示された Worker URL を [`meadow/index.html`](meadow/index.html) の `window.MEADOW_API_BASE` に設定してコミットするか、ビルド手順で注入します。

### 5. フロント

- `MEADOW_API_BASE` が空のときは OAuth ボタンは非表示で、従来どおり公開 API のみ動作します。  
- ログイン後は **同一ブラウザ**で `GET /api/contributions` に Cookie が付与され、**Contribution の合計**が畑に反映されます。

詳細は **[workers/meadow-auth/README.md](workers/meadow-auth/README.md)** と **[.dev.vars.example](workers/meadow-auth/.dev.vars.example)** を参照。

**補助**: リポジトリオーナー向けに **GitHub Actions + PAT** で JSON を書き出す方式は、別途 `data/contributions.json` を読む拡張として可能（`GITHUB_TOKEN` 単体では他ユーザーのカレンダーは取得できません）。

### README 埋め込み用 SVG カード（公開 API）

[`workers/meadow-auth`](workers/meadow-auth) をデプロイすると、**[github-readme-stats](https://github.com/anuraghazra/github-readme-stats)** のように README へ **動的な SVG 画像**を埋め込めます（GitHub の **公開** `GET /users/{username}` を Worker が取得して SVG を返します）。

```html
<img
  src="https://<Workerのホスト>/api/readme-card.svg?user=HayatoToyoda&amp;theme=tokyonight&amp;show_icons=true"
  width="450"
  alt="GitHub stats"
/>
```

| クエリ | 説明 |
|--------|------|
| `user` または `username` | **必須** — GitHub ログイン名 |
| `theme` | `tokyonight`（既定） / `dark` / `default` / `radical` |
| `show_icons` | `true`（既定） / `false` |
| `width` | 横幅ピクセル（300〜600、既定 450） |

トラフィックが多い場合は、Worker の Secret に **`GITHUB_TOKEN`**（read 系の PAT）を入れると **GitHub API のレート制限**を緩和できます（任意）。

---

<p align="center">
  <img
    src="assets/hero.gif"
    alt="メインのGIFアニメーション（ヒーロー）"
    width="920"
  />
</p>

<p align="center">
  <sub>上記は <code>assets/hero.gif</code> を配置すると表示されます（未配置のときはリンク切れに見えます）。</sub>
</p>

---

## 3D / ビジュアル

<p align="center">
  <img
    src="assets/3d-showcase.png"
    alt="自作3Dのキャプチャ（レンダーまたはスクリーンショット）"
    width="920"
  />
</p>

<p align="center">
  <sub><code>assets/3d-showcase.png</code>。静止画の撮り方は <a href="meadow/CAPTURE.md">meadow/CAPTURE.md</a>（<code>?noRotate=1</code> で自動回転オフ）。</sub>
</p>

---

## デモ（GitHub Pages）

インタラクティブなデモ（日中の大地・コミット連動）はこちら。リポジトリ公開後、**`YOUR_USERNAME` を自分のユーザー名**に置き換えてください。

**[Live demo](https://YOUR_USERNAME.github.io/githubToGallery/meadow/)**

---

## アセットの置き場

| 種類 | 推奨パス | メモ |
|------|-----------|------|
| メイン GIF | `assets/hero.gif` | 幅 920px 前後を目安。[meadow/CAPTURE.md](meadow/CAPTURE.md) |
| 3D キャプチャ | `assets/3d-showcase.png` | PNG / WebP。透明背景が必要なら PNG。 |
| 追加の GIF | `assets/` 任意 | README に `<p align="center"><img ...></p>` を追加。 |

### ハイクオリティにするコツ（事実ベース）

- **GIF**: 録画後、`ffmpeg` や [gifsicle](https://www.lcdf.org/gifsicle/) でパレット最適化・フレーム間引き。
- **解像度**: 横 920〜1280px 程度が README 上で見やすいことが多い。
- **3D**: Three.js のスクリーンショット、または Blender レンダー。

---

## ローカル開発（Pages 用）

`meadow/` が静的サイトです。GitHub の **Settings → Pages** で **Deploy from branch** の **/ (root)** を選ぶと、サブパスとして **`https://<USER>.github.io/<REPO>/meadow/`** で公開されます。

シーンの見た目は **[meadow/main.js](meadow/main.js)**。録画・書き出しは **[meadow/CAPTURE.md](meadow/CAPTURE.md)**。
