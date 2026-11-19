import test from "node:test";
import assert from "node:assert/strict";
import {
  FALLBACK_ICE_SERVERS,
  hasTurnRelay,
  sanitizeCloudflareIceServers,
} from "../lib/communications/ice-servers.ts";

test("sanitizes Cloudflare STUN and TURN credentials", () => {
  const servers = sanitizeCloudflareIceServers([
    { urls: ["stun:stun.cloudflare.com:3478"] },
    {
      urls: [
        "turn:turn.cloudflare.com:3478?transport=udp",
        "turn:turn.cloudflare.com:3478?transport=tcp",
        "turns:turn.cloudflare.com:443?transport=tcp",
      ],
      username: "short-lived-user",
      credential: "short-lived-credential",
    },
  ]);

  assert.equal(hasTurnRelay(servers), true);
  assert.equal(servers.length, 2);
});

test("drops browser-blocked port 53 and non-Cloudflare ICE URLs", () => {
  const servers = sanitizeCloudflareIceServers([
    {
      urls: [
        "turn:turn.cloudflare.com:53?transport=udp",
        "turn:evil.example.com:3478?transport=udp",
        "turns:turn.cloudflare.com:443?transport=tcp",
      ],
      username: "user",
      credential: "credential",
    },
  ]);

  assert.equal(hasTurnRelay(servers), true);
  const urls = servers.flatMap((server) =>
    Array.isArray(server.urls) ? server.urls : [server.urls]
  );
  assert.equal(urls.some((url) => url.includes(":53")), false);
  assert.equal(urls.some((url) => url.includes("evil.example.com")), false);
});

test("requires username and credential for TURN entries", () => {
  const servers = sanitizeCloudflareIceServers([
    {
      urls: ["turn:turn.cloudflare.com:3478?transport=udp"],
    },
  ]);

  assert.deepEqual(servers, FALLBACK_ICE_SERVERS);
  assert.equal(hasTurnRelay(servers), false);
});

test("falls back to Cloudflare STUN for malformed responses", () => {
  assert.deepEqual(sanitizeCloudflareIceServers(null), FALLBACK_ICE_SERVERS);
  assert.deepEqual(sanitizeCloudflareIceServers({ iceServers: [] }), FALLBACK_ICE_SERVERS);
});
