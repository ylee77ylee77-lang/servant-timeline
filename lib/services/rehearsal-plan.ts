import { isServiceType, type ServiceType } from "./catalog.ts";

export const DEFAULT_REHEARSAL_MINUTES = 20;
export const MIN_REHEARSAL_MINUTES = 15;
export const MAX_REHEARSAL_MINUTES = 60;
const MINUTE_MS = 60_000;

export type RehearsalSourceNode = {
  id: string;
  time: string;
  sort_order: number;
};

export type RehearsalBlock = {
  sourceTimeSeconds: number;
  sourceNodeIds: string[];
  dueAt: number;
};

export type RehearsalPlan = {
  serviceType: ServiceType;
  startsAt: number;
  expiresAt: number;
  blocks: RehearsalBlock[];
};

function sourceSeconds(time: string): number {
  const match = /^(\d{1,2}):([0-5]\d)(?::([0-5]\d))?$/.exec(time);
  if (!match || Number(match[1]) > 23) throw new Error("Invalid source timeline time");
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3] || 0);
}

/** Build an immutable-in-practice rehearsal clock from a server-read template.
 * Times are absolute epoch milliseconds, not a change to the live service clock.
 * Source IDs are references only: never use them as rehearsal write targets.
 */
export function buildRehearsalPlan(input: {
  serviceType: unknown;
  nodes: readonly RehearsalSourceNode[];
  startsAt: number;
  durationMinutes?: number;
}): RehearsalPlan {
  const { serviceType, nodes } = input;
  const duration = input.durationMinutes ?? DEFAULT_REHEARSAL_MINUTES;
  if (typeof serviceType !== "string" || !isServiceType(serviceType)) {
    throw new Error("Invalid rehearsal service template");
  }
  if (!Number.isSafeInteger(input.startsAt) || input.startsAt < 0
    || !Number.isInteger(duration) || duration < MIN_REHEARSAL_MINUTES || duration > MAX_REHEARSAL_MINUTES) {
    throw new Error("Invalid rehearsal window");
  }
  const startsAt = Math.ceil(input.startsAt / 1000) * 1000;
  const expiresAt = startsAt + duration * MINUTE_MS;
  if (!Number.isFinite(new Date(expiresAt).getTime())) throw new Error("Invalid rehearsal expiry");
  if (!nodes.length) throw new Error("Empty rehearsal timeline");

  const seen = new Set<string>();
  const groups = new Map<number, RehearsalSourceNode[]>();
  for (const node of nodes) {
    if (typeof node.id !== "string" || !node.id.trim() || seen.has(node.id)
      || !Number.isSafeInteger(node.sort_order) || typeof node.time !== "string") {
      throw new Error("Invalid or duplicate source timeline node");
    }
    seen.add(node.id);
    const second = sourceSeconds(node.time);
    const group = groups.get(second) ?? [];
    group.push(node);
    groups.set(second, group);
  }
  const times = [...groups.keys()].sort((a, b) => a - b);
  // Leave a minute for initial check-in and a minute for final wrap-up.
  // Distinct blocks remain distinct even when the source has uneven intervals.
  const lastSlot = duration - 1;
  if (times.length > lastSlot) throw new Error("Rehearsal duration is too short for the timeline");
  let previousSlot = 0;
  const blocks = times.map((time, index): RehearsalBlock => {
    const remaining = times.length - index - 1;
    const ideal = times.length === 1 ? Math.min(6, lastSlot)
      : 1 + Math.round((time - times[0]) / (times[times.length - 1] - times[0]) * (lastSlot - 1));
    const slot = Math.max(previousSlot + 1, Math.min(ideal, lastSlot - remaining));
    previousSlot = slot;
    const group = groups.get(time)!;
    return {
      sourceTimeSeconds: time,
      sourceNodeIds: [...group].sort((a, b) => a.sort_order - b.sort_order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).map(node => node.id),
      dueAt: startsAt + slot * MINUTE_MS,
    };
  });
  return { serviceType, startsAt, expiresAt, blocks };
}

export type RehearsalWindow = {
  startsAt: number;
  expiresAt: number;
  endedAt: number | null;
};

export function isRehearsalOpen(window: RehearsalWindow, now: number): boolean {
  return Number.isSafeInteger(now) && Number.isSafeInteger(window.startsAt)
    && Number.isSafeInteger(window.expiresAt) && window.startsAt >= 0
    && window.expiresAt > window.startsAt && window.endedAt === null
    && now >= window.startsAt && now < window.expiresAt;
}

/** Absolute due time for a reminder, bounded by the same rehearsal window.
 * A missed advance reminder is not shifted or replayed into the rehearsal.
 * The caller must enforce device settings, check-in and delivery deduplication.
 */
export function rehearsalReminderDueAt(
  window: RehearsalWindow, blockDueAt: number, leadSeconds: number,
): number | null {
  if (!Number.isInteger(leadSeconds) || leadSeconds < 0 || leadSeconds > 3645
    || !isRehearsalOpen(window, blockDueAt)) return null;
  const dueAt = blockDueAt - leadSeconds * 1000;
  return isRehearsalOpen(window, dueAt) ? dueAt : null;
}
