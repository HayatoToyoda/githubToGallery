/**
 * Cloudflare Worker 上の OAuth セッションで GraphQL Contribution Calendar を取得する。
 * globalThis.MEADOW_API_BASE が空なら何もしない。
 */

/**
 * @typedef {{ commitCount: number, label: string, source: string }} GithubActivity
 */

/**
 * @param {string} apiBase Worker のオリジン（末尾スラッシュなし）
 * @returns {Promise<GithubActivity | null>}
 */
export async function fetchOAuthContributionActivity(apiBase) {
  const base = (apiBase || "").replace(/\/$/, "");
  if (!base) return null;
  const res = await fetch(`${base}/api/contributions`, {
    credentials: "include",
    mode: "cors",
  });
  if (res.status === 401) return null;
  if (!res.ok) return null;
  const json = await res.json();
  if (json.errors?.length) {
    console.warn("GraphQL errors:", json.errors);
    return null;
  }
  const cal = json.data?.viewer?.contributionsCollection?.contributionCalendar;
  if (!cal) return null;
  const total = cal.totalContributions;
  if (typeof total !== "number") return null;
  return {
    commitCount: Math.max(0, total),
    label: `Contribution Calendar（過去約1年）· ${total.toLocaleString()} contributions`,
    source: "oauth_calendar",
  };
}
