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
import { recentWindowStart } from "../../src/dashboard.js";

// docs/lab-04/tests.md §2.2 — UNIT-04..07 (UNIT-06, the Asia/Bangkok window start, added in Issue 4-5).
// The §5.2 matrix comes from ./specMatrix.ts, an independent hand transcription of the spec.
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

describe("UNIT-06: the dashboards' recent window, in Asia/Bangkok (BR-29)", () => {
  // Bangkok is UTC+7 all year, so local midnight is 17:00 UTC the day before.
  it.each([
    // [now (UTC), expected windowStart (UTC)]
    ["2026-10-05T05:00:00.000Z", "2026-09-28T17:00:00.000Z"], // api-spec.md §5's own example
    ["2026-10-05T16:59:59.999Z", "2026-09-28T17:00:00.000Z"], // 23:59:59 Bangkok, still Oct 5
    ["2026-10-05T17:00:00.000Z", "2026-09-29T17:00:00.000Z"], // 00:00 Bangkok, now Oct 6
    ["2026-03-03T01:00:00.000Z", "2026-02-24T17:00:00.000Z"], // window crosses a month boundary
    ["2027-01-02T12:00:00.000Z", "2026-12-26T17:00:00.000Z"], // and a year boundary
  ])("now %s -> window starts %s", (now, expected) => {
    expect(recentWindowStart(new Date(now)).toISOString()).toBe(expected);
  });

  it("always spans exactly seven Bangkok calendar days including today", () => {
    const now = new Date("2026-10-05T05:00:00.000Z");
    const start = recentWindowStart(now);
    const days = (now.getTime() - start.getTime()) / (24 * 60 * 60 * 1000);
    expect(days).toBeGreaterThan(6);
    expect(days).toBeLessThanOrEqual(7);
  });
});
