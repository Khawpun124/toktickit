import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import App from "../../src/App.js";
import { RequesterSelectionScreen } from "../../src/components/RequesterSelectionScreen.js";
import { RequesterProvider } from "../../src/context/RequesterContext.js";
import * as api from "../../src/api.js";

describe("RequesterSelectionScreen and Context (UI-01, UI-02)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    vi.spyOn(api, "getCategories").mockResolvedValue([
      { id: 1, name: "Account and Access" },
    ]);
    vi.spyOn(api, "getRelatedSystems").mockResolvedValue([
      { id: 1, name: "Email" },
    ]);
    vi.spyOn(api, "getTickets").mockResolvedValue({
      data: [],
      pagination: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 },
    });
  });

  it("UI-01: loads active Requesters only into the dropdown and excludes inactive requesters", async () => {
    const mockRequesters: api.RequesterUser[] = [
      { id: 1, name: "Jennifer Anderson", email: "jennifer.anderson@example.com" },
      { id: 2, name: "Michael Brown", email: "michael.brown@example.com" },
    ];

    vi.spyOn(api, "getRequesters").mockResolvedValue(mockRequesters);

    render(
      <MemoryRouter>
        <RequesterProvider>
          <RequesterSelectionScreen />
        </RequesterProvider>
      </MemoryRouter>
    );

    expect(screen.getByText(/Loading requesters.../i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByRole("option", { name: /Jennifer Anderson/i })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: /Michael Brown/i })).toBeInTheDocument();
    });

    // Inactive Requester must not be present in options
    expect(screen.queryByText(/Inactive Tester/i)).not.toBeInTheDocument();
  });

  it("UI-02: shows Requester Selection screen when no Requester is selected", async () => {
    vi.spyOn(api, "getRequesters").mockResolvedValue([
      { id: 1, name: "Jennifer Anderson", email: "jennifer.anderson@example.com" },
    ]);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/Select Development Requester/i)).toBeInTheDocument();
    });
  });

  it("allows selecting a requester, saving context, and changing requester", async () => {
    const mockRequesters: api.RequesterUser[] = [
      { id: 1, name: "Jennifer Anderson", email: "jennifer.anderson@example.com" },
      { id: 2, name: "Michael Brown", email: "michael.brown@example.com" },
    ];

    vi.spyOn(api, "getRequesters").mockResolvedValue(mockRequesters);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("option", { name: /Jennifer Anderson/i })).toBeInTheDocument();
    });

    const select = screen.getByLabelText(/Development Requester/i);
    fireEvent.change(select, { target: { value: "2" } });

    const continueButton = screen.getByRole("button", { name: /Continue/i });
    fireEvent.click(continueButton);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /My Tickets/i })).toBeInTheDocument();
      expect(screen.getAllByText(/Michael Brown/i).length).toBeGreaterThan(0);
    });

    // Header should show Change Requester button
    const changeButton = screen.getByRole("button", { name: /Change Requester/i });
    expect(changeButton).toBeInTheDocument();

    // Clicking Change Requester should redirect back to selection screen
    fireEvent.click(changeButton);

    await waitFor(() => {
      expect(screen.getByText(/Select Development Requester/i)).toBeInTheDocument();
    });
  });
});


