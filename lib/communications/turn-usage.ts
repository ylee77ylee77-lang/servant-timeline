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
  // Short non-sensitive code only, for troubleshooting without leaking API credentials.
  diagnostic: string | null;
  checkedAt: string;
  billingPeriodStart: string | null;
  billingPeriodEnd: string | null;
};

let cachedGuard: { expiresAt: number; value: TurnUsageGuard } | null = null;

function failClosed(
  reason: "cost-guard-unconfigured" | "cost-guard-unavailable",
  diagnostic: string
): TurnUsageGuard {
  // Do not log IDs, API tokens, upstream bodies, or user identifiers.
  console.warn("TURN cost guard fail-closed", { diagnostic });
  return {
    egressBytes: 0,
    egressGb: 0,
    usagePercent: 0,
    warning: true,
    blocked: true,
    allowed: false,
    reason,
    diagnostic,
    checkedAt: new Date().toISOString(),
    billingPeriodStart: null,
    billingPeriodEnd: null,
  };
}

function cache(value: TurnUsageGuard) {
  cachedGuard = { expiresAt: Date.now() + CACHE_TTL_MS, value };
  return value;
}

function isoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

type ApiResult = { payload: unknown; failure: null } | { payload: null; failure: string };

async function fetchJson(url: string, token: string, init?: RequestInit): Promise<ApiResult> {
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
    if (!response.ok) return { payload: null, failure: `http-${response.status}` };
    const payload = await response.json().catch(() => undefined);
    if (!payload || typeof payload !== "object") {
      return { payload: null, failure: "invalid-json" };
    }
    return { payload, failure: null };
  } catch (error) {
    return {
      payload: null,
      failure: error instanceof Error && error.name === "AbortError" ? "timeout" : "network-error",
    };
  } finally {
    clearTimeout(timeout);
  }
}

type BillingWindow = { start: Date; end: Date; now: Date };
type BillingResult =
  | { billing: BillingWindow; failure: null }
  | { billing: null; failure: string };

async function getCurrentBillingWindow(accountId: string, token: string): Promise<BillingResult> {
  const result = await fetchJson(
    `${CLOUDFLARE_API_BASE}/accounts/${encodeURIComponent(accountId)}/billing/profile`,
    token
  );
  if (result.failure) return { billing: null, failure: `billing-${result.failure}` };

  const payload = result.payload as {
    success?: boolean;
    result?: { next_bill_date?: string | null };
  };
  if (!payload.success || !payload.result) {
    return { billing: null, failure: "billing-response-invalid" };
  }

  // next_bill_date is optional in Cloudflare's Billing API. Free accounts may not have it.
  const raw = payload.result.next_bill_date;
  if (typeof raw !== "string" || !raw) {
    return { billing: null, failure: "billing-date-missing" };
  }

  const end = new Date(raw);
  const now = new Date();
  if (!Number.isFinite(end.getTime())) {
    return { billing: null, failure: "billing-date-invalid" };
  }
  if (end.getTime() <= now.getTime()) {
    return { billing: null, failure: "billing-date-expired" };
  }

  const start = previousMonthlyBillingDate(end);
  if (!Number.isFinite(start.getTime()) || start.getTime() > now.getTime()) {
    return { billing: null, failure: "billing-period-unverified" };
  }
  return { billing: { start, end, now }, failure: null };
}

type UsageResult =
  | { egressBytes: number; failure: null }
  | { egressBytes: null; failure: string };

async function getTurnEgressBytes(
  accountId: string,
  token: string,
  dateFrom: string,
  dateTo: string
): Promise<UsageResult> {
  const query = `
    query TurnUsageGuard($accountId: string!, $dateFrom: Date!, $dateTo: Date!) {
      viewer {
        accounts(filter: { accountTag: $accountId }) {
          callsTurnUsageAdaptiveGroups(
            limit: 10000
            filter: { date_geq: $dateFrom, date_leq: $dateTo }
          ) {
            sum { egressBytes }
          }
        }
      }
    }
  `;

  const result = await fetchJson(CLOUDFLARE_GRAPHQL_ENDPOINT, token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { accountId, dateFrom, dateTo } }),
  });
  if (result.failure) return { egressBytes: null, failure: `analytics-${result.failure}` };

  const payload = result.payload as {
    data?: {
      viewer?: {
        accounts?: Array<{
          callsTurnUsageAdaptiveGroups?: Array<{ sum?: { egressBytes?: number | string | null } }>;
        }>;
      };
    };
    errors?: unknown[] | null;
  };

  if (Array.isArray(payload.errors) && payload.errors.length) {
    return { egressBytes: null, failure: "analytics-query-rejected" };
  }
  const accounts = payload.data?.viewer?.accounts;
  if (!Array.isArray(accounts) || accounts.length !== 1) {
    return { egressBytes: null, failure: "analytics-account-missing" };
  }
  const groups = accounts[0].callsTurnUsageAdaptiveGroups;
  if (!Array.isArray(groups)) {
    return { egressBytes: null, failure: "analytics-response-invalid" };
  }
  // Never treat a potentially truncated series as the complete billed usage.
  if (groups.length >= 10000) {
    return { egressBytes: null, failure: "analytics-result-truncated" };
  }

  let total = 0;
  for (const group of groups) {
    if (group.sum?.egressBytes === null || group.sum?.egressBytes === undefined) {
      return { egressBytes: null, failure: "analytics-egress-missing" };
    }
    const count = Number(group.sum.egressBytes);
    if (!Number.isFinite(count) || count < 0) {
      return { egressBytes: null, failure: "analytics-egress-invalid" };
    }
    total += count;
  }
  if (!Number.isFinite(total)) {
    return { egressBytes: null, failure: "analytics-egress-invalid" };
  }
  return { egressBytes: total, failure: null };
}

export async function getTurnUsageGuard(): Promise<TurnUsageGuard> {
  if (cachedGuard && cachedGuard.expiresAt > Date.now()) {
    return cachedGuard.value;
  }

  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const token = process.env.CLOUDFLARE_COST_GUARD_API_TOKEN?.trim();
  if (!accountId || !token) {
    return cache(failClosed("cost-guard-unconfigured", "missing-configuration"));
  }
  if (!/^[a-f0-9]{32}$/i.test(accountId)) {
    return cache(failClosed("cost-guard-unconfigured", "invalid-account-id-format"));
  }

  const cycle = await getCurrentBillingWindow(accountId, token);
  if (!cycle.billing) {
    return cache(failClosed("cost-guard-unavailable", cycle.failure));
  }
  const usage = await getTurnEgressBytes(
    accountId,
    token,
    isoDate(cycle.billing.start),
    isoDate(cycle.billing.now)
  );
  if (usage.egressBytes === null) {
    return cache(failClosed("cost-guard-unavailable", usage.failure));
  }

  const evaluation = evaluateTurnCost(usage.egressBytes);
  return cache({
    ...evaluation,
    allowed: !evaluation.blocked,
    reason: evaluation.blocked
      ? "free-tier-95-percent"
      : evaluation.warning ? "free-tier-warning" : "within-free-tier",
    diagnostic: null,
    checkedAt: new Date().toISOString(),
    billingPeriodStart: cycle.billing.start.toISOString(),
    billingPeriodEnd: cycle.billing.end.toISOString(),
  });
}

export { TURN_BLOCK_PERCENT };
