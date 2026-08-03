import { NextRequest, NextResponse } from "next/server";
import { isChurchNetworkRequest } from "@/lib/network/church-wifi";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const connected = isChurchNetworkRequest(request);

  return NextResponse.json(
    {
      connected,
      checkedAt: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0"
      }
    }
  );
}
