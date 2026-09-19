import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { StaffTicketQueueScreen } from "../../src/components/StaffTicketQueueScreen.js";
import { AuthProvider } from "../../src/context/AuthContext.js";
import * as api from "../../src/api.js";

describe("StaffTicketQueueScreen Tests (UI-06, UI-07)", () => {
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

  const mockCategories: api.Category[] = [
    { id: 1, name: "Hardware" },
    { id: 2, name: "Software" },
  ];

  const mockStaffUsers: api.StaffUserItem[] = [
    { id: 2, name: "Alex Staff", email: "alex.staff@example.com", role: "IT_STAFF" },
  ];

  const mockTicketItem: api.StaffTicketListItem = {
    id: 101,
    ticketNumber: "TKT-2026-000001",
    summary: "Monitor flickering issue",
    categoryName: "Hardware",
    requestedPriority: "HIGH",
    itPriority: "HIGH",
    currentStatus: "NEW",
    problemAppearsResolved: false,
    ticketOwnerId: null,
    ticketOwnerName: null,
    createdAt: "2026-09-19T10:00:00.000Z",
    updatedAt: "2026-09-19T10:00:00.000Z",
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api, "getCategories").mockResolvedValue(mockCategories);
    vi.spyOn(api, "getStaffUsers").mockResolvedValue(mockStaffUsers);
  });

  it("UI-06: IT Staff Queue renders queue table with headers and badges for IT Staff user", async () => {
    vi.spyOn(api, "getMe").mockResolvedValue(mockStaffUser);
    vi.spyOn(api, "getStaffTickets").mockResolvedValue({
      data: [mockTicketItem],
      pagination: { page: 1, pageSize: 10, totalItems: 1, totalPages: 1 },
    });

    render(
      <MemoryRouter>
        <AuthProvider>
          <StaffTicketQueueScreen />
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("My Queue")).toBeInTheDocument();
      expect(screen.getAllByText("TKT-2026-000001").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("Monitor flickering issue").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("Hardware").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("Unassigned").length).toBeGreaterThanOrEqual(1);
    });
  });

  it("UI-07: Renders empty state when queue is empty and no filters applied", async () => {
    vi.spyOn(api, "getMe").mockResolvedValue(mockStaffUser);
    vi.spyOn(api, "getStaffTickets").mockResolvedValue({
      data: [],
      pagination: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 },
    });

    render(
      <MemoryRouter>
        <AuthProvider>
          <StaffTicketQueueScreen />
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("No tickets in the queue yet")).toBeInTheDocument();
    });
  });

  it("UI-07: Renders no-results state when search/filter returns zero tickets", async () => {
    vi.spyOn(api, "getMe").mockResolvedValue(mockStaffUser);
    vi.spyOn(api, "getStaffTickets").mockResolvedValue({
      data: [],
      pagination: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 },
    });

    render(
      <MemoryRouter>
        <AuthProvider>
          <StaffTicketQueueScreen />
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Ticket No. or summary.../i)).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/Ticket No. or summary.../i);
    fireEvent.change(searchInput, { target: { value: "NonExistentTerm" } });

    await waitFor(() => {
      expect(screen.getByText("No tickets match your search")).toBeInTheDocument();
    });
  });

  it("UI-07: Renders forbidden state when accessed by a Requester user", async () => {
    vi.spyOn(api, "getMe").mockResolvedValue(mockRequesterUser);

    render(
      <MemoryRouter>
        <AuthProvider>
          <StaffTicketQueueScreen />
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/403 Forbidden/i)).toBeInTheDocument();
      expect(
        screen.getByText(/Access denied. You do not have permission to view the IT Staff Queue./i)
      ).toBeInTheDocument();
    });
  });
});
