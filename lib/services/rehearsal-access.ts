import { isRehearsalOpen, type RehearsalWindow } from "./rehearsal-plan.ts";

export type RehearsalAction = "view" | "check-in" | "operate";
export type RehearsalAdmission = {
  actor: { userId: string; roles: readonly string[]; active: boolean; sessionLive: boolean };
  rehearsal: RehearsalWindow & { id: string };
  membership: { rehearsalId: string; userId: string; checkedInAt: number | null } | null;
  now: number;
  onChurchNetwork: boolean;
  hasFormalCheckIn: boolean;
};
export type RehearsalDenial = "account" | "role" | "membership" | "closed" | "formal-check-in" | "network" | "check-in-required" | "action";

/** Domain predicate, not an authentication or persistence layer. All facts must
 * come from trusted server lookups; check/write atomically at the DB boundary.
 * Management is a separate admin-only action, not an exemption here.
 */
export function rehearsalDenial(facts: RehearsalAdmission, action: RehearsalAction): RehearsalDenial | null {
  if (action !== "view" && action !== "check-in" && action !== "operate") return "action";
  const { actor, rehearsal, membership, now } = facts;
  if (!actor.userId || actor.active !== true || actor.sessionLive !== true) return "account";
  if (!actor.roles.includes("coordinator") && !actor.roles.includes("admin")) return "role";
  // Everyone with the current eligible role may view and check in without
  // pre-enrollment. Actual operations still require their own check-in.
  if (!rehearsal.id || (membership && (membership.userId !== actor.userId
    || membership.rehearsalId !== rehearsal.id))) return "membership";
  if (!isRehearsalOpen(rehearsal, now)) return "closed";
  if (facts.hasFormalCheckIn !== false) return "formal-check-in";
  if (action === "check-in" && facts.onChurchNetwork !== true) return "network";
  if (action === "operate" && (!membership || membership.checkedInAt === null
    || !isRehearsalOpen(rehearsal, membership.checkedInAt) || membership.checkedInAt > now)) return "check-in-required";
  return null;
}
