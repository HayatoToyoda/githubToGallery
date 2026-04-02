/**
 * README 埋め込み用 SVG カード（GitHub 公開ユーザー API ベース）
 * github-readme-stats 風のクエリに近い体裁。
 */

export const THEMES = {
  tokyonight: {
    bg: "#1a1b2e",
    border: "#7aa2f7",
    text: "#c0caf5",
    sub: "#565f89",
    accent: "#7aa2f7",
    title: "#bb9af7",
  },
  dark: {
    bg: "#0d1117",
    border: "#30363d",
    text: "#c9d1d9",
    sub: "#8b949e",
    accent: "#58a6ff",
    title: "#58a6ff",
  },
  default: {
    bg: "#fffefe",
    border: "#e4e2e2",
    text: "#434d58",
    sub: "#666666",
    accent: "#2f80ed",
    title: "#2f80ed",
  },
  radical: {
    bg: "#141321",
    border: "#fe428e",
    text: "#a9fef7",
    sub: "#d1bae8",
    accent: "#f8d847",
    title: "#fe428e",
  },
};

export function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** GitHub ユーザー名の緩い検証（39 文字以内、英数字とハイフン） */
export function isValidGitHubUsername(u) {
  if (!u || typeof u !== "string") return false;
  if (u.length < 1 || u.length > 39) return false;
  return /^[a-zA-Z0-9]([a-zA-Z0-9]|-(?=[a-zA-Z0-9]))*$/.test(u);
}

function fmtNum(n) {
  if (typeof n !== "number" || Number.isNaN(n)) return "—";
  return n.toLocaleString("en-US");
}

function yearFromIso(iso) {
  if (!iso) return "—";
  try {
    return String(new Date(iso).getFullYear());
  } catch {
    return "—";
  }
}

/**
 * @param {object} user — GET /users/:username の JSON
 * @param {{ theme?: string, showIcons?: boolean, width?: number }} opts
 */
export function buildReadmeCardSvg(user, opts = {}) {
  const themeName = opts.theme && THEMES[opts.theme] ? opts.theme : "tokyonight";
  const c = THEMES[themeName];
  const showIcons = opts.showIcons !== false;
  const w = Math.min(600, Math.max(300, opts.width || 450));
  const h = 195;
  const pad = 18;
  const login = escapeXml(user.login || "?");
  const display = escapeXml((user.name && String(user.name).trim()) || user.login || "?");
  const bioRaw = user.bio && String(user.bio).trim();
  const bio = escapeXml(bioRaw ? bioRaw.slice(0, 72) + (bioRaw.length > 72 ? "…" : "") : "");

  const repos = fmtNum(user.public_repos);
  const followers = fmtNum(user.followers);
  const following = fmtNum(user.following);
  const since = yearFromIso(user.created_at);

  const avatarCx = pad + 36;
  const avatarCy = pad + 36;

  const statAreaW = w - pad - (pad + 88);
  const colW = statAreaW / 3;

  const icon = (emoji, x, y) =>
    showIcons
      ? `<text x="${x}" y="${y}" font-size="14" fill="${c.accent}">${emoji}</text>`
      : "";

  const statBlock = (label, value, emoji, ix) => {
    const x0 = pad + 88 + ix * colW;
    const y0 = 128;
    const iconOff = showIcons ? 18 : 0;
    return `
    ${icon(emoji, x0, y0 - 2)}
    <text x="${x0 + iconOff}" y="${y0 + 14}" font-family="system-ui, Segoe UI, Helvetica, Arial, sans-serif" font-size="13" font-weight="700" fill="${c.text}">${value}</text>
    <text x="${x0}" y="${y0 + 34}" font-family="system-ui, Segoe UI, Helvetica, Arial, sans-serif" font-size="11" fill="${c.sub}">${label}</text>`;
  };

  const bioLineY = pad + 68;
  const sinceLineY = bio ? pad + 92 : pad + 74;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="GitHub stats for ${login}">
  <title>GitHub stats for ${login}</title>
  <defs>
    <clipPath id="avatarClip">
      <circle cx="${avatarCx}" cy="${avatarCy}" r="36"/>
    </clipPath>
  </defs>
  <rect x="1.5" y="1.5" rx="10" width="${w - 3}" height="${h - 3}" fill="${c.bg}" stroke="${c.border}" stroke-width="2"/>
  <image href="https://avatars.githubusercontent.com/${encodeURIComponent(user.login)}?s=80&amp;v=4" x="${pad}" y="${pad}" width="72" height="72" clip-path="url(#avatarClip)"/>
  <text x="${pad + 88}" y="${pad + 28}" font-family="system-ui, Segoe UI, Helvetica, Arial, sans-serif" font-size="18" font-weight="700" fill="${c.title}">${display}</text>
  <text x="${pad + 88}" y="${pad + 50}" font-family="ui-monospace, monospace" font-size="12" fill="${c.sub}">@${login}</text>
  ${bio ? `<text x="${pad + 88}" y="${bioLineY}" font-family="system-ui, Segoe UI, Helvetica, Arial, sans-serif" font-size="11" fill="${c.text}">${bio}</text>` : ""}
  <text x="${pad + 88}" y="${sinceLineY}" font-family="system-ui, Segoe UI, Helvetica, Arial, sans-serif" font-size="10" fill="${c.sub}">GitHub since ${since}</text>
  ${statBlock("Repos", repos, "📦", 0)}
  ${statBlock("Followers", followers, "👥", 1)}
  ${statBlock("Following", following, "👤", 2)}
</svg>`;
}

export function buildErrorCardSvg(message, opts = {}) {
  const themeName = opts.theme && THEMES[opts.theme] ? opts.theme : "tokyonight";
  const c = THEMES[themeName];
  const w = Math.min(600, Math.max(300, opts.width || 450));
  const h = 90;
  const msg = escapeXml(message.slice(0, 120));
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img">
  <rect x="1.5" y="1.5" rx="8" width="${w - 3}" height="${h - 3}" fill="${c.bg}" stroke="${c.border}" stroke-width="2"/>
  <text x="16" y="52" font-family="system-ui, sans-serif" font-size="13" fill="${c.text}">${msg}</text>
</svg>`;
}
