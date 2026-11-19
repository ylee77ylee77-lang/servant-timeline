import { NextRequest, NextResponse } from "next/server";
import {
  communicationErrorResponse,
  requireCommunicationActor,
} from "@/lib/communications/access";
import { getCommunicationBroadcastTopic } from "@/lib/communications/broadcast";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const actor = await requireCommunicationActor(request);
    return NextResponse.json(
      { topic: getCommunicationBroadcastTopic(actor.userId) },
      {
        headers: {
          "Cache-Control": "private, no-store, max-age=0",
          Pragma: "no-cache",
        },
      }
    );
  } catch (error) {
    const resolved = communicationErrorResponse(error);
    return NextResponse.json({ error: resolved.message }, { status: resolved.status });
  }
}
