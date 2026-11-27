import { isUuid } from "./check-in.ts";
import type { ServiceType } from "./catalog.ts";

export type RehearsalParticipantAction =
  | { action: "check-in"; rehearsalId: string }
  | { action: "set-item"; rehearsalId: string; itemId: string; completed: boolean };

export type RehearsalParticipantState = {
  rehearsal: { id: string; serviceType: ServiceType; startedAt: string } | null;
  checkedInAt: string | null;
  formalCheckIn: boolean;
  nodes: Array<{
    id: string; dueAt: string; sortOrder: number;
    content: {
      title: string | null; assignee: string | null; location: string | null; details: string | null;
      voice_reminder_enabled: boolean; reminder_pre5_enabled: boolean; reminder_now_enabled: boolean;
      voice_pre5_simple: string | null; voice_pre5_standard: string | null; voice_pre5_detailed: string | null;
      voice_now_simple: string | null; voice_now_standard: string | null; voice_now_detailed: string | null;
    };
    checklist: Array<{ id: string; text: string | null; details: string | null; sortOrder: number; isCompleted: boolean; completedAt: string | null }>;
  }>;
};

function uuid(value: unknown): value is string {
  return typeof value === "string" && value.trim() === value && isUuid(value);
}

export function parseRehearsalParticipantAction(raw: unknown): RehearsalParticipantAction | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const body = raw as Record<string, unknown>;
  if (!uuid(body.rehearsalId)) return null;
  const rehearsalId = body.rehearsalId.toLowerCase();
  if (body.action === "check-in") return { action: "check-in", rehearsalId };
  if (body.action === "set-item" && uuid(body.itemId) && typeof body.completed === "boolean") {
    return { action: "set-item", rehearsalId, itemId: body.itemId.toLowerCase(), completed: body.completed };
  }
  return null;
}
