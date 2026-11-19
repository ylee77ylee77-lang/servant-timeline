export type AppIceServer = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

export const FALLBACK_ICE_SERVERS: AppIceServer[] = [
  { urls: ["stun:stun.cloudflare.com:3478"] },
];

const CLOUDFLARE_STUN_PATTERN = /^stun:stun\.cloudflare\.com(?::\d+)?$/i;
const CLOUDFLARE_TURN_PATTERN = /^turns?:turn\.cloudflare\.com(?::\d+)?(?:\?transport=(?:udp|tcp))?$/i;

function sanitizeUrl(value: unknown) {
  if (typeof value !== "string") return null;
  const url = value.trim();
  if (!url || /:53(?:\?|$)/.test(url)) return null;
  if (CLOUDFLARE_STUN_PATTERN.test(url) || CLOUDFLARE_TURN_PATTERN.test(url)) {
    return url;
  }
  return null;
}

export function sanitizeCloudflareIceServers(value: unknown): AppIceServer[] {
  if (!Array.isArray(value)) return [...FALLBACK_ICE_SERVERS];

  const servers: AppIceServer[] = [];

  for (const candidate of value) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;

    const row = candidate as Record<string, unknown>;
    const rawUrls = Array.isArray(row.urls) ? row.urls : [row.urls];
    const urls = rawUrls
      .map(sanitizeUrl)
      .filter((url): url is string => Boolean(url));

    if (!urls.length) continue;

    const containsTurn = urls.some((url) => /^turns?:/i.test(url));
    if (containsTurn) {
      if (typeof row.username !== "string" || !row.username.trim()) continue;
      if (typeof row.credential !== "string" || !row.credential.trim()) continue;
      servers.push({
        urls,
        username: row.username,
        credential: row.credential,
      });
      continue;
    }

    servers.push({ urls });
  }

  if (!servers.some((server) => {
    const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
    return urls.some((url) => /^stun:/i.test(url));
  })) {
    servers.unshift(...FALLBACK_ICE_SERVERS);
  }

  return servers.length ? servers : [...FALLBACK_ICE_SERVERS];
}

export function hasTurnRelay(servers: AppIceServer[]) {
  return servers.some((server) => {
    const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
    return urls.some((url) => /^turns?:/i.test(url));
  });
}
