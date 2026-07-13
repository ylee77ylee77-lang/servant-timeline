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
  // Outside Vercel, fail closed unless the deployment explicitly declares a
  // reverse proxy that strips the incoming header and sets x-real-ip itself.
  const rawIp = process.env.VERCEL === "1"
    ? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || ""
    : process.env.CHURCH_WIFI_TRUST_X_REAL_IP === "true"
      ? request.headers.get("x-real-ip") || ""
      : "";

  return rawIp.trim().replace(/^::ffff:/, "").replace(/^\[|\]$/g, "");
}

export function isChurchNetworkRequest(request: NextRequest) {
  return getAllowedChurchIps().includes(getRequestClientIp(request));
}
