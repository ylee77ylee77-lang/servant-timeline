/**
 * Best-effort return-to-timeline cue selection. This never changes the
 * scheduled reminder state or the currently configured speech detail level.
 */
export const RETURN_CUE_LAST_TASK_GRACE_MINUTES = 30;
export const RETURN_CUE_REMINDER_GUARD_SECONDS = 60;

export type ReturnCueTask = {
  id?: string;
  time?: string;
  title?: string;
};

function parseTaskMinute(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

/** Only a real return from a hidden app can arm a task cue; elapsed time is irrelevant. */
export function shouldQueueReturnCue(wasAppBackgrounded: boolean, visibilityState: string): boolean {
  return wasAppBackgrounded && visibilityState === "visible";
}

export type SelectedReturnCue<T> = { task: T; kind: "current" | "next" };

export function selectReturnCueTask<T extends ReturnCueTask>(
  tasks: readonly T[],
  now: Date
): SelectedReturnCue<T> | null {
  const nowMinutes = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  const valid = tasks
    .map((task, index) => ({ task, index, minute: parseTaskMinute(task.time) }))
    .filter((entry): entry is { task: T; index: number; minute: number } => entry.minute !== null)
    .sort((a, b) => a.minute - b.minute || a.index - b.index);
  if (valid.length === 0) return null;

  const firstUpcomingIndex = valid.findIndex(entry => entry.minute > nowMinutes);
  if (firstUpcomingIndex === 0) return { task: valid[0].task, kind: "next" };
  if (firstUpcomingIndex > 0) {
    return { task: valid[firstUpcomingIndex - 1].task, kind: "current" };
  }

  const last = valid[valid.length - 1];
  if (nowMinutes - last.minute <= RETURN_CUE_LAST_TASK_GRACE_MINUTES) {
    return { task: last.task, kind: "current" };
  }
  return null;
}

export function isNearFormalVoiceReminder(
  tasks: readonly ReturnCueTask[],
  now: Date,
  advanceSeconds: number,
  advanceEnabled: boolean,
  onTimeEnabled: boolean
): boolean {
  if (!advanceEnabled && !onTimeEnabled) return false;
  const nowSeconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  const daySeconds = 24 * 3600;
  for (const task of tasks) {
    const minute = parseTaskMinute(task.time);
    if (minute === null) continue;
    const startsAt = minute * 60;
    const times = [];
    if (onTimeEnabled) times.push(startsAt);
    if (advanceEnabled && (advanceSeconds > 0 || !onTimeEnabled)) {
      times.push(startsAt - advanceSeconds);
    }
    for (const dueTime of times) {
      const due = (dueTime + daySeconds) % daySeconds;
      const signedSecondsUntil = ((due - nowSeconds + daySeconds / 2 + daySeconds) % daySeconds) - daySeconds / 2;
      if (signedSecondsUntil >= -15 && signedSecondsUntil <= RETURN_CUE_REMINDER_GUARD_SECONDS) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Mobile browsers may require another user gesture after a background audio
 * interruption. Only those playback rejections get one deferred retry.
 * An HTTP/TTS failure must not become a repeated automatic announcement.
 */
export function canRetryReturnCueAfterGesture(
  errorName: string | undefined,
  retryCount: number,
  visibilityState: string
): boolean {
  return visibilityState === "visible"
    && retryCount === 0
    && (errorName === "NotAllowedError" || errorName === "AbortError");
}
