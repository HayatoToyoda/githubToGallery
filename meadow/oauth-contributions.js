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

/** `?meadowDebug=1` のときだけ `globalThis.__MEADOW_OAUTH_DEBUG` に記録（HTTPS Pages 向け・秘密は入れない） */
function recordMeadowOAuthDebug(payload) {
  try {
    if (typeof location === "undefined") return;
    if (!new URLSearchParams(location.search).get("meadowDebug")) return;
    globalThis.__MEADOW_OAUTH_DEBUG = { ...payload, t: Date.now() };
  } catch {
    /* ignore */
  }
}

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
 * セッションの有効性を確認する。
 * @param {string} apiBase Worker のオリジン（末尾スラッシュなし）
 * @returns {Promise<{ loggedIn: boolean, login?: string }>}
 */
export async function checkOAuthSession(apiBase) {
  const base = (apiBase || "").replace(/\/$/, "");
  if (!base) return { loggedIn: false };
  try {
    const res = await fetch(`${base}/auth/status`, {
      credentials: "include",
      mode: "cors",
    });
    if (!res.ok) return { loggedIn: false };
    return await res.json();
  } catch {
    return { loggedIn: false };
  }
}

/**
 * @param {string} apiBase Worker のオリジン（末尾スラッシュなし）
 * @returns {Promise<GithubActivity | null>}
 */
export async function fetchOAuthContributionActivity(apiBase) {
  const base = (apiBase || "").replace(/\/$/, "");
  if (!base) return null;
  let res;
  try {
    res = await fetch(`${base}/api/contributions`, {
      credentials: "include",
      mode: "cors",
    });
  } catch (err) {
    console.warn("[meadow] /api/contributions fetch failed", err?.name, String(err?.message));
    recordMeadowOAuthDebug({
      phase: "fetch_throw",
      errName: err?.name,
      errMessage: String(err?.message).slice(0, 200),
    });
    return null;
  }
  const acao = res.headers.get("access-control-allow-origin");
  const xdbg = res.headers.get("x-meadow-debug");
  if (res.status === 401) {
    console.warn("[meadow] /api/contributions 401 (Cookie 未送信またはセッション無効)", {
      acao,
      xMeadowDebug: xdbg,
    });
    recordMeadowOAuthDebug({ phase: "http_401", status: 401, acao, xMeadowDebug: xdbg });
    return null;
  }
  if (!res.ok) {
    console.warn("[meadow] /api/contributions 非 OK", res.status, { acao, xMeadowDebug: xdbg });
    recordMeadowOAuthDebug({ phase: "http_not_ok", status: res.status, acao, xMeadowDebug: xdbg });
    return null;
  }
  let json;
  try {
    json = await res.json();
  } catch (e) {
    console.warn("[meadow] /api/contributions JSON parse failed", String(e?.message), { acao, xMeadowDebug: xdbg });
    recordMeadowOAuthDebug({ phase: "json_parse_fail", acao, xMeadowDebug: xdbg });
    return null;
  }
  if (json.errors?.length) {
    console.warn("GraphQL errors:", json.errors);
    recordMeadowOAuthDebug({ phase: "graphql_errors", count: json.errors.length });
    return null;
  }
  const cal = json.data?.viewer?.contributionsCollection?.contributionCalendar;
  if (!cal) {
    recordMeadowOAuthDebug({ phase: "no_calendar", hasData: !!json.data, hasViewer: !!json.data?.viewer });
    return null;
  }
  const total = cal.totalContributions;
  if (typeof total !== "number") {
    recordMeadowOAuthDebug({ phase: "bad_total", totalType: typeof total });
    return null;
  }
  const { days, max } = flattenContributionDays(cal);
  recordMeadowOAuthDebug({ phase: "ok", total });
  return {
    commitCount: Math.max(0, total),
    label: `Contribution Calendar（過去約1年）· ${total.toLocaleString()} contributions`,
    source: "oauth_calendar",
    contributionDays: days.length ? days : undefined,
    maxDayContributions: max > 0 ? max : undefined,
  };
}
