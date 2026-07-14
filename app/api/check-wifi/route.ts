import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const DEFAULT_ALLOWED_IPS = "123.51.237.145";

function getAllowedIps() {
  return (process.env.CHURCH_WIFI_ALLOWED_IPS || DEFAULT_ALLOWED_IPS)
    .split(",")
    .map(ip => ip.trim())
    .filter(Boolean);
}

function normalizeIp(ip: string) {
  return ip
    .trim()
    .replace(/^::ffff:/, "")
    .replace(/^\[|\]$/g, "");
}

function getClientIp(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "";
  }

  return (
    request.headers.get("x-real-ip") ||
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-client-ip") ||
    ""
  );
}

export async function GET(request: NextRequest) {
  const rawClientIp = getClientIp(request);
  const clientIp = normalizeIp(rawClientIp);
  const allowedIps = getAllowedIps();
  const connected = allowedIps.includes(clientIp);

  return NextResponse.json(
    {
      connected,
      checkedAt: new Date().toISOString(),
      clientIp: process.env.NODE_ENV === "development" ? clientIp : undefined
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0"
      }
    }
  );
}
