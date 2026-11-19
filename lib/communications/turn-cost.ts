export const TURN_FREE_TIER_GB = 1000;
export const TURN_WARNING_PERCENT = 90;
export const TURN_BLOCK_PERCENT = 95;
export const TURN_FREE_TIER_BYTES = TURN_FREE_TIER_GB * 1_000_000_000;
export const TURN_BLOCK_BYTES = TURN_FREE_TIER_BYTES * (TURN_BLOCK_PERCENT / 100);

export type TurnCostEvaluation = {
  egressBytes: number;
  egressGb: number;
  usagePercent: number;
  warning: boolean;
  blocked: boolean;
};

export function evaluateTurnCost(egressBytes: number): TurnCostEvaluation {
  const safeBytes = Number.isFinite(egressBytes) && egressBytes > 0 ? egressBytes : 0;
  const egressGb = safeBytes / 1_000_000_000;
  const usagePercent = (safeBytes / TURN_FREE_TIER_BYTES) * 100;

  return {
    egressBytes: safeBytes,
    egressGb,
    usagePercent,
    warning: usagePercent >= TURN_WARNING_PERCENT,
    blocked: usagePercent >= TURN_BLOCK_PERCENT,
  };
}

function daysInUtcMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

export function previousMonthlyBillingDate(nextBillDate: Date) {
  const year = nextBillDate.getUTCFullYear();
  const month = nextBillDate.getUTCMonth();
  const day = nextBillDate.getUTCDate();
  const previousMonthDate = new Date(Date.UTC(
    year,
    month - 1,
    Math.min(day, daysInUtcMonth(year, month - 1)),
    nextBillDate.getUTCHours(),
    nextBillDate.getUTCMinutes(),
    nextBillDate.getUTCSeconds(),
    nextBillDate.getUTCMilliseconds()
  ));
  return previousMonthDate;
}
