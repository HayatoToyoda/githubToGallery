/**
 * GitHub 公開 API の contributors 統計からコミット数を取り、大地と草のスケールに使う。
 * ユーザー名から公開リポジトリを数件試し、あなたのコミット数が最大のリポを自動選択する。
 */

/**
 * @typedef {{
 *   commitCount: number,
 *   label: string,
 *   source: string,
 *   contributionDays?: number[],
 *   maxDayContributions?: number,
 * }} GithubActivity
 */

const API = "https://api.github.com";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * @param {string} owner
 * @param {string} repo
 * @param {{ allowMissingRepo?: boolean }} [options]
 */
async function fetchContributorStats(owner, repo, options = {}) {
  const { allowMissingRepo = false } = options;
  const url = `${API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/stats/contributors`;
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(url, { headers: { Accept: "application/vnd.github+json" } });
    if (res.status === 202) {
      await sleep(1500);
      continue;
    }
    if (res.status === 404) {
      if (allowMissingRepo) return [];
      throw new Error(`リポジトリが見つかりません: ${owner}/${repo}`);
    }
    if (!res.ok) {
      if (allowMissingRepo && res.status >= 500) return [];
      throw new Error(`contributors API: ${res.status}`);
    }
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  }
  throw new Error("contributors の集計がタイムアウトしました（しばらくして再試行）");
}

/**
 * @param {string} username
 * @returns {Promise<Array<{ full_name: string, owner: { login: string }, name: string }>>}
 */
async function fetchPublicReposForUser(username) {
  const url = `${API}/users/${encodeURIComponent(username)}/repos?per_page=50&sort=updated`;
  const res = await fetch(url, { headers: { Accept: "application/vnd.github+json" } });
  if (res.status === 404) {
    throw new Error(`ユーザーが見つかりません: ${username}`);
  }
  if (!res.ok) {
    throw new Error(`repos API: ${res.status}`);
  }
  return res.json();
}

/**
 * contributors 行から特定ユーザーの total を取得
 */
function commitsForUser(rows, username) {
  const login = username.toLowerCase();
  for (const row of rows) {
    const name = row.author?.login?.toLowerCase();
    if (!name) continue;
    if (name === login) return row.total ?? 0;
  }
  return 0;
}

/**
 * ユーザー名だけから、公開リポを走査して「あなたのコミット」が最も多いリポを選ぶ
 * @param {string} username
 * @returns {Promise<GithubActivity>}
 */
async function resolveActivityFromUsernameOnly(username) {
  const login = username.trim();
  if (!login) {
    throw new Error("ユーザー名を入力してください");
  }

  const candidates = [];
  const seen = new Set();
  const add = (owner, name) => {
    const key = `${owner}/${name}`.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({ owner, name, full: `${owner}/${name}` });
  };

  add(login, login);

  let repos = [];
  try {
    repos = await fetchPublicReposForUser(login);
  } catch (e) {
    if (candidates.length === 1) throw e;
  }
  for (const r of repos) {
    if (r.fork) continue;
    add(r.owner.login, r.name);
    if (candidates.length >= 12) break;
  }

  let best = { commits: 0, full: "", owner: "", name: "" };

  for (let i = 0; i < candidates.length; i++) {
    const { owner, name, full } = candidates[i];
    if (i > 0) await sleep(350);
    const rows = await fetchContributorStats(owner, name, { allowMissingRepo: true });
    if (!rows.length) continue;
    const n = commitsForUser(rows, login);
    if (n > best.commits) {
      best = { commits: n, full, owner, name };
    }
  }

  if (best.commits <= 0) {
    throw new Error(
      "公開リポジトリでコミットを集計できませんでした。プロフィール用リポジトリ（同名）がない、または contributors 統計が未生成の可能性があります。"
    );
  }

  return {
    commitCount: best.commits,
    label: `${login} · 自動選択 ${best.full} · このリポでのあなたのコミット約 ${best.commits.toLocaleString()} 件`,
    source: "auto_user",
  };
}

/**
 * @param {URLSearchParams} searchParams
 * @returns {Promise<GithubActivity>}
 */
export async function resolveGithubActivity(searchParams) {
  const user = (searchParams.get("user") || searchParams.get("u") || "").trim();

  if (user) {
    return resolveActivityFromUsernameOnly(user);
  }

  return {
    commitCount: 320,
    label: "デモ（コミット数 320 相当）· ユーザー名で実データ",
    source: "demo",
  };
}
