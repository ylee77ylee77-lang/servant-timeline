import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { getPublicSupabaseConfig } from "@/lib/supabase/config";

export function getSupabaseUserClient(request: NextRequest): SupabaseClient {
  const authorization = request.headers.get("authorization") ?? "";
  const { url, publishableKey } = getPublicSupabaseConfig();
  if (!url || !publishableKey || !/^Bearer\s+\S+/i.test(authorization)) {
    throw Object.assign(new Error("請先登入。"), { status: 401 });
  }

  return createClient(url, publishableKey, {
    global: { headers: { Authorization: authorization } },
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}
