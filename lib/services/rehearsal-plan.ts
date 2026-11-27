import { isServiceType, type ServiceType } from "./catalog.ts";

const MINUTE_MS = 60_000;
// Task pacing only; neither value limits the administrator-controlled session.
const FIRST_BLOCK_OFFSET_MINUTES = 6;
const BLOCK_INTERVAL_MINUTES = 2;

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
  blocks: RehearsalBlock[];
};

function validTimestamp(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0 && Number.isFinite(new Date(value).getTime());
}

function sourceSeconds(time: string): number {
  const match = /^(\d{1,2}):([0-5]\d)(?::([0-5]\d))?$/.exec(time);
  if (!match || Number(match[1]) > 23) throw new Error("Invalid source timeline time");
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3] || 0);
}

/** Build a snapshot of task times from the server-recorded start event.
 * The final task is not a session deadline. Only an authorized end event
 * closes the session. Source IDs are references, never rehearsal write targets.
 */
export function buildRehearsalPlan(input: {
  serviceType: unknown;
  nodes: readonly RehearsalSourceNode[];
  startsAt: number;
}): RehearsalPlan {
  const { serviceType, nodes, startsAt } = input;
  if (typeof serviceType !== "string" || !isServiceType(serviceType)) {
    throw new Error("Invalid rehearsal service template");
  }
  if (!validTimestamp(startsAt)) throw new Error("Invalid rehearsal start");
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
  // Minute-aligned task timestamps support the existing HH:mm timeline display.
  // The first block leaves room to test the default five-minute advance reminder.
  const anchor = Math.ceil(startsAt / MINUTE_MS) * MINUTE_MS;
  const blocks = [...groups.keys()].sort((a, b) => a - b).map((time, index): RehearsalBlock => {
    const dueAt = anchor + (FIRST_BLOCK_OFFSET_MINUTES + index * BLOCK_INTERVAL_MINUTES) * MINUTE_MS;
    if (!validTimestamp(dueAt)) throw new Error("Invalid rehearsal task time");
    const group = groups.get(time)!;
    return {
      sourceTimeSeconds: time,
      sourceNodeIds: [...group].sort((a, b) => a.sort_order - b.sort_order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).map(node => node.id),
      dueAt,
    };
  });
  return { serviceType, startsAt, blocks };
}

export type RehearsalWindow = {
  startsAt: number;
  endedAt: number | null;
};

export function isRehearsalOpen(window: RehearsalWindow, now: number): boolean {
  return validTimestamp(now) && validTimestamp(window.startsAt)
    && window.endedAt === null && now >= window.startsAt;
}

/** Calculate an absolute reminder time for a server-snapshot block.
 * No early or ended-session reminder; the dispatcher must also recheck live
 * admission, the current time/delivery window, and deduplication before sending.
 */
export function rehearsalReminderDueAt(
  window: RehearsalWindow, blockDueAt: number, leadSeconds: number,
): number | null {
  if (!Number.isInteger(leadSeconds) || leadSeconds < 0 || leadSeconds > 3645
    || !isRehearsalOpen(window, blockDueAt)) return null;
  const dueAt = blockDueAt - leadSeconds * 1000;
  return isRehearsalOpen(window, dueAt) ? dueAt : null;
}
