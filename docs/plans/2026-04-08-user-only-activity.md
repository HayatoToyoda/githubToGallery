# User-Only Activity Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** `meadow` を `user` ベースの体験に一本化し、`repo` 選択 UI と関連ロジックを削除する。

**Architecture:** フロントエンドは `user` のみを扱う URL 正規化ヘルパーを導入し、`github-activity.js` は `user` 前提の集計に絞る。Worker は OAuth の戻り先 URL から `repo` パラメータを除去する小さなヘルパーを追加し、認証往復後も URL が正規化されたままになるようにする。

**Tech Stack:** Static HTML/CSS/JS, Node.js built-in test runner, Cloudflare Workers

---

### Task 1: URL 正規化のテストと実装

**Files:**
- Create: `meadow/url-state.js`
- Create: `meadow/url-state.test.mjs`
- Modify: `meadow/index.html`

**Step 1: Write the failing test**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { normalizeMeadowUrlSearch } from "./url-state.js";

test("drops repo params and keeps user query", () => {
  const result = normalizeMeadowUrlSearch("?user=octocat&repo=owner/name&r=x");
  assert.equal(result, "?user=octocat");
});
```

**Step 2: Run test to verify it fails**

Run: `node --test meadow/url-state.test.mjs`
Expected: FAIL with missing export or wrong result

**Step 3: Write minimal implementation**

```js
export function normalizeMeadowUrlSearch(search) {
  const params = new URLSearchParams(search);
  const user = (params.get("user") || params.get("u") || "").trim();
  const next = new URLSearchParams();
  if (user) next.set("user", user);
  const text = next.toString();
  return text ? `?${text}` : "";
}
```

**Step 4: Run test to verify it passes**

Run: `node --test meadow/url-state.test.mjs`
Expected: PASS

**Step 5: Wire it into the page**

- `meadow/index.html` から `repo` 入力を削除する
- 初期表示時と submit 時に `normalizeMeadowUrlSearch()` を使う
- 必要なら `history.replaceState()` で旧 URL を静かに正規化する

**Step 6: Re-run the test**

Run: `node --test meadow/url-state.test.mjs`
Expected: PASS

### Task 2: GitHub 活動解決を user 専用にする

**Files:**
- Modify: `meadow/github-activity.js`
- Create: `meadow/github-activity.test.mjs`
- Modify: `meadow/main.js`

**Step 1: Write the failing test**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { resolveGithubActivity } from "./github-activity.js";

test("ignores repo query and resolves from user only", async () => {
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    if (String(url).includes("/users/octocat/repos")) {
      return Response.json([{ name: "octocat", owner: { login: "octocat" }, fork: false }]);
    }
    if (String(url).includes("/repos/octocat/octocat/stats/contributors")) {
      return Response.json([{ total: 7, author: { login: "octocat" } }]);
    }
    throw new Error(`unexpected url: ${url}`);
  };

  const activity = await resolveGithubActivity(
    new URLSearchParams("user=octocat&repo=owner/name")
  );

  assert.equal(activity.commitCount, 7);
  assert.equal(activity.source, "auto_user");
});
```

**Step 2: Run test to verify it fails**

Run: `node --test meadow/github-activity.test.mjs`
Expected: FAIL because current implementation enters `repo` path

**Step 3: Write minimal implementation**

- `resolveGithubActivity()` を `user` があれば常に `resolveActivityFromUsernameOnly()` に寄せる
- `repo` 分岐と関連エラー文言を削除する
- `main.js` の `hasQuery` / 読み込み文言 / デモ文言を `user` 前提へ更新する

**Step 4: Run test to verify it passes**

Run: `node --test meadow/github-activity.test.mjs`
Expected: PASS

**Step 5: Run combined tests**

Run: `node --test meadow/url-state.test.mjs meadow/github-activity.test.mjs`
Expected: PASS

### Task 3: Worker の return_to を正規化する

**Files:**
- Modify: `workers/meadow-auth/src/index.js`
- Create: `workers/meadow-auth/src/index.test.mjs`

**Step 1: Write the failing test**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeReturnToForMeadow } from "./index.js";

test("removes repo params from return_to", () => {
  const result = sanitizeReturnToForMeadow(
    "https://hayatotoyoda.github.io/githubToGallery/meadow/?user=octocat&repo=owner/name&r=x"
  );
  assert.equal(
    result,
    "https://hayatotoyoda.github.io/githubToGallery/meadow/?user=octocat"
  );
});
```

**Step 2: Run test to verify it fails**

Run: `node --test workers/meadow-auth/src/index.test.mjs`
Expected: FAIL with missing export

**Step 3: Write minimal implementation**

- `sanitizeReturnToForMeadow()` を追加し、`repo` / `r` を削除
- `handleAuthStart()` と `handleLogout()` の `return_to` で適用
- 他のパスや origin 判定は変えない

**Step 4: Run test to verify it passes**

Run: `node --test workers/meadow-auth/src/index.test.mjs`
Expected: PASS

**Step 5: Run all tests**

Run: `node --test meadow/url-state.test.mjs meadow/github-activity.test.mjs workers/meadow-auth/src/index.test.mjs`
Expected: PASS

### Task 4: ドキュメントと最終確認

**Files:**
- Modify: `README.md`
- Modify: `meadow/CAPTURE.md`
- Modify: `workers/meadow-auth/README.md` if needed

**Step 1: Update docs**

- `repo` 指定例を削除する
- `user` / OAuth ベースの説明へ寄せる

**Step 2: Verify syntax**

Run: `node --check meadow/github-activity.js`
Expected: exit 0

Run: `node --check meadow/url-state.js`
Expected: exit 0

Run: `node --check workers/meadow-auth/src/index.js`
Expected: exit 0

**Step 3: Verify tests**

Run: `node --test meadow/url-state.test.mjs meadow/github-activity.test.mjs workers/meadow-auth/src/index.test.mjs`
Expected: PASS

**Step 4: Manual verification**

- フォームが `user` 入力のみになっている
- `?repo=` 付き URL でも表示後の URL は `user` だけになる
- OAuth ログイン / ログアウト後も `repo` パラメータが戻らない

**Step 5: Commit**

ユーザーから明示依頼があったときのみ実施する。
