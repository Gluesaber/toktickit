import { describe, it, expect } from "vitest";
import { formatTicketNumber } from "../../src/ticketNumber.js";

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
