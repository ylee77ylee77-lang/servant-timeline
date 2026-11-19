import { NextRequest, NextResponse } from "next/server";
import { communicationErrorResponse, requireCommunicationActor } from "@/lib/communications/access";
import {
  FALLBACK_ICE_SERVERS,
  hasTurnRelay,
  sanitizeCloudflareIceServers,
} from "@/lib/communications/ice-servers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TURN_CREDENTIAL_TTL_SECONDS = 4 * 60 * 60;
const CLOUDFLARE_TIMEOUT_MS = 4_000;

function response(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Pragma": "no-cache",
    },
  });
}

export async function GET(request: NextRequest) {
  try {
    await requireCommunicationActor(request);

    const keyId = process.env.CLOUDFLARE_TURN_KEY_ID?.trim();
    const apiToken = process.env.CLOUDFLARE_TURN_KEY_API_TOKEN?.trim();

    if (!keyId || !apiToken) {
      return response({
        iceServers: FALLBACK_ICE_SERVERS,
        relayAvailable: false,
        source: "stun-fallback",
      });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CLOUDFLARE_TIMEOUT_MS);

    try {
      const upstream = await fetch(
        `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ttl: TURN_CREDENTIAL_TTL_SECONDS }),
          cache: "no-store",
          signal: controller.signal,
        }
      );

      if (!upstream.ok) {
        console.warn("Cloudflare TURN credential request failed", {
          status: upstream.status,
        });
        return response({
          iceServers: FALLBACK_ICE_SERVERS,
          relayAvailable: false,
          source: "stun-fallback",
        });
      }

      const payload = await upstream.json().catch(() => null);
      const iceServers = sanitizeCloudflareIceServers(
        payload && typeof payload === "object"
          ? (payload as { iceServers?: unknown }).iceServers
          : null
      );

      if (!hasTurnRelay(iceServers)) {
        console.warn("Cloudflare TURN response did not contain a usable relay.");
        return response({
          iceServers: FALLBACK_ICE_SERVERS,
          relayAvailable: false,
          source: "stun-fallback",
        });
      }

      return response({
        iceServers,
        relayAvailable: true,
        source: "cloudflare-turn",
        expiresInSeconds: TURN_CREDENTIAL_TTL_SECONDS,
      });
    } catch (error) {
      console.warn("Cloudflare TURN credential request unavailable", {
        reason: error instanceof Error ? error.name : "unknown",
      });
      return response({
        iceServers: FALLBACK_ICE_SERVERS,
        relayAvailable: false,
        source: "stun-fallback",
      });
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    const resolved = communicationErrorResponse(error);
    return response({ error: resolved.message }, resolved.status);
  }
}
