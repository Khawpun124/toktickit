import React from "react";

export interface PasswordRulesResult {
  minLength: boolean;
  hasUpperLower: boolean;
  hasNumber: boolean;
  hasSpecialChar: boolean;
  isValid: boolean;
}

export function validatePasswordRules(password: string): PasswordRulesResult {
  const minLength = password.length >= 8;
  const hasUpperLower = /[A-Z]/.test(password) && /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecialChar = /[^A-Za-z0-9]/.test(password);
  const isValid = minLength && hasUpperLower && hasNumber && hasSpecialChar;

  return {
    minLength,
    hasUpperLower,
    hasNumber,
    hasSpecialChar,
    isValid,
  };
}

interface PasswordRuleChecklistProps {
  password: string;
}

export const PasswordRuleChecklist: React.FC<PasswordRuleChecklistProps> = ({ password }) => {
  const rules = validatePasswordRules(password);

  return (
    <div
      style={{
        marginTop: "0.5rem",
        marginBottom: "1rem",
        padding: "0.75rem",
        backgroundColor: "#F9FAFB",
        borderRadius: "4px",
        border: "1px solid #E5E7EB",
        fontSize: "0.85rem",
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: "0.5rem", color: "#374151" }}>Password Requirements:</div>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
        <div data-testid="rule-min-length" style={{ color: rules.minLength ? "#059669" : "#DC2626" }}>
          {rules.minLength ? "✓" : "✗"} Minimum 8 characters
        </div>
        <div data-testid="rule-upper-lower" style={{ color: rules.hasUpperLower ? "#059669" : "#DC2626" }}>
          {rules.hasUpperLower ? "✓" : "✗"} Upper and lower case letters
        </div>
        <div data-testid="rule-number" style={{ color: rules.hasNumber ? "#059669" : "#DC2626" }}>
          {rules.hasNumber ? "✓" : "✗"} At least one number
        </div>
        <div data-testid="rule-special" style={{ color: rules.hasSpecialChar ? "#059669" : "#DC2626" }}>
          {rules.hasSpecialChar ? "✓" : "✗"} At least one special character
        </div>
      </div>
    </div>
  );
};
