import type { TicketStatus } from "@prisma/client";

// Issue 3-5 (Lab 3) — the Current Status transition matrix, specification.md §5.2/BR-23/BR-24.
// A pure function/table so the rule is checked once in isolation (status-transition.unit.test.ts,
// UNIT-03/04) and then reused, not re-implemented, by PATCH /api/tickets/:id/status — a request for
// any (from, to, role) triple not listed here is rejected 409 TRANSITION_NOT_PERMITTED regardless of
// caller role.
//
// Cancelled is terminal (no row has `from: "CANCELLED"`). Closed is not: Closed -> Reopened is a
// listed, allowed pair.
export type TransitionRole = "REQUESTER" | "IT_STAFF" | "ADMINISTRATOR";

const STAFF: TransitionRole[] = ["IT_STAFF", "ADMINISTRATOR"];
const REQUESTER_OR_STAFF: TransitionRole[] = ["REQUESTER", "IT_STAFF", "ADMINISTRATOR"];

interface TransitionRule {
  from: TicketStatus;
  to: TicketStatus;
  roles: TransitionRole[];
}

// BR-24: a Requester's only power here is Cancel, and only from New/Open — reflected by REQUESTER
// only ever appearing on those two rows. Ownership ("own ticket") is enforced by the caller (the
// same requesterId-scoped query pattern every other Requester route already uses), not by this
// table, which only knows about status/role.
const TRANSITIONS: TransitionRule[] = [
  { from: "NEW", to: "OPEN", roles: STAFF },
  { from: "NEW", to: "CANCELLED", roles: REQUESTER_OR_STAFF },
  { from: "OPEN", to: "CANCELLED", roles: REQUESTER_OR_STAFF },
  { from: "OPEN", to: "IN_PROGRESS", roles: STAFF },
  { from: "OPEN", to: "RESOLVED", roles: STAFF },
  { from: "IN_PROGRESS", to: "CANCELLED", roles: STAFF },
  { from: "IN_PROGRESS", to: "WAITING_FOR_REQUESTER", roles: STAFF },
  { from: "IN_PROGRESS", to: "RESOLVED", roles: STAFF },
  { from: "WAITING_FOR_REQUESTER", to: "CANCELLED", roles: STAFF },
  { from: "WAITING_FOR_REQUESTER", to: "IN_PROGRESS", roles: STAFF },
  { from: "WAITING_FOR_REQUESTER", to: "RESOLVED", roles: STAFF },
  { from: "RESOLVED", to: "CLOSED", roles: STAFF },
  { from: "RESOLVED", to: "REOPENED", roles: STAFF },
  { from: "CLOSED", to: "REOPENED", roles: STAFF },
  { from: "REOPENED", to: "IN_PROGRESS", roles: STAFF },
  // Issue 4-3 (Lab 4) — docs/lab-04/specification.md §5.2's two new rows. Without the first, a
  // Reopened ticket whose fix is quick has to detour through In Progress; without the second, a
  // Reopened ticket could never be withdrawn at all.
  { from: "REOPENED", to: "RESOLVED", roles: STAFF },
  { from: "REOPENED", to: "CANCELLED", roles: STAFF },
];

export function canTransition(from: TicketStatus, to: TicketStatus, role: TransitionRole): boolean {
  return TRANSITIONS.some((t) => t.from === from && t.to === to && t.roles.includes(role));
}

// Used by the Staff Ticket Detail UI (ui-spec.md §7.3, UI-19) to offer only the transitions actually
// permitted from a ticket's current status, so it can never present an option the API would 409 on.
export function permittedTransitions(from: TicketStatus, role: TransitionRole): TicketStatus[] {
  return TRANSITIONS.filter((t) => t.from === from && t.roles.includes(role)).map((t) => t.to);
}

// Issue 4-3 (Lab 4) — the two workflow rules that ride along with a status change. Kept here as
// pure functions next to the matrix so workflow-rules.unit.test.ts checks them in isolation
// (UNIT-05, UNIT-07) and the status route only calls them.

// BR-17: every transition into Resolved — from any source status — needs at least one Completed
// Action on the Ticket. Planned, In Progress or Cancelled Actions don't count: they aren't evidence
// that work was done.
export function needsResolutionGate(to: TicketStatus): boolean {
  return to === "RESOLVED";
}

export function meetsResolutionGate(actions: { status: string }[]): boolean {
  return actions.some((a) => a.status === "COMPLETED");
}

// BR-18: the Requester's "Problem Appears Resolved" indication is cleared when staff start working
// on the Ticket again, so a stale "Requester says resolved" can't follow a Ticket through a reopen.
export function clearsRequesterIndication(to: TicketStatus): boolean {
  return to === "IN_PROGRESS" || to === "REOPENED";
}
