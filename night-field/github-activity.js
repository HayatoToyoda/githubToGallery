/**
 * GitHub 公開 API から「活動の強さ」を数値化し、草インスタンス数に使う。
 * 認証なしだとレート制限（時間あたり）があるため、本番ではトークン付きプロキシや
 * GitHub Actions で JSON を生成する方式が推奨（README のロードマップ参照）。
 */

const API = "https://api.github.com";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * @param {string} owner
 * @param {string} repo
 * @returns {Promise<Array<{ author?: { login: string }, total: number }>>}
 */
async function fetchContributorStats(owner, repo) {
  const url = `${API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/stats/contributors`;
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(url, { headers: { Accept: "application/vnd.github+json" } });
    if (res.status === 202) {
      await sleep(1500);
      continue;
    }
    if (res.status === 404) {
      throw new Error(`リポジトリが見つかりません: ${owner}/${repo}`);
    }
    if (!res.ok) {
      throw new Error(`contributors API: ${res.status}`);
    }
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  }
  throw new Error("contributors の集計がタイムアウトしました（しばらくして再試行）");
}

/**
 * @param {string} username
 */
async function fetchUser(username) {
  const res = await fetch(`${API}/users/${encodeURIComponent(username)}`, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (res.status === 404) {
    throw new Error(`ユーザーが見つかりません: ${username}`);
  }
  if (!res.ok) {
    throw new Error(`users API: ${res.status}`);
  }
  return res.json();
}

/**
 * ユーザーの公開情報だけから粗いスコア（コミット数の代替）
 * @param {object} user
 */
function scoreFromPublicProfile(user) {
  const repos = user.public_repos ?? 0;
  const followers = user.followers ?? 0;
  const gists = user.public_gists ?? 0;
  return Math.round(repos * 12 + followers * 3 + gists * 2);
}

/**
 * @param {URLSearchParams} searchParams
 * @returns {Promise<{ score: number, label: string, source: string }>}
 */
export async function resolveGithubScore(searchParams) {
  const user = (searchParams.get("user") || searchParams.get("u") || "").trim();
  const repoParam = (searchParams.get("repo") || searchParams.get("r") || "").trim();

  if (repoParam) {
    const parts = repoParam.split("/").filter(Boolean);
    if (parts.length !== 2) {
      throw new Error("repo は owner/name 形式で指定してください（例: torvalds/linux）");
    }
    const [owner, repo] = parts;
    const rows = await fetchContributorStats(owner, repo);

    if (!rows.length) {
      throw new Error(
        "contributors がまだ空です。リポジトリが新しいか、GitHub 側の集計待ちです（数分後に再試行）"
      );
    }

    let totalCommits = 0;
    let picked = null;

    if (user) {
      const login = user.toLowerCase();
      for (const row of rows) {
        const name = row.author?.login?.toLowerCase();
        if (!name) continue;
        if (name === login) {
          picked = row;
          break;
        }
      }
      if (!picked) {
        throw new Error(
          `このリポジトリの contributors に「${user}」が見つかりません（公開データのみ参照）`
        );
      }
      totalCommits = picked.total ?? 0;
      return {
        score: Math.max(1, totalCommits),
        label: `${user} @ ${owner}/${repo} · コミット約 ${totalCommits.toLocaleString()} 件`,
        source: "repo_contributor",
      };
    }

    for (const row of rows) {
      if (!row.author) continue;
      totalCommits += row.total ?? 0;
    }
    return {
      score: Math.max(1, totalCommits),
      label: `${owner}/${repo} · 全 contributors 合計コミット約 ${totalCommits.toLocaleString()} 件`,
      source: "repo_total",
    };
  }

  if (user) {
    const u = await fetchUser(user);
    const score = scoreFromPublicProfile(u);
    return {
      score: Math.max(1, score),
      label: `${u.login} · 公開プロフィールからの推定スコア（repo 未指定時は近似）`,
      source: "user_public",
    };
  }

  return {
    score: 4200,
    label: "デフォルト（?user= または ?repo= で GitHub 連携）",
    source: "default",
  };
}
