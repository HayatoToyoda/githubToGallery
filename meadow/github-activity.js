/**
 * GitHub 公開 API の contributors 統計からコミット数だけを取り、大地と草のスケールに使う。
 * 認証なしだとレート制限があるため、本番では Actions + JSON も検討（README 参照）。
 */

const API = "https://api.github.com";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * @param {string} owner
 * @param {string} repo
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
 * @typedef {{ commitCount: number, label: string, source: string }} GithubActivity
 */

/**
 * @param {URLSearchParams} searchParams
 * @returns {Promise<GithubActivity>}
 */
export async function resolveGithubActivity(searchParams) {
  const user = (searchParams.get("user") || searchParams.get("u") || "").trim();
  const repoParam = (searchParams.get("repo") || searchParams.get("r") || "").trim();

  if (user && !repoParam) {
    return {
      commitCount: 0,
      label:
        "コミット数を反映するには ?repo=owner/name が必要です（?user= はそのリポ内の自分のコミットを指定）",
      source: "no_repo",
    };
  }

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
        commitCount: Math.max(0, totalCommits),
        label: `${user} @ ${owner}/${repo} · コミット約 ${totalCommits.toLocaleString()} 件`,
        source: "repo_contributor",
      };
    }

    for (const row of rows) {
      if (!row.author) continue;
      totalCommits += row.total ?? 0;
    }
    return {
      commitCount: Math.max(0, totalCommits),
      label: `${owner}/${repo} · 全 contributors 合計コミット約 ${totalCommits.toLocaleString()} 件`,
      source: "repo_total",
    };
  }

  return {
    commitCount: 320,
    label: "デモ（コミット数 320 相当）· ?repo=owner/name で実データ",
    source: "demo",
  };
}
