import { describe, it, expect } from "vitest";
import { formatTicketNumber } from "../../src/ticketNumber.js";
import { clampPage, clampPageSize } from "../../src/ticketQuery.js";

// UNIT-01 (BR-05)
describe("formatTicketNumber", () => {
  it("formats as TK-<year>-<6-digit zero-padded id>", () => {
    expect(formatTicketNumber(42, new Date("2026-08-24T00:00:00Z"))).toBe("TK-2026-000042");
  });

  it("does not truncate ids that already have 6+ digits", () => {
    expect(formatTicketNumber(123456, new Date("2026-01-01T00:00:00Z"))).toBe("TK-2026-123456");
  });

  // UNIT-02 (BR-01, BR-05) — uniqueness across distinct ids
  it("produces a different number for a different id on the same day", () => {
    const now = new Date("2026-08-24T00:00:00Z");
    expect(formatTicketNumber(1, now)).not.toBe(formatTicketNumber(2, now));
  });

  it("uses the given date's UTC year, not the local calendar year", () => {
    expect(formatTicketNumber(7, new Date("2025-12-31T23:59:00Z"))).toBe("TK-2025-000007");
  });
});

// UNIT-03 (BR-17)
describe("clampPage", () => {
  it("resolves valid positive integers as-is", () => {
    expect(clampPage(3)).toBe(3);
    expect(clampPage("3")).toBe(3);
  });

  it.each([undefined, null, "abc", 0, -1, 1.5])("resets invalid page %p to 1", (value) => {
    expect(clampPage(value)).toBe(1);
  });
});

// UNIT-04 (BR-17)
describe("clampPageSize", () => {
  it.each([10, 25, 50])("resolves an allowed page size %p as-is", (value) => {
    expect(clampPageSize(value)).toBe(value);
  });

  it.each([undefined, null, "abc", 0, 15, 100])("resets a disallowed page size %p to 10", (value) => {
    expect(clampPageSize(value)).toBe(10);
  });
});
