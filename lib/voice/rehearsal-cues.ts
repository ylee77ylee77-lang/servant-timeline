import type { RehearsalParticipantState } from "../services/rehearsal-participant-contract.ts";
import { RETURN_CUE_LAST_TASK_GRACE_MINUTES, RETURN_CUE_REMINDER_GUARD_SECONDS } from "./return-cue.ts";

export type RehearsalVoiceNode = RehearsalParticipantState["nodes"][number];
type Preference = { leadSeconds: number; advance: boolean; onTime: boolean };
type Cue = { node: RehearsalVoiceNode; kind: "pre5" | "now"; at: number; key: string };

export function rehearsalVoiceCues(state: RehearsalParticipantState, settings: Preference): Cue[] {
  if (!state.rehearsal || !state.checkedInAt || state.formalCheckIn
    || !Number.isInteger(settings.leadSeconds) || settings.leadSeconds < 0 || settings.leadSeconds > 3645) return [];
  const start = Math.max(Date.parse(state.rehearsal.startedAt), Date.parse(state.checkedInAt));
  if (!Number.isFinite(start)) return [];
  const cues: Cue[] = [];
  for (const node of state.nodes) {
    const due = Date.parse(node.dueAt);
    if (!Number.isFinite(due) || node.content.voice_reminder_enabled === false) continue;
    const onTime = settings.onTime && node.content.reminder_now_enabled !== false;
    const advance = settings.advance && node.content.reminder_pre5_enabled !== false;
    const add = (kind: Cue["kind"], at: number) => {
      if (at >= start) cues.push({ node, kind, at, key: [state.rehearsal!.id, node.id, kind, at].join(":") });
    };
    if (advance && (settings.leadSeconds > 0 || !onTime)) add("pre5", due - settings.leadSeconds * 1000);
    if (onTime) add("now", due);
  }
  return cues.sort((a, b) => a.at - b.at || a.node.sortOrder - b.node.sortOrder);
}

export function dueRehearsalCues(cues: readonly Cue[], now: number, seen: ReadonlySet<string>): Cue[] {
  return cues.filter(cue => Number.isFinite(now) && now >= cue.at && now < cue.at + 15_000 && !seen.has(cue.key));
}

export function nearRehearsalCue(cues: readonly Cue[], now: number) {
  return cues.some(cue => cue.at - now >= -15_000 && cue.at - now <= RETURN_CUE_REMINDER_GUARD_SECONDS * 1000);
}

export function selectRehearsalTask(nodes: readonly RehearsalVoiceNode[], now: number): { node: RehearsalVoiceNode; kind: "current" | "next" } | null {
  if (!Number.isFinite(now)) return null;
  const sorted = nodes.filter(node => Number.isFinite(Date.parse(node.dueAt)) && node.content.voice_reminder_enabled !== false)
    .slice().sort((a,b) => Date.parse(a.dueAt) - Date.parse(b.dueAt) || a.sortOrder - b.sortOrder);
  const next = sorted.findIndex(node => Date.parse(node.dueAt) > now);
  if (next === 0) return { node: sorted[0], kind: "next" };
  if (next > 0) return { node: sorted[next-1], kind: "current" };
  const last = sorted.at(-1);
  return last && now - Date.parse(last.dueAt) <= RETURN_CUE_LAST_TASK_GRACE_MINUTES * 60_000 ? { node: last, kind: "current" } : null;
}

// Adapt the snapshot to the existing speech formatter. Do not reuse formal
// node IDs, mutate the snapshot, or invent another reminder text format.
export function rehearsalSpeechNode(node: RehearsalVoiceNode) {
  return {
    ...node.content, id: node.id,
    time: new Intl.DateTimeFormat("en-GB", { timeZone:"Asia/Taipei", hour:"2-digit", minute:"2-digit", hourCycle:"h23" }).format(new Date(node.dueAt)),
    checklist: node.checklist.map(item => ({ id:item.id, text:item.text, details:item.details, is_completed:item.isCompleted })),
  };
}


/** Vibration is one cue per time block, not one per spoken task. It is
 * independent of the user's voice advance/now settings. */
export function dueRehearsalVibrationBlocks(state: RehearsalParticipantState, now: number, seen: ReadonlySet<string>) {
  if (!state.rehearsal || !state.checkedInAt || state.formalCheckIn || !Number.isFinite(now)) return [];
  const start = Math.max(Date.parse(state.rehearsal.startedAt), Date.parse(state.checkedInAt));
  if (!Number.isFinite(start)) return [];
  const blocks = new Map<string, { key: string; node: RehearsalVoiceNode }>();
  for (const node of state.nodes) {
    const at = Date.parse(node.dueAt);
    const key = state.rehearsal.id + ":" + at;
    if (!Number.isFinite(at) || at < start || now < at || now >= at + 15_000 || seen.has(key) || blocks.has(key)) continue;
    blocks.set(key, { key, node });
  }
  return [...blocks.values()];
}
