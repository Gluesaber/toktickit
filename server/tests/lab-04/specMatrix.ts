import type { TicketStatus } from "@prisma/client";
import type { TransitionRole } from "../../src/statusTransitions.js";

// docs/lab-04/specification.md §5.2, transcribed by hand — deliberately NOT imported from
// src/statusTransitions.ts, so a wrong row in the source can't be "confirmed" by a test that reads
// the same table back. Shared by workflow-rules.unit.test.ts (UNIT-04) and
// ticket-workflow.api.test.ts (API-23/24). Not a *.test.ts file, so Vitest never runs it on its own.
export const ALL_STATUSES: TicketStatus[] = [
  "NEW",
  "OPEN",
  "IN_PROGRESS",
  "WAITING_FOR_REQUESTER",
  "RESOLVED",
  "CLOSED",
  "CANCELLED",
  "REOPENED",
];
export const ALL_ROLES: TransitionRole[] = ["REQUESTER", "IT_STAFF", "ADMINISTRATOR"];
export const STAFF: TransitionRole[] = ["IT_STAFF", "ADMINISTRATOR"];
export const ANYONE: TransitionRole[] = ["REQUESTER", "IT_STAFF", "ADMINISTRATOR"];

export const LAB4_MATRIX: { from: TicketStatus; to: TicketStatus; roles: TransitionRole[] }[] = [
  { from: "NEW", to: "OPEN", roles: STAFF },
  { from: "NEW", to: "CANCELLED", roles: ANYONE },
  { from: "OPEN", to: "CANCELLED", roles: ANYONE },
  { from: "OPEN", to: "IN_PROGRESS", roles: STAFF },
  { from: "IN_PROGRESS", to: "CANCELLED", roles: STAFF },
  { from: "WAITING_FOR_REQUESTER", to: "CANCELLED", roles: STAFF },
  { from: "IN_PROGRESS", to: "WAITING_FOR_REQUESTER", roles: STAFF },
  { from: "WAITING_FOR_REQUESTER", to: "IN_PROGRESS", roles: STAFF },
  { from: "OPEN", to: "RESOLVED", roles: STAFF },
  { from: "IN_PROGRESS", to: "RESOLVED", roles: STAFF },
  { from: "WAITING_FOR_REQUESTER", to: "RESOLVED", roles: STAFF },
  { from: "RESOLVED", to: "CLOSED", roles: STAFF },
  { from: "RESOLVED", to: "REOPENED", roles: STAFF },
  { from: "CLOSED", to: "REOPENED", roles: STAFF },
  { from: "REOPENED", to: "IN_PROGRESS", roles: STAFF },
  { from: "REOPENED", to: "RESOLVED", roles: STAFF }, // new in Lab 4
  { from: "REOPENED", to: "CANCELLED", roles: STAFF }, // new in Lab 4
];

