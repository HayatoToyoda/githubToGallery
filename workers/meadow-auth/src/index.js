/**
 * GitHub OAuth + GraphQL Contribution Calendar 用 Cloudflare Worker
 * Secrets: GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, SESSION_SECRET
 * Vars: ALLOWED_ORIGINS (comma-separated, required for CORS)
 */

const COOKIE = "meadow_session";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

function getAllowedOrigins(env) {
  return (env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function corsForRequest(request, env) {
  const origin = request.headers.get("Origin");
  const allowed = getAllowedOrigins(env);
  const match = origin && allowed.includes(origin) ? origin : allowed[0] || "";
  return {
    "Access-Control-Allow-Origin": match,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function isAllowedReturnTo(url, env) {
  if (!url) return false;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    const allowed = getAllowedOrigins(env);
    return allowed.some((prefix) => url.startsWith(prefix));
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
      if (path === "/auth/github") {
        return handleAuthStart(request, env, url);
      }
      if (path === "/auth/github/callback") {
        return handleAuthCallback(request, env, url);
      }
      if (path === "/api/contributions" && request.method === "GET") {
        return handleContributions(request, env);
      }
      if (path === "/auth/logout") {
        return handleLogout(request, env, url);
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

function redirect(location, headers = {}) {
  return new Response(null, { status: 302, headers: { Location: location, ...headers } });
}

function jsonResponse(obj, status, extra = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...extra },
  });
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
  let returnTo = url.searchParams.get("return_to") || "";
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

async function handleAuthCallback(request, env, url) {
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) {
    return new Response("Missing code or state", { status: 400 });
  }
  const st = await verifySignedPayload(state, env.SESSION_SECRET);
  if (!st || !st.rt || !st.exp || Date.now() > st.exp) {
    return new Response("Invalid state", { status: 400 });
  }
  if (!isAllowedReturnTo(st.rt, env)) {
    return new Response("Invalid return_to", { status: 400 });
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
  const tokenJson = await tokenRes.json();
  if (!tokenRes.ok || !tokenJson.access_token) {
    return new Response("Token exchange failed", { status: 400 });
  }

  const cookie = await createSessionCookie(tokenJson.access_token, env.SESSION_SECRET);
  return redirect(st.rt, { "Set-Cookie": cookie });
}

async function handleContributions(request, env) {
  const cors = corsForRequest(request, env);
  if (!cors["Access-Control-Allow-Origin"]) {
    return jsonResponse({ error: "cors_origin_not_allowed" }, 403, cors);
  }
  const token = await readSessionFromCookie(request, env.SESSION_SECRET);
  if (!token) {
    return jsonResponse({ error: "unauthorized" }, 401, cors);
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
    },
    body: JSON.stringify({
      query,
      variables: {
        from: from.toISOString(),
        to: to.toISOString(),
      },
    }),
  });

  const body = await gqlRes.json();
  const headers = { ...cors };
  return new Response(JSON.stringify(body), {
    status: gqlRes.ok ? 200 : gqlRes.status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

async function handleLogout(request, env, url) {
  const allowed = getAllowedOrigins(env);
  let returnTo = url.searchParams.get("return_to") || "";
  if (!isAllowedReturnTo(returnTo, env)) {
    returnTo = allowed[0] ? `${allowed[0].replace(/\/$/, "")}/` : "/";
  }
  if (!returnTo) returnTo = "/";
  return redirect(returnTo, { "Set-Cookie": clearSessionCookie() });
}
