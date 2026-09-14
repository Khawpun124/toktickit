import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { ChangePasswordScreen } from "../../src/components/ChangePasswordScreen.js";
import { AuthProvider } from "../../src/context/AuthContext.js";
import * as api from "../../src/api.js";

describe("ChangePasswordScreen (UI-03, UI-04, BR-07)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api, "getMe").mockResolvedValue({
      id: 1,
      name: "Test User",
      email: "test@example.com",
      role: "REQUESTER",
      mustChangePassword: true,
    });
  });

  it("UI-04: Password rule checklist live updates as user types (BR-07)", async () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <ChangePasswordScreen />
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/^New Password$/i)).toBeInTheDocument();
    });


    const newPassInput = screen.getByLabelText(/^New Password$/i);

    // Initially fails rules
    const minLengthRule = screen.getByTestId("rule-min-length");
    const upperLowerRule = screen.getByTestId("rule-upper-lower");
    const numberRule = screen.getByTestId("rule-number");
    const specialRule = screen.getByTestId("rule-special");

    expect(minLengthRule.textContent).toContain("✗");
    expect(upperLowerRule.textContent).toContain("✗");

    // Type strong password
    fireEvent.change(newPassInput, { target: { value: "StrongPass123!" } });

    expect(minLengthRule.textContent).toContain("✓");
    expect(upperLowerRule.textContent).toContain("✓");
    expect(numberRule.textContent).toContain("✓");
    expect(specialRule.textContent).toContain("✓");
  });

  it("UI-03: Continue button is disabled until all rules pass and passwords match (AC-02)", async () => {
    const changeSpy = vi.spyOn(api, "changePassword").mockResolvedValue({
      success: true,
      mustChangePassword: false,
    });

    render(
      <MemoryRouter>
        <AuthProvider>
          <ChangePasswordScreen />
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Continue/i })).toBeDisabled();
    });

    fireEvent.change(screen.getByLabelText(/Current \(Temporary\) Password/i), {
      target: { value: "ChangeMe123!" },
    });
    fireEvent.change(screen.getByLabelText(/^New Password$/i), {
      target: { value: "NewSecurePass123!" },
    });
    fireEvent.change(screen.getByLabelText(/Confirm New Password/i), {
      target: { value: "NewSecurePass123!" },
    });

    const submitBtn = screen.getByRole("button", { name: /Continue/i });
    expect(submitBtn).not.toBeDisabled();

    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(changeSpy).toHaveBeenCalledWith(
        "ChangeMe123!",
        "NewSecurePass123!",
        "NewSecurePass123!"
      );
    });
  });
});
