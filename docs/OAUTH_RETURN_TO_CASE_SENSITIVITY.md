# OAuth 後に meadow に戻らずユーザーサイトのトップへ飛ぶ（オリジン大文字小文字）

技術記事・社内共有用に、**再現した事象・原因・検証・対処**をまとめたメモです。GitHub Pages × Cloudflare Worker × GitHub OAuth の組み合わせで起きうる落とし穴です。

---

## 1. 事象（症状）

- GitHub の OAuth 認可画面までは進める。
- 「許可」後、**元の meadow の URL**（例: `https://<user>.github.io/<repo>/meadow/`）に戻らない。
- 代わりに **`https://<user>.github.io/`**（ユーザーサイトのルート）だけが開く。

---

## 2. 背景（アーキテクチャ）

- フロントは **GitHub Pages**（例: `https://<user>.github.io/<repo>/meadow/`）。
- OAuth の **client secret** はブラウザに置けないため、**Cloudflare Worker**（本リポジトリでは `workers/meadow-auth`）が `/auth/github` → GitHub → `/auth/github/callback` を処理する。
- ログイン開始時に `return_to` クエリで「戻り先 URL」を渡す。Worker は **`ALLOWED_ORIGINS`**（カンマ区切り）と照合し、許可された URL だけにリダイレクトする。

---

## 3. 根本原因

### 3.1 Worker のフォールバック

`return_to` が **空**、または **許可リストに合致しない**と、Worker は **許可オリジンの先頭**だけを戻り先にする実装になっていた。

```javascript
// 概念（実体は workers/meadow-auth/src/index.js の handleAuthStart）
let returnTo = url.searchParams.get("return_to") || "";
if (!isAllowedReturnTo(returnTo, env)) {
  returnTo = `${allowed[0].replace(/\/$/, "")}/`;
}
```

そのため「戻り先が無効」と判定されると、**`ALLOWED_ORIGINS` の 1 件目**（多くは `https://<user>.github.io`）にだけ飛び、**`/repo/meadow/` が付かない**。

### 3.2 許可判定の大文字小文字

旧実装では `isAllowedReturnTo` が **`url.startsWith(prefix)` のみ**だった。

- ブラウザの **`location.origin`** は、**ホスト名が小文字**に正規化されることが多い。  
  例: `https://hayatotoyoda.github.io`
- 一方、人間が GitHub の表示 ID に合わせて **`ALLOWED_ORIGINS` に `https://HayatoToyoda.github.io` と書く**と、**`H` の大文字小文字が 1 文字でも違う**と `startsWith` は一致しない。

```text
"https://hayatotoyoda.github.io/githubToGallery/meadow/"
  .startsWith("https://HayatoToyoda.github.io")
→ false（ホスト部分の h / H で不一致）
```

結果として **`return_to` 全体が「不許可」**となり、上記フォールバックで **ルートだけ**に飛ぶ。

---

## 4. 再現条件（チェックリスト）

| 条件 | 例 |
|------|-----|
| `ALLOWED_ORIGINS` のホストが **ブラウザの `location.origin` と文字列が完全一致しない** | 設定: `HayatoToyoda` / 実際: `hayatotoyoda` |
| 旧実装の **`startsWith` ベース**の許可判定 | 修正前の `workers/meadow-auth` |

※ パスやクエリ以前に、**スキーム + ホスト**の表記ゆれで落ちる点がポイント。

---

## 5. 調査手順（デバッグ）

1. meadow のページで DevTools → Console  
   `location.origin` を実行し、**実際のオリジン文字列**をコピーする。
2. ログインボタン（「GitHub でログイン」）の **href をそのままコピー**し、`return_to=` 以降が **今開いているページの URL** と一致するか確認する。
3. Cloudflare（または `wrangler.toml`）の **`ALLOWED_ORIGINS`** と、`location.origin` を **文字単位で比較**する（特に **github.io より左のホスト名**）。
4. Worker のログ（あれば）や、Network で `/auth/github` への最初のリクエストに `return_to` が付いているか確認する。

---

## 6. 対処（どちらか、または両方）

1. **設定をブラウザに合わせる（最短）**  
   `ALLOWED_ORIGINS` の GitHub Pages 側を、**`location.origin` と同じ表記**にする。  
   例: `https://hayatotoyoda.github.io`（ホストは小文字のまま）。
2. **Worker 側でオリジン比較を正規化する（実装修正）**  
   `URL` でパースし、**`origin` を小文字で比較**してからパスを見る（本リポジトリでは `isAllowedReturnTo` をこの方針で修正）。

---

## 7. 記事化するときの構成案（メモ）

執筆時に使える見出しのたたき台です。

1. **導入**: Pages で動くデモ + Worker で OAuth、という構成の動機（secret をブラウザに置けない）。
2. **症状**: 認可後だけトップに飛ぶ、meadow に戻らない。
3. **調査ログ**: `return_to` は付いているのに…？ → `ALLOWED_ORIGINS` と照合に注目。
4. **原因**: `startsWith` と **URL の正規化（ホストは小文字）**のすれ違い。
5. **仕様メモ**: なぜ「先頭オリジンの `/`」にフォールバックするか（実装の意図とトレードオフ）。
6. **教訓**: オリジンは **`location.origin` をコピペ**、または **パースして origin を比較**する。
7. **補足**: CORS の `Origin` ヘッダも同様に、設定値は実測と揃える。

---

## 8. 別症状: `/api/contributions` が `net::ERR_FAILED`・REST の「集計がタイムアウト」

OAuth 認可は成功したが、**Contribution が読めず**、公開 API の **contributors 集計**にフォールバックし **`contributors の集計がタイムアウトしました`** と出る場合。

**原因（よくある）**は **`corsForRequest` が `allowed.includes(Origin)` を使っていた**こと。  
`ALLOWED_ORIGINS` に `https://HayatoToyoda.github.io` と書き、ブラウザの `Origin` は `https://hayatotoyoda.github.io` のとき、**大文字小文字で一致せず**、誤った `Access-Control-Allow-Origin` になり **CORS 失敗**（ブラウザは `net::ERR_FAILED` / ステータスが見えないことがある）。  
その結果 `fetchOAuthContributionActivity` が `null` になり、**クエリ付きの URL**（`?user=...`）では **REST の `stats/contributors` ループ**に回り、**HTTP 202** が続くとタイムアウトに見える。

**対処**: Worker の `resolveCorsOrigin` で **Origin を URL パースして小文字比較**し、**レスポンスの `Access-Control-Allow-Origin` にはブラウザが送った Origin をそのまま返す**（本リポジトリでは `workers/meadow-auth/src/index.js` を修正）。

---

## 9. 関連ファイル（本リポジトリ）

| ファイル | 内容 |
|----------|------|
| [workers/meadow-auth/src/index.js](../workers/meadow-auth/src/index.js) | `isAllowedReturnTo`、`corsForRequest` / `resolveCorsOrigin`、`handleAuthStart`、`handleAuthCallback`、`handleContributions` |
| [workers/meadow-auth/README.md](../workers/meadow-auth/README.md) | セットアップ・トラブルシュートへの短い言及 |
| [meadow/index.html](../meadow/index.html) | `return_to` に `location.href` を渡すスクリプト |

---

*メモの目的: 同じ症状の再発防止と、Zenn / Qiita 等への記事下書きの素材。*
