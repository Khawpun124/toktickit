import bcrypt from "bcrypt";

const BCRYPT_COST_FACTOR = 10;

export async function hashPassword(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, BCRYPT_COST_FACTOR);
}

export async function comparePassword(
  plaintext: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(plaintext, hash);
}

export interface PasswordRuleResults {
  minLength: boolean;
  hasUpperLower: boolean;
  hasNumber: boolean;
  hasSpecialChar: boolean;
}

export function validatePasswordRules(password: string): {
  isValid: boolean;
  rules: PasswordRuleResults;
} {
  const minLength = password.length >= 8;
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasUpperLower = hasUpper && hasLower;
  const hasNumber = /[0-9]/.test(password);
  const hasSpecialChar = /[^A-Za-z0-9]/.test(password);

  const isValid = minLength && hasUpperLower && hasNumber && hasSpecialChar;

  return {
    isValid,
    rules: {
      minLength,
      hasUpperLower,
      hasNumber,
      hasSpecialChar,
    },
  };
}
