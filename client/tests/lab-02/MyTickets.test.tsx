import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import App from "../../src/App.js";
import { MyTicketsScreen } from "../../src/components/MyTicketsScreen.js";
import { RequesterProvider } from "../../src/context/RequesterContext.js";
import * as api from "../../src/api.js";


describe("MyTicketsScreen (UI-07, UI-08, UI-09)", () => {
  const mockRequesterA: api.RequesterUser = {
    id: 1,
    name: "Jennifer Anderson",
    email: "jennifer.anderson@example.com",
  };

  const mockRequesterB: api.RequesterUser = {
    id: 2,
    name: "Michael Brown",
    email: "michael.brown@example.com",
  };

  const mockCategories: api.Category[] = [
    { id: 1, name: "Account and Access" },
    { id: 2, name: "Hardware" },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    sessionStorage.setItem("toktickit_selected_requester", JSON.stringify(mockRequesterA));
    vi.spyOn(api, "getRequesters").mockResolvedValue([mockRequesterA, mockRequesterB]);
    vi.spyOn(api, "getCategories").mockResolvedValue(mockCategories);
    vi.spyOn(api, "getRelatedSystems").mockResolvedValue([]);
  });

  it("UI-07: displays distinct Empty State when Requester has zero tickets (AC-09, BR-29)", async () => {
    vi.spyOn(api, "getTickets").mockResolvedValue({
      data: [],
      pagination: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 },
    });

    render(
      <MemoryRouter>
        <RequesterProvider>
          <MyTicketsScreen onNavigateToCreate={() => {}} />
        </RequesterProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(
        screen.getByText(/You haven't created any tickets yet/i)
      ).toBeInTheDocument();
    });

    // Should NOT show no-results message
    expect(screen.queryByText(/No tickets match your filters/i)).not.toBeInTheDocument();
  });

  it("UI-08: displays distinct No-Results State when filters match zero tickets (AC-10, BR-29)", async () => {
    // First fetch with no filters returns 1 ticket (so user has tickets)
    // Subsequent fetch with category filter returns 0 tickets
    vi.spyOn(api, "getTickets").mockImplementation(async (params) => {
      if (params.categoryId) {
        return {
          data: [],
          pagination: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 },
        };
      }
      return {
        data: [
          {
            id: 101,
            ticketNumber: "TKT-2026-000001",
            summary: "Laptop battery issue",
            categoryName: "Hardware",
            requestedPriority: "HIGH",
            itPriority: null,
            currentStatus: "NEW",
            createdAt: "2026-08-01T10:00:00Z",
            updatedAt: "2026-08-01T10:00:00Z",
          },
        ],
        pagination: { page: 1, pageSize: 10, totalItems: 1, totalPages: 1 },
      };
    });

    render(
      <MemoryRouter>
        <RequesterProvider>
          <MyTicketsScreen onNavigateToCreate={() => {}} />
        </RequesterProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getAllByText("Laptop battery issue")[0]).toBeInTheDocument();
    });

    // Select category filter to filter out tickets
    const categorySelect = screen.getByLabelText(/Filter by Category/i);
    fireEvent.change(categorySelect, { target: { value: "1" } });

    await waitFor(() => {
      expect(
        screen.getByText(/No tickets match your filters/i)
      ).toBeInTheDocument();
    });

    // Should NOT show empty state message
    expect(screen.queryByText(/You haven't created any tickets yet/i)).not.toBeInTheDocument();
  });

  it("UI-09: reloads tickets for new Requester when changing Requester from A to B (AC-13, BR-07)", async () => {
    const getTicketsSpy = vi.spyOn(api, "getTickets").mockImplementation(async (_params, requesterId) => {
      if (requesterId === 1) {
        return {
          data: [
            {
              id: 101,
              ticketNumber: "TKT-2026-000001",
              summary: "Requester A Ticket",
              categoryName: "Hardware",
              requestedPriority: "MEDIUM",
              itPriority: null,
              currentStatus: "NEW",
              createdAt: "2026-08-01T10:00:00Z",
              updatedAt: "2026-08-01T10:00:00Z",
            },
          ],
          pagination: { page: 1, pageSize: 10, totalItems: 1, totalPages: 1 },
        };
      }
      return {
        data: [
          {
            id: 102,
            ticketNumber: "TKT-2026-000002",
            summary: "Requester B Ticket",
            categoryName: "Account and Access",
            requestedPriority: "HIGH",
            itPriority: null,
            currentStatus: "NEW",
            createdAt: "2026-08-02T10:00:00Z",
            updatedAt: "2026-08-02T10:00:00Z",
          },
        ],
        pagination: { page: 1, pageSize: 10, totalItems: 1, totalPages: 1 },
      };
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getAllByText("Requester A Ticket")[0]).toBeInTheDocument();
    });

    // Click Change Requester
    const changeButton = screen.getByRole("button", { name: /Change Requester/i });
    fireEvent.click(changeButton);

    await waitFor(() => {
      expect(screen.getByText(/Select Development Requester/i)).toBeInTheDocument();
    });

    // Select Requester B and Continue
    const requesterSelect = screen.getByLabelText(/Development Requester/i);
    fireEvent.change(requesterSelect, { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: /Continue/i }));

    await waitFor(() => {
      expect(screen.getAllByText("Requester B Ticket")[0]).toBeInTheDocument();
    });

    expect(getTicketsSpy).toHaveBeenCalledWith(expect.anything(), 2);
  });
});
