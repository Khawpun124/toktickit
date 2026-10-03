import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { UserManagementScreen } from "../../src/components/UserManagementScreen.js";
import { AuthProvider } from "../../src/context/AuthContext.js";
import * as api from "../../src/api.js";

// ── Shared mock users ─────────────────────────────────────────────────────────

const mockAdminUser: api.AuthUser = {
  id: 10,
  name: "Admin Alice",
  email: "admin.alice@example.com",
  role: "ADMINISTRATOR",
  mustChangePassword: false,
};

const mockStaffUser: api.AuthUser = {
  id: 2,
  name: "Alex Staff",
  email: "alex.staff@example.com",
  role: "IT_STAFF",
  mustChangePassword: false,
};

const mockRequesterUser: api.AuthUser = {
  id: 1,
  name: "Jennifer Anderson",
  email: "jennifer.anderson@example.com",
  role: "REQUESTER",
  mustChangePassword: false,
};

const sampleUsers: api.AdminUser[] = [
  {
    id: 1,
    name: "Jennifer Anderson",
    email: "jennifer.anderson@example.com",
    role: "REQUESTER",
    isActive: true,
    mustChangePassword: false,
  },
  {
    id: 10,
    name: "Admin Alice",
    email: "admin.alice@example.com",
    role: "ADMINISTRATOR",
    isActive: true,
    mustChangePassword: false,
  },
];

// ── Helper: render inside MemoryRouter + AuthProvider ─────────────────────────

function renderComponent() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <UserManagementScreen />
      </AuthProvider>
    </MemoryRouter>
  );
}

