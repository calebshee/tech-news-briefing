const TRACKING_PARAM = /^(utm_\w+|fbclid|gclid|mc_cid|mc_eid|ref|ref_src|cmpid|ncid|smid|ocid)$/i;

/**
 * Normalise a URL so the same article shared through different sources
 * compares equal: lowercase host, no "www.", no scheme, no fragment,
 * no tracking params, no trailing slash.
 */
export function canonicalUrl(raw: string): string {
  try {
    const u = new URL(raw);
    const host = hostOf(u);
    const params = [...u.searchParams.entries()]
      .filter(([k]) => !TRACKING_PARAM.test(k))
      .sort(([a], [b]) => a.localeCompare(b));
    const query = params.length
      ? "?" + params.map(([k, v]) => `${k}=${v}`).join("&")
      : "";
    const path = u.pathname.replace(/\/+$/, "").replace(/\/amp$/, "");
    return `${host}${path}${query}`;
  } catch {
    return raw.trim().toLowerCase();
  }
}

/** "https://www.theverge.com/x" -> "theverge.com". */
export function domainOf(raw: string): string {
  try {
    return hostOf(new URL(raw));
  } catch {
    return "unknown";
  }
}

function hostOf(u: URL): string {
  return u.hostname.toLowerCase().replace(/^(www|m|amp)\./, "");
}
