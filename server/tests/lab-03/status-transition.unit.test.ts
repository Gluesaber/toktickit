import { describe, it, expect } from "vitest";
import type { TicketStatus } from "@prisma/client";
import { canTransition, permittedTransitions, type TransitionRole } from "../../src/statusTransitions.js";

// docs/lab-03/tests.md UNIT-03/UNIT-04. specification.md §5.2 is the source of truth this table is
// checked against, transcribed here as an explicit list rather than re-deriving it from the module
// under test, so a bug that drops or misassigns a row in statusTransitions.ts is actually caught.
const ALL_STATUSES: TicketStatus[] = [
  "NEW",
  "OPEN",
  "IN_PROGRESS",
  "WAITING_FOR_REQUESTER",
  "RESOLVED",
  "CLOSED",
  "CANCELLED",
  "REOPENED",
];
const ALL_ROLES: TransitionRole[] = ["REQUESTER", "IT_STAFF", "ADMINISTRATOR"];
const STAFF: TransitionRole[] = ["IT_STAFF", "ADMINISTRATOR"];
const REQUESTER_OR_STAFF: TransitionRole[] = ["REQUESTER", "IT_STAFF", "ADMINISTRATOR"];

const SPEC_MATRIX: { from: TicketStatus; to: TicketStatus; roles: TransitionRole[] }[] = [
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
];

function isListed(from: TicketStatus, to: TicketStatus, role: TransitionRole): boolean {
  return SPEC_MATRIX.some((r) => r.from === from && r.to === to && r.roles.includes(role));
}

describe("canTransition (UNIT-03/UNIT-04, §5.2)", () => {
  it("UNIT-03: every listed (from, to, role) triple is allowed", () => {
    for (const rule of SPEC_MATRIX) {
      for (const role of rule.roles) {
        expect(canTransition(rule.from, rule.to, role)).toBe(true);
      }
    }
  });

  it("UNIT-04: every (from, to, role) triple not in the matrix is not allowed", () => {
    for (const from of ALL_STATUSES) {
      for (const to of ALL_STATUSES) {
        for (const role of ALL_ROLES) {
          expect(canTransition(from, to, role)).toBe(isListed(from, to, role));
        }
      }
    }
  });

  it("UNIT-04: no transition ever leads out of Cancelled (terminal)", () => {
    for (const to of ALL_STATUSES) {
      for (const role of ALL_ROLES) {
        expect(canTransition("CANCELLED", to, role)).toBe(false);
      }
    }
  });

  it("UNIT-04: Closed -> Reopened is a listed, allowed pair, not a not-allowed case", () => {
    expect(canTransition("CLOSED", "REOPENED", "IT_STAFF")).toBe(true);
    expect(canTransition("CLOSED", "REOPENED", "ADMINISTRATOR")).toBe(true);
  });

  it("a Requester is never permitted a staff-only transition", () => {
    expect(canTransition("OPEN", "IN_PROGRESS", "REQUESTER")).toBe(false);
    expect(canTransition("IN_PROGRESS", "RESOLVED", "REQUESTER")).toBe(false);
  });
});

describe("permittedTransitions", () => {
  it("returns exactly the matrix's targets for a given status/role", () => {
    expect(permittedTransitions("OPEN", "IT_STAFF").sort()).toEqual(
      ["CANCELLED", "IN_PROGRESS", "RESOLVED"].sort()
    );
    expect(permittedTransitions("NEW", "REQUESTER")).toEqual(["CANCELLED"]);
  });

  it("returns an empty list from Cancelled for every role", () => {
    for (const role of ALL_ROLES) {
      expect(permittedTransitions("CANCELLED", role)).toEqual([]);
    }
  });
});
