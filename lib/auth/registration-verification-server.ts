import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { REGISTRATION_COOKIE, isRegistrationToken, registrationDigest } from "@/lib/auth/registration-verification";
import { getSupabaseAdminClient } from "@/lib/supabase/server-admin";

export function readRegistrationSession(request: NextRequest) {
  const token = request.cookies.get(REGISTRATION_COOKIE)?.value;
  return isRegistrationToken(token) ? registrationDigest(token) : "";
}

export function registrationResponse(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: {
    "Cache-Control": "no-store, private",
    "Referrer-Policy": "no-referrer",
  } });
}

export function writeRegistrationCookie(response: NextResponse, token: string) {
  response.cookies.set(REGISTRATION_COOKIE, token, {
    httpOnly: true, secure: process.env.NODE_ENV === "production",
    sameSite: "strict", path: "/", maxAge: token ? 60 * 60 : 0,
  });
  return response;
}

export function isRegistrationSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  return origin === request.nextUrl.origin
    && (request.headers.get("content-type") || "").includes("application/json");
}

export function registrationMailOrigin() {
  if (process.env.VERCEL_ENV === "preview") {
    const host = String(process.env.VERCEL_URL || "");
    if (!/^[a-z0-9-]+\.vercel\.app$/i.test(host)) throw new Error("Missing preview origin");
    return "https://" + host;
  }
  if (process.env.NODE_ENV !== "production") {
    return "http://localhost:3000";
  }
  return "https://servant-timeline.vercel.app";
}

export async function getRegistrationDraft(sessionDigest: string) {
  if (!sessionDigest) return null;
  const { data, error } = await getSupabaseAdminClient().from("registration_email_challenges")
    .select("display_name,account_code,contact_email,status,created_at,expires_at")
    .eq("session_digest", sessionDigest).maybeSingle();
  if (error) throw error;
  if (!data || !["pending", "verified", "locked"].includes(data.status)) return null;
  return {
    displayName: String(data.display_name),
    accountCode: String(data.account_code),
    contactEmail: String(data.contact_email),
    status: Date.parse(data.expires_at) <= Date.now() ? "expired" : String(data.status),
    resendAt: new Date(Date.parse(data.created_at) + 60_000).toISOString(),
    expiresAt: String(data.expires_at),
  };
}
