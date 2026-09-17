import { describe, it, expect } from "vitest";
import {
  hashPassword,
  comparePassword,
  validatePasswordRules,
} from "../../src/utils/password.js";

describe("Password Utility Unit Tests (UNIT-01, BR-06, BR-07)", () => {
  it("hashes password with bcrypt and never equals plaintext", async () => {
    const plaintext = "SecurePass123!";
    const hash = await hashPassword(plaintext);

    expect(hash).not.toBe(plaintext);
    expect(hash.startsWith("$2b$")).toBe(true);

    const isMatch = await comparePassword(plaintext, hash);
    expect(isMatch).toBe(true);

    const isWrongMatch = await comparePassword("WrongPass123!", hash);
    expect(isWrongMatch).toBe(false);
  });

  it("validates password rule checklist per BR-07", () => {
    // Valid password
    const valid = validatePasswordRules("StrongPass123!");
    expect(valid.isValid).toBe(true);
    expect(valid.rules.minLength).toBe(true);
    expect(valid.rules.hasUpperLower).toBe(true);
    expect(valid.rules.hasNumber).toBe(true);
    expect(valid.rules.hasSpecialChar).toBe(true);

    // Weak: short length
    const short = validatePasswordRules("Short1!");
    expect(short.isValid).toBe(false);
    expect(short.rules.minLength).toBe(false);

    // Weak: no uppercase
    const noUpper = validatePasswordRules("lowercase123!");
    expect(noUpper.isValid).toBe(false);
    expect(noUpper.rules.hasUpperLower).toBe(false);

    // Weak: no number
    const noNumber = validatePasswordRules("NoNumbersHere!");
    expect(noNumber.isValid).toBe(false);
    expect(noNumber.rules.hasNumber).toBe(false);

    // Weak: no special char
    const noSpecial = validatePasswordRules("NoSpecialChar123");
    expect(noSpecial.isValid).toBe(false);
    expect(noSpecial.rules.hasSpecialChar).toBe(false);
  });
});
