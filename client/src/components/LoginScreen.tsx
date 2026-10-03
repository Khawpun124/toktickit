import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";

export const LoginScreen: React.FC = () => {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    setLoading(true);
    setErrorMessage(null);

    try {
      await login(email, password);
    } catch (err: any) {
      setErrorMessage(err.message || "Invalid email or password. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "80vh" }}>
      <div className="card" style={{ width: "100%", maxWidth: "420px", padding: "2rem" }}>
        <h2 style={{ marginBottom: "0.5rem", textAlign: "center", color: "var(--zg-primary)" }}>
          TokTickIT Login
        </h2>
        <p style={{ textAlign: "center", marginBottom: "1.5rem", color: "var(--zg-text-muted)", fontSize: "0.9rem" }}>
          Sign in to access your IT support tickets
        </p>

        {errorMessage && (
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
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: "1rem" }}>
            <label htmlFor="email" style={{ display: "block", marginBottom: "0.25rem", fontWeight: 500 }}>
              Email address
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              style={{ width: "100%", padding: "0.5rem", borderRadius: "4px", border: "1px solid #D1D5DB" }}
            />
          </div>

          <div style={{ marginBottom: "1.5rem" }}>
            <label htmlFor="password" style={{ display: "block", marginBottom: "0.25rem", fontWeight: 500 }}>
              Password
            </label>
            <div style={{ position: "relative" }}>
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                style={{ width: "100%", padding: "0.5rem", paddingRight: "2.5rem", borderRadius: "4px", border: "1px solid #D1D5DB" }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                style={{
                  position: "absolute",
                  right: "0.5rem",
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontSize: "0.85rem",
                  color: "#6B7280",
                }}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "0.75rem",
              backgroundColor: "var(--zg-primary)",
              color: "white",
              border: "none",
              borderRadius: "4px",
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <div style={{ marginTop: "1rem", textAlign: "center" }}>
          <span style={{ color: "#9CA3AF", fontSize: "0.85rem", textDecoration: "none", cursor: "not-allowed" }}>
            Forgot your password? (Contact Admin)
          </span>
        </div>
      </div>
    </div>
  );
};
