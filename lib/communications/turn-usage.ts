import "server-only";

import {
  TURN_BLOCK_PERCENT,
  evaluateTurnCost,
  previousMonthlyBillingDate,
  type TurnCostEvaluation,
} from "@/lib/communications/turn-cost";

const CLOUDFLARE_API_BASE = "https://api.cloudflare.com/client/v4";
const CLOUDFLARE_GRAPHQL_ENDPOINT = "https://api.cloudflare.com/client/v4/graphql";
const REQUEST_TIMEOUT_MS = 4_000;
const CACHE_TTL_MS = 30_000;

export type TurnUsageGuard = TurnCostEvaluation & {
  allowed: boolean;
  reason:
    | "within-free-tier"
    | "free-tier-warning"
    | "free-tier-95-percent"
    | "cost-guard-unconfigured"
    | "cost-guard-unavailable";
  checkedAt: string;
  billingPeriodStart: string | null;
  billingPeriodEnd: string | null;
};

let cachedGuard: { expiresAt: number; value: TurnUsageGuard } | null = null;

function failClosed(
  reason: "cost-guard-unconfigured" | "cost-guard-unavailable"
): TurnUsageGuard {
  return {
    egressBytes: 0,
    egressGb: 0,
    usagePercent: 0,
    warning: true,
    blocked: true,
    allowed: false,
    reason,
    checkedAt: new Date().toISOString(),
    billingPeriodStart: null,
    billingPeriodEnd: null,
  };
}

function cache(value: TurnUsageGuard) {
  cachedGuard = {
    expiresAt: Date.now() + CACHE_TTL_MS,
    value,
  };
  return value;
}

function isoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

async function fetchJson(url: string, token: string, init?: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init?.headers || {}),
      },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) return null;
    return await response.json().catch(() => null);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function getCurrentBillingWindow(accountId: string, token: string) {
  const payload = await fetchJson(
    `${CLOUDFLARE_API_BASE}/accounts/${encodeURIComponent(accountId)}/billing/profile`,
    token
  ) as {
    success?: boolean;
    result?: { next_bill_date?: string | null };
  } | null;

  const rawNextBillDate = payload?.success ? payload.result?.next_bill_date : null;
  if (!rawNextBillDate) return null;

  const end = new Date(rawNextBillDate);
  const now = new Date();
  if (!Number.isFinite(end.getTime()) || end.getTime() <= now.getTime()) return null;

  const start = previousMonthlyBillingDate(end);
  if (!Number.isFinite(start.getTime()) || start.getTime() > now.getTime()) return null;

  return { start, end, now };
}

async function getTurnEgressBytes(
  accountId: string,
  token: string,
  dateFrom: string,
  dateTo: string
) {
  const query = `
    query TurnUsageGuard($accountId: string!, $dateFrom: Date!, $dateTo: Date!) {
      viewer {
        accounts(filter: { accountTag: $accountId }) {
          callsTurnUsageAdaptiveGroups(
            limit: 10000
            filter: { date_geq: $dateFrom, date_leq: $dateTo }
          ) {
            sum {
              egressBytes
            }
          }
        }
      }
    }
  `;

  const payload = await fetchJson(CLOUDFLARE_GRAPHQL_ENDPOINT, token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      variables: { accountId, dateFrom, dateTo },
    }),
  }) as {
    data?: {
      viewer?: {
        accounts?: Array<{
          callsTurnUsageAdaptiveGroups?: Array<{
            sum?: { egressBytes?: number | string | null };
          }>;
        }>;
      };
    };
    errors?: unknown[];
  } | null;

  if (!payload || (Array.isArray(payload.errors) && payload.errors.length > 0)) return null;

  const accounts = payload.data?.viewer?.accounts ?? [];
  if (!accounts.length) return null;

  let total = 0;
  for (const account of accounts) {
    for (const group of account.callsTurnUsageAdaptiveGroups ?? []) {
      const value = Number(group.sum?.egressBytes ?? 0);
      if (Number.isFinite(value) && value > 0) total += value;
    }
  }
  return total;
}

export async function getTurnUsageGuard(): Promise<TurnUsageGuard> {
  if (cachedGuard && cachedGuard.expiresAt > Date.now()) {
    return cachedGuard.value;
  }

  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const costGuardToken = process.env.CLOUDFLARE_COST_GUARD_API_TOKEN?.trim();

  if (!accountId || !/^[a-f0-9]{32}$/i.test(accountId) || !costGuardToken) {
    return cache(failClosed("cost-guard-unconfigured"));
  }

  const billing = await getCurrentBillingWindow(accountId, costGuardToken);
  if (!billing) return cache(failClosed("cost-guard-unavailable"));

  const egressBytes = await getTurnEgressBytes(
    accountId,
    costGuardToken,
    isoDate(billing.start),
    isoDate(billing.now)
  );
  if (egressBytes == null) return cache(failClosed("cost-guard-unavailable"));

  const evaluation = evaluateTurnCost(egressBytes);
  const reason = evaluation.blocked
    ? "free-tier-95-percent"
    : evaluation.warning
      ? "free-tier-warning"
      : "within-free-tier";

  return cache({
    ...evaluation,
    allowed: !evaluation.blocked,
    reason,
    checkedAt: new Date().toISOString(),
    billingPeriodStart: billing.start.toISOString(),
    billingPeriodEnd: billing.end.toISOString(),
  });
}

export { TURN_BLOCK_PERCENT };
