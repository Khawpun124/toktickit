import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";

export const ChangePasswordScreen: React.FC = () => {
  const { changePassword } = useAuth();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Live password checklist validation
  const minLength = newPassword.length >= 8;
  const hasUpperLower = /[A-Z]/.test(newPassword) && /[a-z]/.test(newPassword);
  const hasNumber = /[0-9]/.test(newPassword);
  const hasSpecialChar = /[^A-Za-z0-9]/.test(newPassword);

  const allRulesPassed = minLength && hasUpperLower && hasNumber && hasSpecialChar;
  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;
  const canSubmit = allRulesPassed && passwordsMatch && currentPassword.length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setLoading(true);
    setErrorMsg(null);

    try {
      await changePassword(currentPassword, newPassword, confirmPassword);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to change password. Please check your current password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "80vh" }}>
      <div className="card" style={{ width: "100%", maxWidth: "480px", padding: "2rem" }}>
        <h2 style={{ marginBottom: "0.5rem", textAlign: "center", color: "var(--zg-primary)" }}>
          Mandatory Password Change
        </h2>
        <p style={{ textAlign: "center", marginBottom: "1.5rem", color: "var(--zg-text-muted)", fontSize: "0.9rem" }}>
          You must set a new secure password before proceeding.
        </p>

        {errorMsg && (
          <div
            role="alert"
            style={{
              padding: "0.75rem",
              marginBottom: "1rem",
              backgroundColor: "#FEE2E2",
              color: "#DC2626",
              border: "1px solid #FCA5A5",
              borderRadius: "4px",
              fontSize: "0.9rem",
            }}
          >
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Current Password */}
          <div style={{ marginBottom: "1rem" }}>
            <label htmlFor="currentPassword" style={{ display: "block", marginBottom: "0.25rem", fontWeight: 500 }}>
              Current (Temporary) Password
            </label>
            <div style={{ position: "relative" }}>
              <input
                id="currentPassword"
                type={showCurrent ? "text" : "password"}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="••••••••"
                required
                style={{ width: "100%", padding: "0.5rem", paddingRight: "2.5rem", borderRadius: "4px", border: "1px solid #D1D5DB" }}
              />
              <button
                type="button"
                onClick={() => setShowCurrent(!showCurrent)}
                style={{ position: "absolute", right: "0.5rem", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: "0.85rem", color: "#6B7280" }}
              >
                {showCurrent ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          {/* New Password */}
          <div style={{ marginBottom: "1rem" }}>
            <label htmlFor="newPassword" style={{ display: "block", marginBottom: "0.25rem", fontWeight: 500 }}>
              New Password
            </label>
            <div style={{ position: "relative" }}>
              <input
                id="newPassword"
                type={showNew ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                required
                style={{ width: "100%", padding: "0.5rem", paddingRight: "2.5rem", borderRadius: "4px", border: "1px solid #D1D5DB" }}
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                style={{ position: "absolute", right: "0.5rem", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: "0.85rem", color: "#6B7280" }}
              >
                {showNew ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          {/* Live Rule Checklist */}
          <div style={{ marginBottom: "1rem", padding: "0.75rem", backgroundColor: "#F9FAFB", borderRadius: "4px", border: "1px solid #E5E7EB", fontSize: "0.85rem" }}>
            <div style={{ fontWeight: 600, marginBottom: "0.5rem", color: "#374151" }}>Password Requirements:</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              <div data-testid="rule-min-length" style={{ color: minLength ? "#059669" : "#DC2626" }}>
                {minLength ? "✓" : "✗"} Minimum 8 characters
              </div>
              <div data-testid="rule-upper-lower" style={{ color: hasUpperLower ? "#059669" : "#DC2626" }}>
                {hasUpperLower ? "✓" : "✗"} Upper and lower case letters
              </div>
              <div data-testid="rule-number" style={{ color: hasNumber ? "#059669" : "#DC2626" }}>
                {hasNumber ? "✓" : "✗"} At least one number
              </div>
              <div data-testid="rule-special" style={{ color: hasSpecialChar ? "#059669" : "#DC2626" }}>
                {hasSpecialChar ? "✓" : "✗"} At least one special character
              </div>
            </div>
          </div>

          {/* Confirm Password */}
          <div style={{ marginBottom: "1.5rem" }}>
            <label htmlFor="confirmPassword" style={{ display: "block", marginBottom: "0.25rem", fontWeight: 500 }}>
              Confirm New Password
            </label>
            <div style={{ position: "relative" }}>
              <input
                id="confirmPassword"
                type={showConfirm ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                required
                style={{ width: "100%", padding: "0.5rem", paddingRight: "2.5rem", borderRadius: "4px", border: "1px solid #D1D5DB" }}
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                style={{ position: "absolute", right: "0.5rem", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: "0.85rem", color: "#6B7280" }}
              >
                {showConfirm ? "Hide" : "Show"}
              </button>
            </div>
            {newPassword && confirmPassword && !passwordsMatch && (
              <div style={{ color: "#DC2626", fontSize: "0.8rem", marginTop: "0.25rem" }}>
                Passwords do not match
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={!canSubmit || loading}
            style={{
              width: "100%",
              padding: "0.75rem",
              backgroundColor: "var(--zg-primary)",
              color: "white",
              border: "none",
              borderRadius: "4px",
              fontWeight: 600,
              cursor: canSubmit && !loading ? "pointer" : "not-allowed",
              opacity: canSubmit && !loading ? 1 : 0.6,
            }}
          >
            {loading ? "Updating..." : "Continue"}
          </button>
        </form>
      </div>
    </div>
  );
};
