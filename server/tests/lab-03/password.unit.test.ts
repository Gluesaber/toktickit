import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword, MIN_PASSWORD_LENGTH } from "../../src/auth.js";

// docs/lab-03/tests.md UNIT-01/UNIT-02.

describe("hashPassword / verifyPassword (BR-06)", () => {
  it("UNIT-01: a hashed password verifies true against the original plaintext", async () => {
    const hash = await hashPassword("correct horse battery staple");
    await expect(verifyPassword("correct horse battery staple", hash)).resolves.toBe(true);
  });

  it("UNIT-01: a hashed password verifies false against the wrong plaintext", async () => {
    const hash = await hashPassword("correct horse battery staple");
    await expect(verifyPassword("wrong password", hash)).resolves.toBe(false);
  });

  it("UNIT-01: never stores the plaintext itself as the hash", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash).not.toBe("correct horse battery staple");
    expect(hash.startsWith("$2")).toBe(true); // bcrypt hash format
  });
});

describe("MIN_PASSWORD_LENGTH (BR-14)", () => {
  it("UNIT-02: is 8", () => {
    expect(MIN_PASSWORD_LENGTH).toBe(8);
  });
});
