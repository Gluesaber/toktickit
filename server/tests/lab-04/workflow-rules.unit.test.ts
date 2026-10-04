import { describe, it, expect } from "vitest";
import type { TicketStatus } from "@prisma/client";
import { ALL_ROLES, ALL_STATUSES, LAB4_MATRIX } from "./specMatrix.js";
import {
  canTransition,
  clearsRequesterIndication,
  meetsResolutionGate,
  needsResolutionGate,
  type TransitionRole,
} from "../../src/statusTransitions.js";

// docs/lab-04/tests.md §2.2 — UNIT-04, UNIT-05, UNIT-07. (UNIT-06, the Asia/Bangkok window start, is a
// dashboard rule and lands with Issue 4-5.) The §5.2 matrix comes from ./specMatrix.ts, an independent
// hand transcription of the spec.
const isListed = (from: TicketStatus, to: TicketStatus, role: TransitionRole) =>
  LAB4_MATRIX.some((r) => r.from === from && r.to === to && r.roles.includes(role));

describe("UNIT-04: final Ticket transition matrix (BR-16, §5.2)", () => {
  it("allows every listed (from, to, role) triple, including the two new Reopened rows", () => {
    for (const rule of LAB4_MATRIX) {
      for (const role of rule.roles) expect(canTransition(rule.from, rule.to, role)).toBe(true);
    }
  });

  it("denies every triple that isn't listed", () => {
    for (const from of ALL_STATUSES) {
      for (const to of ALL_STATUSES) {
        for (const role of ALL_ROLES) expect(canTransition(from, to, role)).toBe(isListed(from, to, role));
      }
    }
  });

  it("never leaves Cancelled, the only terminal status", () => {
    for (const to of ALL_STATUSES) for (const role of ALL_ROLES) expect(canTransition("CANCELLED", to, role)).toBe(false);
  });

  it("gives a Requester no power except Cancel from New or Open (BR-19)", () => {
    const requesterMoves = ALL_STATUSES.flatMap((from) =>
      ALL_STATUSES.filter((to) => canTransition(from, to, "REQUESTER")).map((to) => `${from}->${to}`)
    );
    expect(requesterMoves.sort()).toEqual(["NEW->CANCELLED", "OPEN->CANCELLED"]);
  });
});

describe("UNIT-05: resolution gate predicate (BR-17)", () => {
  it("applies only to transitions into Resolved", () => {
    for (const to of ALL_STATUSES) expect(needsResolutionGate(to)).toBe(to === "RESOLVED");
  });

  it("is met only with at least one Completed Action", () => {
    expect(meetsResolutionGate([])).toBe(false);
    expect(meetsResolutionGate([{ status: "PLANNED" }, { status: "IN_PROGRESS" }, { status: "CANCELLED" }])).toBe(false);
    expect(meetsResolutionGate([{ status: "CANCELLED" }, { status: "COMPLETED" }])).toBe(true);
  });
});

describe("UNIT-07: Requester indication clearing rule (BR-18)", () => {
  it("clears only when the Ticket moves into In Progress or Reopened", () => {
    for (const to of ALL_STATUSES) {
      expect(clearsRequesterIndication(to)).toBe(to === "IN_PROGRESS" || to === "REOPENED");
    }
  });
});
