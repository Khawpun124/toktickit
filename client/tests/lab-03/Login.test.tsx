import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { LoginScreen } from "../../src/components/LoginScreen.js";
import { AuthProvider } from "../../src/context/AuthContext.js";
import * as api from "../../src/api.js";

describe("LoginScreen (UI-01, UI-02, BR-05)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Default mock for getMe returns 401 unauthenticated
    vi.spyOn(api, "getMe").mockRejectedValue(new Error("Unauthenticated"));
  });

  it("UI-01: Login form valid submit calls login API and transitions state (AC-01)", async () => {
    const loginSpy = vi.spyOn(api, "login").mockResolvedValue({
      id: 1,
      name: "Jennifer Anderson",
      email: "jennifer.anderson@example.com",
      role: "REQUESTER",
      mustChangePassword: false,
    });

    render(
      <MemoryRouter>
        <AuthProvider>
          <LoginScreen />
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/Email address/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/Email address/i), {
      target: { value: "jennifer.anderson@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/^Password$/i), {
      target: { value: "ChangeMe123!" },
    });

    fireEvent.click(screen.getByRole("button", { name: /Sign In/i }));

    await waitFor(() => {
      expect(loginSpy).toHaveBeenCalledWith(
        "jennifer.anderson@example.com",
        "ChangeMe123!"
      );
    });
  });

  it("UI-02: Login form invalid submit displays generic safe error message (AC-05, BR-05)", async () => {
    vi.spyOn(api, "login").mockRejectedValue(
      new Error("Invalid email or password. Please try again.")
    );

    render(
      <MemoryRouter>
        <AuthProvider>
          <LoginScreen />
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/Email address/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/Email address/i), {
      target: { value: "invalid@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/^Password$/i), {
      target: { value: "WrongPass" },
    });


    fireEvent.click(screen.getByRole("button", { name: /Sign In/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        /Invalid email or password/i
      );
    });
  });
});
