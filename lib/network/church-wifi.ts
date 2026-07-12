import type { NextRequest } from "next/server";

const DEFAULT_ALLOWED_IPS = "123.51.237.145";

export function getAllowedChurchIps() {
  return (process.env.CHURCH_WIFI_ALLOWED_IPS || DEFAULT_ALLOWED_IPS)
    .split(",")
    .map((ip) => ip.trim())
    .filter(Boolean);
}

export function getRequestClientIp(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const rawIp = forwardedFor?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")
    || request.headers.get("cf-connecting-ip")
    || request.headers.get("x-client-ip")
    || "";

  return rawIp.trim().replace(/^::ffff:/, "").replace(/^\[|\]$/g, "");
}

export function isChurchNetworkRequest(request: NextRequest) {
  return getAllowedChurchIps().includes(getRequestClientIp(request));
}
