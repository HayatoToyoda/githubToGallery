export function normalizeMeadowUrlSearch(search) {
  const params = new URLSearchParams(search);
  const user = (params.get("user") || params.get("u") || "").trim();
  const next = new URLSearchParams();
  const passthroughKeys = ["noRotate", "meadowDebug"];

  if (user) {
    next.set("user", user);
  }

  for (const key of passthroughKeys) {
    if (params.has(key)) {
      next.set(key, params.get(key) ?? "");
    }
  }

  const text = next.toString();
  return text ? `?${text}` : "";
}
