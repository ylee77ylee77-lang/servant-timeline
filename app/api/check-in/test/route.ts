import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { isServiceType } from "@/lib/services/catalog";

export async function POST(request: NextRequest) {
  try {
    await requireAdmin(request);
  } catch (error) {
    const status = error instanceof Error && "status" in error ? error.status : undefined;
    if (status === 401 || status === 403) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "無法驗證管理員權限。" }, { status });
    }
    return NextResponse.json({ error: "暫時無法驗證管理員權限，請稍後再試。" }, { status: 500 });
  }

  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || !("serviceType" in body)
    || typeof body.serviceType !== "string" || !isServiceType(body.serviceType)) {
    return NextResponse.json({ error: "請選擇有效堂次。" }, { status: 400 });
  }

  return NextResponse.json({ serviceType: body.serviceType });
}
