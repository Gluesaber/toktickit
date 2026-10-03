import { describe, it, expect } from "vitest";
import type { ActionStatus } from "@prisma/client";
import {
  ACTION_STATUSES,
  canCreateActionWithStatus,
  canMoveAction,
  isActionLocked,
  mergeActionDraft,
  parseActionInput,
  validateActionDraft,
  type ActionDraft,
} from "../../src/actionRules.js";

// docs/lab-04/tests.md §2.1 — UNIT-01..03. The §5.3 matrix below is transcribed independently from
// docs/lab-04/specification.md rather than imported from src/actionRules.ts, so a typo in the source
// table can't be "confirmed" by a test that reads the same table back.
const SPEC_MOVES: [ActionStatus, ActionStatus][] = [
  ["PLANNED", "IN_PROGRESS"],
  ["PLANNED", "COMPLETED"],
  ["PLANNED", "CANCELLED"],
  ["IN_PROGRESS", "COMPLETED"],
  ["IN_PROGRESS", "CANCELLED"],
];

const isSpecMove = (from: ActionStatus, to: ActionStatus) =>
  SPEC_MOVES.some(([f, t]) => f === from && t === to);

describe("UNIT-01: Action status matrix — permitted moves (BR-10, §5.3)", () => {
  it.each(SPEC_MOVES)("%s -> %s is allowed", (from, to) => {
    expect(canMoveAction(from, to)).toBe(true);
  });

  it.each(["PLANNED", "IN_PROGRESS", "COMPLETED"] as ActionStatus[])("a new Action may start as %s", (s) => {
    expect(canCreateActionWithStatus(s)).toBe(true);
  });

  it("re-sending the stored status unchanged is not a move", () => {
    expect(canMoveAction("PLANNED", "PLANNED")).toBe(true);
    expect(canMoveAction("IN_PROGRESS", "IN_PROGRESS")).toBe(true);
  });
});

describe("UNIT-02: Action status matrix — everything else is refused (BR-10, §5.3)", () => {
  const notListed = ACTION_STATUSES.flatMap((from) =>
    ACTION_STATUSES.filter((to) => to !== from && !isSpecMove(from, to)).map((to) => [from, to] as const)
  );

  it.each(notListed)("%s -> %s is not allowed", (from, to) => {
    expect(canMoveAction(from, to)).toBe(false);
  });

  it("Completed and Cancelled are final and locked; Planned and In Progress are not", () => {
    expect(isActionLocked("COMPLETED")).toBe(true);
    expect(isActionLocked("CANCELLED")).toBe(true);
    expect(isActionLocked("PLANNED")).toBe(false);
    expect(isActionLocked("IN_PROGRESS")).toBe(false);
  });

  it("a new Action can't start as Cancelled", () => {
    expect(canCreateActionWithStatus("CANCELLED")).toBe(false);
  });
});

describe("UNIT-03: Action field validation on the merged draft (BR-07, BR-08, BR-09)", () => {
  const ticketCreatedAt = new Date("2026-10-01T03:00:30.000Z");
  const now = new Date("2026-10-05T03:00:00.000Z");
  const ctx = { ticketCreatedAt, now };

  const valid: ActionDraft = {
    actionAt: new Date("2026-10-04T10:00:00.000Z"),
    description: "Replaced the faulty RAM module.",
    result: "Boots normally.",
    status: "COMPLETED",
    followUpRequired: false,
    followUpNote: null,
    attachmentNotes: null,
  };
  const check = (overrides: Partial<ActionDraft>) => validateActionDraft({ ...valid, ...overrides }, ctx);

  it("accepts a fully valid draft", () => {
    expect(check({})).toEqual({});
  });

  it("actionAt: required", () => {
    expect(check({ actionAt: null })).toHaveProperty("actionAt");
  });

  it("actionAt: not before the ticket was created, but the creation minute itself is accepted", () => {
    expect(check({ actionAt: new Date("2026-10-01T02:59:59.000Z") })).toHaveProperty("actionAt");
    expect(check({ actionAt: new Date("2026-10-01T03:00:00.000Z") })).toEqual({});
  });

  it("actionAt: a Completed action may be at most 5 minutes in the future", () => {
    expect(check({ actionAt: new Date("2026-10-05T03:04:00.000Z") })).toEqual({});
    expect(check({ actionAt: new Date("2026-10-05T03:10:00.000Z") })).toHaveProperty("actionAt");
  });

  it("actionAt: a Planned action may be scheduled ahead, up to a year", () => {
    const planned = { status: "PLANNED" as const, result: null };
    expect(check({ ...planned, actionAt: new Date("2026-11-04T03:00:00.000Z") })).toEqual({});
    expect(check({ ...planned, actionAt: new Date("2027-10-06T03:00:00.000Z") })).toHaveProperty("actionAt");
  });

  it("description: required, at most 2000 characters", () => {
    expect(check({ description: "" })).toHaveProperty("description");
    expect(check({ description: "x".repeat(2001) })).toHaveProperty("description");
    expect(check({ description: "x".repeat(2000) })).toEqual({});
  });

  it("result: required only once Completed, at most 2000 characters", () => {
    expect(check({ result: null })).toHaveProperty("result");
    expect(check({ status: "IN_PROGRESS", result: null })).toEqual({});
    expect(check({ result: "x".repeat(2001) })).toHaveProperty("result");
  });

  it("attachmentNotes: at most 500 characters", () => {
    expect(check({ attachmentNotes: "x".repeat(501) })).toHaveProperty("attachmentNotes");
    expect(check({ attachmentNotes: "x".repeat(500) })).toEqual({});
  });

  it("followUpNote: required (1-1000) when follow-up is needed", () => {
    expect(check({ followUpRequired: true, followUpNote: null })).toHaveProperty("followUpNote");
    expect(check({ followUpRequired: true, followUpNote: "x".repeat(1001) })).toHaveProperty("followUpNote");
    expect(check({ followUpRequired: true, followUpNote: "Re-check next week." })).toEqual({});
  });

  it("followUpNote is cleared on merge when follow-up isn't required, whatever was sent", () => {
    const merged = mergeActionDraft(valid, { followUpRequired: false, followUpNote: "should be dropped" });
    expect(merged.followUpNote).toBeNull();
  });

  it("merge keeps stored values for fields the request didn't send", () => {
    const merged = mergeActionDraft(valid, { status: "COMPLETED" });
    expect(merged.result).toBe(valid.result);
    expect(merged.description).toBe(valid.description);
  });

  it("parsing reports wrong JSON types and treats blank optional text as null", () => {
    const { input, fields } = parseActionInput({
      actionAt: "not a date",
      description: 42,
      status: "DONE",
      assigneeId: "7",
      followUpRequired: "yes",
      result: "   ",
      attachmentNotes: "",
    });
    expect(Object.keys(fields).sort()).toEqual(["actionAt", "assigneeId", "description", "followUpRequired", "status"]);
    expect(input.result).toBeNull();
    expect(input.attachmentNotes).toBeNull();
  });
});
