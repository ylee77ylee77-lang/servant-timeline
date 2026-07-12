import { NextRequest, NextResponse } from "next/server";
import { getRequestClientIp, isChurchNetworkRequest } from "@/lib/network/church-wifi";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const clientIp = getRequestClientIp(request);
  const connected = isChurchNetworkRequest(request);

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
