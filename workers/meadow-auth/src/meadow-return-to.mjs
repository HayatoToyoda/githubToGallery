function isMeadowPath(pathname) {
  return /\/meadow(?:\/|$)/.test(pathname);
}

export function sanitizeReturnToForMeadow(returnTo) {
  if (!returnTo) return returnTo;

  try {
    const url = new URL(returnTo);
    if (!isMeadowPath(url.pathname)) {
      return url.toString();
    }

    const user = (url.searchParams.get("user") || url.searchParams.get("u") || "").trim();

    url.searchParams.delete("user");
    url.searchParams.delete("u");
    url.searchParams.delete("repo");
    url.searchParams.delete("r");

    if (user) {
      url.searchParams.set("user", user);
    }

    return url.toString();
  } catch {
    return returnTo;
  }
}
