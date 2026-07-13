import type { NextRequest } from "next/server";

const DEFAULT_ALLOWED_IPS = "123.51.237.145";

export function getAllowedChurchIps() {
  return (process.env.CHURCH_WIFI_ALLOWED_IPS || DEFAULT_ALLOWED_IPS)
    .split(",")
    .map((ip) => ip.trim())
    .filter(Boolean);
}

export function getRequestClientIp(request: NextRequest) {
  // Vercel overwrites x-forwarded-for at its edge to prevent client spoofing.
  // Only accept a local proxy fallback outside Vercel-managed deployments.
  const forwardedFor = request.headers.get("x-forwarded-for") || "";
  const rawIp = forwardedFor.split(",")[0]?.trim()
    || (process.env.VERCEL ? "" : request.headers.get("x-real-ip"))
    || "";

  return rawIp.trim().replace(/^::ffff:/, "").replace(/^\[|\]$/g, "");
}

export function isChurchNetworkRequest(request: NextRequest) {
  return getAllowedChurchIps().includes(getRequestClientIp(request));
}
