/**
 * Cloudflare Worker 上の OAuth セッションで GraphQL Contribution Calendar を取得する。
 * globalThis.MEADOW_API_BASE が空なら何もしない。
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

/**
 * @param {object} cal - GraphQL contributionCalendar
 */
function flattenContributionDays(cal) {
  const days = [];
  let max = 0;
  for (const week of cal.weeks || []) {
    for (const day of week.contributionDays || []) {
      const c = typeof day.contributionCount === "number" ? day.contributionCount : 0;
      days.push(c);
      if (c > max) max = c;
    }
  }
  return { days, max };
}

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
  const { days, max } = flattenContributionDays(cal);
  return {
    commitCount: Math.max(0, total),
    label: `Contribution Calendar（過去約1年）· ${total.toLocaleString()} contributions`,
    source: "oauth_calendar",
    contributionDays: days.length ? days : undefined,
    maxDayContributions: max > 0 ? max : undefined,
  };
}
