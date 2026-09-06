import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { RequesterTicketDetailScreen } from "../../src/components/RequesterTicketDetailScreen.js";
import { RequesterProvider } from "../../src/context/RequesterContext.js";
import * as api from "../../src/api.js";

describe("RequesterTicketDetailScreen (UI-10)", () => {
  const mockRequester: api.RequesterUser = {
    id: 1,
    name: "Jennifer Anderson",
    email: "jennifer.anderson@example.com",
  };

  const mockTicket: api.TicketDetail = {
    id: 101,
    ticketNumber: "TKT-2026-000042",
    requesterId: 1,
    categoryName: "Hardware",
    relatedSystemName: "Corporate Laptop",
    summary: "Laptop battery drains quickly",
    description: "My laptop battery is draining much faster than usual during normal usage.",
    requestedPriority: "MEDIUM",
    itPriority: null,
    currentStatus: "NEW",
    createdAt: "2026-08-20T09:14:00.000Z",
    updatedAt: "2026-08-20T09:14:00.000Z",
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    sessionStorage.setItem("toktickit_selected_requester", JSON.stringify(mockRequester));
    vi.spyOn(api, "getTicket").mockResolvedValue(mockTicket);
    vi.spyOn(api, "getAttachments").mockResolvedValue([]);
  });

  it("UI-10: renders all ticket header fields as read-only without edit controls (FR-12, BR-30)", async () => {
    render(
      <RequesterProvider>
        <RequesterTicketDetailScreen ticketId={101} onBack={() => {}} />
      </RequesterProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("Laptop battery drains quickly")).toBeInTheDocument();
    });

    expect(screen.getAllByText("TKT-2026-000042")[0]).toBeInTheDocument();
    expect(screen.getByText("Hardware")).toBeInTheDocument();
    expect(screen.getByText("Corporate Laptop")).toBeInTheDocument();
    expect(screen.getByText("Jennifer Anderson")).toBeInTheDocument();
    expect(screen.getByText(/My laptop battery is draining much faster/i)).toBeInTheDocument();
    expect(screen.getByText(/Not yet assigned/i)).toBeInTheDocument();

    // Verify NO input/textarea/select edit controls exist for header fields
    expect(screen.queryByRole("textbox", { name: /summary/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /description/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /category/i })).not.toBeInTheDocument();
  });
});
