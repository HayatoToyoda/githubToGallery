/**
 * GitHub OAuth + GraphQL Contribution Calendar 用 Cloudflare Worker
 * Secrets: GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, SESSION_SECRET
 * Optional: GITHUB_TOKEN — README カード用の GitHub API レート制限緩和（read-only PAT）
 * Vars: ALLOWED_ORIGINS (comma-separated, required for CORS)
 */

import {
  buildReadmeCardSvg,
  buildErrorCardSvg,
  isValidGitHubUsername,
} from "./readme-card.js";
import { sanitizeReturnToForMeadow } from "./meadow-return-to.mjs";

const COOKIE = "meadow_session";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

function getAllowedOrigins(env) {
  return (env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * ブラウザの Origin ヘッダ（例: https://hayatotoyoda.github.io）と
 * ALLOWED_ORIGINS の各要素を origin 単位で比較する。
 * GitHub Pages はホスト名を小文字に正規化するが、設定側に HayatoToyoda のように
 * 大文字が混ざると旧実装の includes だけでは一致しない → CORS 失敗（net::ERR_FAILED）。
 * @returns {string} 一致したときはリクエストの Origin をそのまま返す（ACAO は完全一致必須）
 */
function resolveCorsOrigin(requestOrigin, allowedList) {
  if (!requestOrigin) return "";
  try {
    const req = new URL(requestOrigin);
    for (const entry of allowedList) {
      try {
        const allowed = new URL(entry);
        if (req.origin.toLowerCase() === allowed.origin.toLowerCase()) {
          return requestOrigin;
        }
      } catch {
        /* ignore invalid entry */
      }
    }
  } catch {
    return "";
  }
  return "";
}

function corsForRequest(request, env) {
  const origin = request.headers.get("Origin");
  const allowed = getAllowedOrigins(env);
  const match = resolveCorsOrigin(origin, allowed);
  const h = {
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
  if (match) {
    h["Access-Control-Allow-Origin"] = match;
  }
  return h;
}

function isAllowedReturnTo(url, env) {
  if (!url) return false;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    const allowed = getAllowedOrigins(env);
    return allowed.some((prefix) => {
      const p = prefix.trim();
      if (!p) return false;
      try {
        const pu = new URL(p);
        if (u.origin.toLowerCase() !== pu.origin.toLowerCase()) return false;
        const pathPrefix = pu.pathname || "/";
        if (pathPrefix === "/" || pathPrefix === "") return true;
        return u.pathname === pathPrefix || u.pathname.startsWith(`${pathPrefix}/`);
      } catch {
        return url.startsWith(p);
      }
    });
  } catch {
    return false;
  }
}

async function sha256Bytes(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return new Uint8Array(buf);
}

async function importHmacKey(secret) {
  const raw = await sha256Bytes(secret);
  return crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

function b64EncodeUtf8(s) {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function b64DecodeUtf8(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

async function signPayload(payloadObj, secret) {
  const payloadStr = JSON.stringify(payloadObj);
  const key = await importHmacKey(secret);
  const data = new TextEncoder().encode(payloadStr);
  const sig = await crypto.subtle.sign("HMAC", key, data);
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return b64EncodeUtf8(payloadStr) + "." + sigB64;
}

async function verifySignedPayload(token, secret) {
  const dot = token.lastIndexOf(".");
  if (dot < 0) return null;
  const payloadB64 = token.slice(0, dot);
  const sigB64 = token.slice(dot + 1);
  let payloadStr;
  try {
    payloadStr = b64DecodeUtf8(payloadB64);
  } catch {
    return null;
  }
  const key = await importHmacKey(secret);
  const data = new TextEncoder().encode(payloadStr);
  let sig;
  try {
    sig = Uint8Array.from(atob(sigB64), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
  const ok = await crypto.subtle.verify("HMAC", key, sig, data);
  if (!ok) return null;
  try {
    const obj = JSON.parse(payloadStr);
    if (obj.exp && Date.now() > obj.exp) return null;
    return obj;
  } catch {
    return null;
  }
}

async function createSessionCookie(accessToken, secret) {
  const exp = Date.now() + COOKIE_MAX_AGE * 1000;
  const token = await signPayload({ at: accessToken, exp }, secret);
  return `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=${COOKIE_MAX_AGE}`;
}

async function readSessionFromCookie(request, secret) {
  const raw = request.headers.get("Cookie") || "";
  const m = raw.match(new RegExp(`${COOKIE}=([^;]+)`));
  if (!m) return null;
  const decoded = decodeURIComponent(m[1].trim());
  const data = await verifySignedPayload(decoded, secret);
  if (!data || !data.at || !data.exp || Date.now() > data.exp) return null;
  return data.at;
}

function clearSessionCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=0`;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsForRequest(request, env) });
    }

    try {
      if (path === "/api/readme-card.svg" && request.method === "GET") {
        return await handleReadmeCard(request, env, url);
      }
      if (path === "/auth/github" && request.method === "GET") {
        return await handleAuthStart(request, env, url);
      }
      if (path === "/auth/github/callback" && request.method === "GET") {
        return await handleAuthCallback(request, env, url);
      }
      if (path === "/api/contributions" && request.method === "GET") {
        return await handleContributions(request, env);
      }
      if (path === "/auth/status" && request.method === "GET") {
        return await handleAuthStatus(request, env);
      }
      if (path === "/auth/logout" && request.method === "GET") {
        return await handleLogout(request, env, url);
      }
    } catch (e) {
      console.error(e);
      return jsonResponse(
        { error: "internal_error" },
        500,
        corsForRequest(request, env)
      );
    }

    return new Response("meadow-auth: not found", { status: 404 });
  },
};

const README_CARD_UA = "githubToGallery/meadow-auth-readme-card";
const GITHUB_API_UA = "githubToGallery/meadow-auth";

async function handleReadmeCard(request, env, url) {
  const userParam = url.searchParams.get("user") || url.searchParams.get("username");
  const theme = url.searchParams.get("theme") || "tokyonight";
  const showIcons = url.searchParams.get("show_icons") !== "false";
  const widthRaw = url.searchParams.get("width");
  const width = widthRaw ? parseInt(widthRaw, 10) : 450;

  const svgOpts = { theme, width: Number.isFinite(width) ? width : 450 };

  if (!userParam || !isValidGitHubUsername(userParam)) {
    const svg = buildErrorCardSvg("Invalid or missing user parameter", svgOpts);
    return new Response(svg, {
      status: 400,
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": README_CARD_UA,
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`;
  }

  const apiUrl = `https://api.github.com/users/${encodeURIComponent(userParam)}`;
  const res = await fetch(apiUrl, { headers });

  if (res.status === 404) {
    const svg = buildErrorCardSvg("User not found", svgOpts);
    return new Response(svg, {
      status: 404,
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  if (res.status === 403) {
    const svg = buildErrorCardSvg("GitHub API rate limit — retry later or set GITHUB_TOKEN", svgOpts);
    return new Response(svg, {
      status: 200,
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
    });
  }

  if (!res.ok) {
    const svg = buildErrorCardSvg(`GitHub API error (${res.status})`, svgOpts);
    return new Response(svg, {
      status: 502,
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  const user = await res.json();
  const svg = buildReadmeCardSvg(user, { theme, showIcons, width: svgOpts.width });

  return new Response(svg, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}

function redirect(location, headers = {}) {
  return new Response(null, { status: 302, headers: { Location: location, ...headers } });
}

function jsonResponse(obj, status, extra = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...extra },
  });
}

/** ブラウザが読めるデバッグ（トークンは含めない）。ingest と Network の X-Meadow-Debug 用 */
function meadowDebugHeaders(request, cors, extras = {}) {
  const hasCookie = /(?:^|;\s*)meadow_session=/.test(request.headers.get("Cookie") || "");
  const payload = {
    hypothesisId: "H1-H4",
    corsAcao: !!cors["Access-Control-Allow-Origin"],
    hasCookie,
    ...extras,
  };
  return {
    "Access-Control-Expose-Headers": "X-Meadow-Debug",
    "X-Meadow-Debug": JSON.stringify(payload),
  };
}

function getRedirectUri(request) {
  const u = new URL(request.url);
  return `${u.origin}/auth/github/callback`;
}

async function handleAuthStart(request, env, url) {
  if (!env.GITHUB_CLIENT_ID || !env.SESSION_SECRET) {
    return new Response("Missing GITHUB_CLIENT_ID or SESSION_SECRET", { status: 500 });
  }
  const allowed = getAllowedOrigins(env);
  if (!allowed.length) {
    return new Response("ALLOWED_ORIGINS is not configured (wrangler.toml [vars] or dashboard)", {
      status: 500,
    });
  }
  let returnTo = sanitizeReturnToForMeadow(url.searchParams.get("return_to") || "");
  if (!isAllowedReturnTo(returnTo, env)) {
    returnTo = `${allowed[0].replace(/\/$/, "")}/`;
  }
  const state = await signPayload(
    { rt: returnTo, n: crypto.randomUUID(), exp: Date.now() + 10 * 60 * 1000 },
    env.SESSION_SECRET
  );
  const authorize = new URL("https://github.com/login/oauth/authorize");
  authorize.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
  authorize.searchParams.set("redirect_uri", getRedirectUri(request));
  authorize.searchParams.set("scope", "read:user");
  authorize.searchParams.set("state", state);
  return redirect(authorize.toString());
}

/** return_to 付きでエラーリダイレクト（ユーザーを行き止まりにしない） */
function redirectWithError(returnTo, errorCode, fallbackAllowed, env) {
  let dest = returnTo;
  if (!dest || !isAllowedReturnTo(dest, env)) {
    const allowed = getAllowedOrigins(env);
    dest = allowed.length ? `${allowed[0].replace(/\/$/, "")}/` : null;
  }
  if (dest) {
    try {
      const u = new URL(dest);
      u.searchParams.set("meadow_auth_error", errorCode);
      return redirect(u.toString());
    } catch { /* fall through */ }
  }
  return new Response(`OAuth error: ${errorCode}`, { status: 400 });
}

async function handleAuthCallback(request, env, url) {
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) {
    return redirectWithError(null, "missing_code_or_state", true, env);
  }
  const st = await verifySignedPayload(state, env.SESSION_SECRET);
  if (!st || !st.rt || !st.exp || Date.now() > st.exp) {
    return redirectWithError(st?.rt || null, "invalid_or_expired_state", true, env);
  }
  if (!isAllowedReturnTo(st.rt, env)) {
    return redirectWithError(null, "invalid_return_to", true, env);
  }

  const redirectUri = getRedirectUri(request);
  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
    }),
  });

  let tokenJson;
  try {
    tokenJson = await tokenRes.json();
  } catch {
    return redirectWithError(st.rt, "token_response_not_json", true, env);
  }
  if (!tokenRes.ok || !tokenJson.access_token) {
    const detail = tokenJson?.error || "no_access_token";
    return redirectWithError(st.rt, `token_exchange_failed:${detail}`, true, env);
  }

  const cookie = await createSessionCookie(tokenJson.access_token, env.SESSION_SECRET);
  return redirect(st.rt, { "Set-Cookie": cookie });
}

async function handleAuthStatus(request, env) {
  const cors = corsForRequest(request, env);
  const token = await readSessionFromCookie(request, env.SESSION_SECRET);
  if (!token) {
    return jsonResponse({ loggedIn: false }, 200, cors);
  }
  // Optionally fetch the login name so the frontend can display it
  try {
    const res = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": GITHUB_API_UA,
        Accept: "application/vnd.github+json",
      },
    });
    if (res.ok) {
      const user = await res.json();
      return jsonResponse({ loggedIn: true, login: user.login }, 200, cors);
    }
  } catch { /* fall through */ }
  // Token present but couldn't verify with GitHub — still report loggedIn
  // (contributions endpoint will fail independently if the token is actually invalid)
  return jsonResponse({ loggedIn: true }, 200, cors);
}

async function handleContributions(request, env) {
  const cors = corsForRequest(request, env);
  if (!cors["Access-Control-Allow-Origin"]) {
    return jsonResponse(
      { error: "cors_origin_not_allowed" },
      403,
      { ...cors, ...meadowDebugHeaders(request, cors, { stage: "cors_blocked" }) }
    );
  }
  const token = await readSessionFromCookie(request, env.SESSION_SECRET);
  if (!token) {
    return jsonResponse(
      { error: "unauthorized" },
      401,
      { ...cors, ...meadowDebugHeaders(request, cors, { stage: "no_session_token" }) }
    );
  }

  const to = new Date();
  const from = new Date();
  from.setFullYear(from.getFullYear() - 1);

  const query = `query Contribs($from: DateTime!, $to: DateTime!) {
    viewer {
      contributionsCollection(from: $from, to: $to) {
        contributionCalendar {
          totalContributions
          weeks {
            contributionDays {
              date
              contributionCount
            }
          }
        }
      }
    }
  }`;

  const gqlRes = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": GITHUB_API_UA,
    },
    body: JSON.stringify({
      query,
      variables: {
        from: from.toISOString(),
        to: to.toISOString(),
      },
    }),
  });

  const gqlText = await gqlRes.text();
  let body;
  try {
    body = JSON.parse(gqlText);
  } catch {
    return jsonResponse(
      { error: "graphql_response_not_json", gqlStatus: gqlRes.status },
      502,
      {
        ...cors,
        ...meadowDebugHeaders(request, cors, { stage: "gql_body_parse_failed", gqlHttp: gqlRes.status }),
      }
    );
  }

  const headers = {
    ...cors,
    ...meadowDebugHeaders(request, cors, {
      stage: "gql_done",
      gqlHttp: gqlRes.status,
      gqlOk: gqlRes.ok,
      hasGraphqlErrors: Array.isArray(body.errors) && body.errors.length > 0,
    }),
    "Content-Type": "application/json",
  };
  return new Response(JSON.stringify(body), {
    status: gqlRes.ok ? 200 : gqlRes.status,
    headers,
  });
}

async function handleLogout(request, env, url) {
  const allowed = getAllowedOrigins(env);
  let returnTo = sanitizeReturnToForMeadow(url.searchParams.get("return_to") || "");
  if (!isAllowedReturnTo(returnTo, env)) {
    returnTo = allowed[0] ? `${allowed[0].replace(/\/$/, "")}/` : "/";
  }
  if (!returnTo) returnTo = "/";
  return redirect(returnTo, { "Set-Cookie": clearSessionCookie() });
}