describe("UserManagement Tests (UI-11, UI-12, UI-13)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ── UI-11: Non-Admin access is blocked ─────────────────────────────────────

  describe("UI-11: Non-Administrator access is forbidden (AC-14)", () => {
    it("UI-11a: Shows 403 Forbidden for Requester role", async () => {
      vi.spyOn(api, "getMe").mockResolvedValue(mockRequesterUser);

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText(/403 Forbidden/i)).toBeInTheDocument();
        expect(
          screen.getByText(/Access denied. You do not have permission to view User Management./i)
        ).toBeInTheDocument();
      });
    });

    it("UI-11b: Shows 403 Forbidden for IT Staff role", async () => {
      vi.spyOn(api, "getMe").mockResolvedValue(mockStaffUser);

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText(/403 Forbidden/i)).toBeInTheDocument();
        expect(
          screen.getByText(/Access denied. You do not have permission to view User Management./i)
        ).toBeInTheDocument();
      });
    });

    it("UI-11c: Does NOT show forbidden state for Administrator role", async () => {
      vi.spyOn(api, "getMe").mockResolvedValue(mockAdminUser);
      vi.spyOn(api, "getAdminUsers").mockResolvedValue(sampleUsers);

      renderComponent();

      await waitFor(() => {
        // Page heading renders (h1)
        expect(screen.getByRole("heading", { name: /User Management/i, level: 1 })).toBeInTheDocument();
        expect(screen.queryByText(/403 Forbidden/i)).not.toBeInTheDocument();
      });
    });
  });

  // ── UI-12: Duplicate email shows field-level error ────────────────────────

  describe("UI-12: Create user with duplicate email shows field-level error (AC-12)", () => {
    it("UI-12: Shows inline email field error when API returns 400 duplicate email", async () => {
      vi.spyOn(api, "getMe").mockResolvedValue(mockAdminUser);
      vi.spyOn(api, "getAdminUsers").mockResolvedValue(sampleUsers);

      const duplicateErr = new Error("Email already exists") as Error & { status?: number };
      duplicateErr.status = 400;
      vi.spyOn(api, "createAdminUser").mockRejectedValue(duplicateErr);

      renderComponent();

      // Wait for page to load
      await waitFor(() => {
        expect(screen.getByRole("heading", { name: /User Management/i, level: 1 })).toBeInTheDocument();
        expect(document.getElementById("create-user-btn")).toBeInTheDocument();
      });

      // Open create panel
      fireEvent.click(document.getElementById("create-user-btn")!);

      // Panel heading appears (may be in both desktop + mobile, use getAllByText)
      await waitFor(() => {
        const headings = screen.getAllByText("Create New User");
        expect(headings.length).toBeGreaterThanOrEqual(1);
      });

      // Fill in the form (by id, unique in DOM even if panel renders twice —
      // desktop panel has id="user-form-name"; mobile modal's form has same ids;
      // document.getElementById always returns the first one)
      fireEvent.change(document.getElementById("user-form-name")!, {
        target: { value: "John Doe" },
      });
      fireEvent.change(document.getElementById("user-form-email")!, {
        target: { value: "jennifer.anderson@example.com" },
      });
      fireEvent.change(document.getElementById("user-form-password")!, {
        target: { value: "Passw0rd!" },
      });

      // Submit via the (first) submit button
      fireEvent.click(document.getElementById("user-form-submit-btn")!);

      // Expect field-level email error
      await waitFor(() => {
        const emailError = document.getElementById("user-form-email-error");
        expect(emailError).toBeInTheDocument();
        expect(emailError).toHaveTextContent("Email already exists");
      });
    });
  });

  // ── UI-13: Self-deactivation is blocked ───────────────────────────────────

  describe("UI-13: Self-deactivation attempt is blocked with a message (AC-13)", () => {
    it("UI-13a: Shows inline message when admin tries to deactivate their own account via PATCH 403", async () => {
      vi.spyOn(api, "getMe").mockResolvedValue(mockAdminUser);
      vi.spyOn(api, "getAdminUsers").mockResolvedValue(sampleUsers);

      const selfDeactivateErr = new Error("You cannot deactivate your own account") as Error & {
        status?: number;
      };
      selfDeactivateErr.status = 403;
      vi.spyOn(api, "updateAdminUser").mockRejectedValue(selfDeactivateErr);

      renderComponent();

      await waitFor(() => {
        expect(document.getElementById(`edit-user-${mockAdminUser.id}-btn`)).toBeInTheDocument();
      });

      // Open edit panel for the admin user (themselves)
      fireEvent.click(document.getElementById(`edit-user-${mockAdminUser.id}-btn`)!);

      await waitFor(() => {
        const headings = screen.getAllByText("Edit User");
        expect(headings.length).toBeGreaterThanOrEqual(1);
      });

      // Toggle active off (try to deactivate self)
      // user-form-active is in the first panel (desktop)
      fireEvent.click(document.getElementById("user-form-active")!);

      // Submit the form
      fireEvent.click(document.getElementById("user-form-submit-btn")!);

      // Expect form-level error about self-deactivation
      await waitFor(() => {
        const formError = document.getElementById("user-form-error");
        expect(formError).toBeInTheDocument();
        expect(formError).toHaveTextContent(/cannot deactivate your own account/i);
      });
    });

    it("UI-13b: Shows inline message when removing last active Administrator (400 from server)", async () => {
      vi.spyOn(api, "getMe").mockResolvedValue(mockAdminUser);
      vi.spyOn(api, "getAdminUsers").mockResolvedValue(sampleUsers);

      const lastAdminErr = new Error(
        "Cannot remove or deactivate the last active Administrator"
      ) as Error & { status?: number };
      lastAdminErr.status = 400;
      vi.spyOn(api, "updateAdminUser").mockRejectedValue(lastAdminErr);

      renderComponent();

      await waitFor(() => {
        expect(document.getElementById(`edit-user-${mockAdminUser.id}-btn`)).toBeInTheDocument();
      });

      // Open edit panel for the admin user
      fireEvent.click(document.getElementById(`edit-user-${mockAdminUser.id}-btn`)!);

      await waitFor(() => {
        const headings = screen.getAllByText("Edit User");
        expect(headings.length).toBeGreaterThanOrEqual(1);
      });

      // Change role to IT_STAFF (which would remove admin status)
      const roleSelect = document.getElementById("user-form-role") as HTMLSelectElement;
      fireEvent.change(roleSelect, { target: { value: "IT_STAFF" } });

      // Submit
      fireEvent.click(document.getElementById("user-form-submit-btn")!);

      // Expect form-level error about last admin
      await waitFor(() => {
        const formError = document.getElementById("user-form-error");
        expect(formError).toBeInTheDocument();
        expect(formError).toHaveTextContent(/last active Administrator/i);
      });
    });
  });

  // ── Additional: User list renders correctly ───────────────────────────────

  describe("User list rendering", () => {
    it("Renders user list with name, email, role badge, and status badge", async () => {
      vi.spyOn(api, "getMe").mockResolvedValue(mockAdminUser);
      vi.spyOn(api, "getAdminUsers").mockResolvedValue(sampleUsers);

      renderComponent();

      await waitFor(() => {
        // Names appear in table rows
        expect(screen.getByText("Jennifer Anderson")).toBeInTheDocument();
        expect(screen.getByText("Admin Alice")).toBeInTheDocument();
      });

      // Role badges appear in table (there are also options in the dropdown, use getAllByText)
      const requesterBadges = screen.getAllByText("Requester");
      expect(requesterBadges.length).toBeGreaterThanOrEqual(1);

      const adminBadges = screen.getAllByText("Administrator");
      expect(adminBadges.length).toBeGreaterThanOrEqual(1);

      // Active status badges
      const activeBadges = screen.getAllByText("Active");
      expect(activeBadges.length).toBeGreaterThanOrEqual(2); // one per user
    });

    it("Shows empty state when no users match search", async () => {
      vi.spyOn(api, "getMe").mockResolvedValue(mockAdminUser);
      vi.spyOn(api, "getAdminUsers")
        .mockResolvedValueOnce(sampleUsers)
        .mockResolvedValue([]);

      renderComponent();

      await waitFor(() => {
        expect(document.getElementById("user-search-input")).toBeInTheDocument();
      });

      fireEvent.change(document.getElementById("user-search-input")!, {
        target: { value: "nonexistent-user" },
      });

      await waitFor(() => {
        expect(screen.getByText(/No users match your search/i)).toBeInTheDocument();
      });
    });
  });
});
