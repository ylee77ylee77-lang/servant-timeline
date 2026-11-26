/**
 * Fixed, bounded preview experiment. Not a persistent worship schedule.
 * All times are determined by the server, never by an untrusted device.
 */
export const PREVIEW_TASK_OFFSETS_SECONDS = [15, 30, 45] as const;
export const PREVIEW_TASK_TTL_SECONDS = 15;
export const PREVIEW_TASK_MAX_LATE_MS = 5_000;

export type PreviewTaskCue = { task: number; dueAt: number };
export type PreviewTaskResult = { task: number; state: "accepted" | "rejected" | "uncertain" | "expired"; status?: number };

export function createPreviewTaskPushPlan(acceptedAt: number): PreviewTaskCue[] {
  if (!Number.isSafeInteger(acceptedAt) || acceptedAt < 0 || acceptedAt > Number.MAX_SAFE_INTEGER - 60_000) {
    throw new Error("Invalid preview start time");
  }
  return PREVIEW_TASK_OFFSETS_SECONDS.map((seconds, index) => ({
    task: index + 1, dueAt: acceptedAt + seconds * 1000,
  }));
}

/** Each planned task is attempted at most once in this invocation. No blind retries. */
export async function runPreviewTaskPushPlan(
  plan: readonly PreviewTaskCue[],
  send: (cue: PreviewTaskCue) => Promise<{ ok: boolean; status: number }>,
  now: () => number = Date.now,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise(resolve => setTimeout(resolve, ms)),
): Promise<PreviewTaskResult[]> {
  const results: PreviewTaskResult[] = [];
  const seen = new Set<number>();
  for (const cue of plan) {
    if (seen.has(cue.dueAt)) continue;
    seen.add(cue.dueAt);
    const remaining = cue.dueAt - now();
    if (remaining > 0) await sleep(remaining);
    const observed = now();
    if (observed < cue.dueAt || observed - cue.dueAt > PREVIEW_TASK_MAX_LATE_MS) {
      results.push({ task: cue.task, state: "expired" });
      continue;
    }
    try {
      const result = await send(cue);
      results.push({ task: cue.task, state: result.ok ? "accepted" : "rejected", status: result.status });
    } catch {
      results.push({ task: cue.task, state: "uncertain" });
    }
  }
  return results;
}
