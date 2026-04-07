# Meadow User-Only Activity Design

**Date:** 2026-04-08

**Goal:** `meadow` を「GitHub ユーザーの活動量に応じた草を見せるだけ」のサービスに絞り、`repo` 指定 UI とそのロジックを削除する。

## Background

- 現在の `meadow` は `user` のみ指定時に公開リポジトリを走査して最適なリポジトリを自動選択できる。
- 一方で `repo` / `r` クエリ、`owner/name` 入力欄、`repo` 前提の説明文が残っており、UI とロジックの責務が広がっている。
- 要件は「ユーザーのアカウントに応じた草を見せる」ことであり、リポジトリ選択は不要。

## Decisions

### 1. UI は `user` 入力のみにする

- `meadow/index.html` から `repo` ラベルと入力欄を削除する。
- フォーム送信時は `user` だけを URL に反映する。
- 説明文とステータスメッセージも `user` / OAuth 前提へ合わせる。

### 2. 公開 API の分岐は `user` のみにする

- `meadow/github-activity.js` は `resolveActivityFromUsernameOnly()` を主経路にする。
- `repo` / `r` を直接読む分岐、`owner/name` のエラー、`repo_total` / `repo_contributor` の戻り値は削除する。
- 旧 `?repo=` URL でアクセスしても、`user` があれば `user` ベースの集計を優先する。

### 3. 旧 URL は静かに正規化する

- フロントエンドでは初期ロード時およびフォーム送信時に `repo` / `r` を落とし、`user` のみが残る URL を正規形にする。
- Worker の OAuth `return_to` / logout `return_to` でも `repo` / `r` を除去し、認証の往復後に古い URL が復活しないようにする。

### 4. ドキュメントも `user` 前提に揃える

- `README.md`、`meadow/CAPTURE.md`、必要な補助ドキュメントの `repo` 指定例を削除する。
- OAuth / CORS の説明は残すが、サービス説明は「ユーザーの活動量を反映」に寄せる。

## Testing Strategy

- Node 組み込みテストで、`repo` パラメータを落とす URL 正規化を先に失敗テスト化する。
- 公開 API 解決は `resolveGithubActivity()` が `repo` を無視して `user` ベースへ進むことを先に失敗テスト化する。
- Worker 側は `return_to` の正規化関数を切り出し、`repo` / `r` を除去することを先に失敗テスト化する。
- UI の削除自体は DOM の目視確認と lint / 構文チェックで補完する。

## Non-Goals

- GitHub 公開 API の集計方式自体は変更しない。
- OAuth Contribution Calendar の取得方式は変更しない。
- README カード API は `user` ベースのため変更しない。
