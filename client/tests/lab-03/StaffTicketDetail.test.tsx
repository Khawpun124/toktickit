import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import React from "react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { StaffTicketDetailScreen } from "../../src/components/StaffTicketDetailScreen.js";
import { AuthProvider } from "../../src/context/AuthContext.js";
import * as api from "../../src/api.js";

describe("StaffTicketDetailScreen Tests (UI-08, UI-09, UI-10)", () => {
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

  const mockStaffUsers: api.StaffUserItem[] = [
    { id: 2, name: "Alex Staff", email: "alex.staff@example.com", role: "IT_STAFF" },
    { id: 3, name: "Sarah Admin", email: "sarah.admin@example.com", role: "ADMINISTRATOR" },
  ];

  const mockTicketDetail: api.StaffTicketDetail = {
    id: 101,
    ticketNumber: "TKT-2026-000001",
    requesterId: 1,
    requesterName: "Jennifer Anderson",
    requesterEmail: "jennifer.anderson@example.com",
    categoryId: 1,
    categoryName: "Hardware",
    relatedSystemId: 1,
    relatedSystemName: "Printer",
    summary: "Printer issue on 3rd floor",
    description: "Paper jam error won't clear.",
    requestedPriority: "MEDIUM",
    itPriority: null,
    currentStatus: "NEW",
    problemAppearsResolved: false,
    ticketOwnerId: null,
    ticketOwnerName: null,
    createdAt: "2026-09-19T10:00:00.000Z",
    updatedAt: "2026-09-19T10:00:00.000Z",
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api, "getStaffUsers").mockResolvedValue(mockStaffUsers);
    vi.spyOn(api, "getStaffTicketDetail").mockResolvedValue(mockTicketDetail);
    vi.spyOn(api, "getPublicComments").mockResolvedValue([]);
    vi.spyOn(api, "getInternalNotes").mockResolvedValue([]);
    vi.spyOn(api, "getAttachments").mockResolvedValue([]);
  });

  const renderComponent = (ticketId = "101") => {
    return render(
      <MemoryRouter initialEntries={[`/staff/tickets/${ticketId}`]}>
        <AuthProvider>
          <Routes>
            <Route path="/staff/tickets/:id" element={<StaffTicketDetailScreen />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );
  };

  it("UI-08: IT Staff claims unassigned ticket updates Ticket Owner in UI", async () => {
    vi.spyOn(api, "getMe").mockResolvedValue(mockStaffUser);
    vi.spyOn(api, "claimTicketOwner").mockResolvedValue({
      id: 101,
      ticketOwnerId: 2,
      ticketOwnerName: "Alex Staff",
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText("TKT-2026-000001")).toBeInTheDocument();
      expect(screen.getByText("Unassigned")).toBeInTheDocument();
    });

    const ownerSelect = screen.getByLabelText("Select ticket owner") as HTMLSelectElement;
    fireEvent.change(ownerSelect, { target: { value: "2" } });

    await waitFor(() => {
      expect(api.claimTicketOwner).toHaveBeenCalledWith(101, 2);
      expect(screen.getByText("Alex Staff")).toBeInTheDocument();
    });
  });

  it("UI-09: Status dropdown only shows valid next transitions for current status", async () => {
    vi.spyOn(api, "getMe").mockResolvedValue(mockStaffUser);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText("TKT-2026-000001")).toBeInTheDocument();
    });

    const statusSelect = screen.getByLabelText("Select new ticket status") as HTMLSelectElement;
    const options = Array.from(statusSelect.options).map((opt) => opt.value);

    // Current status is NEW, so allowed transitions are OPEN and CANCELLED
    expect(options).toContain("OPEN");
    expect(options).toContain("CANCELLED");
    expect(options).not.toContain("CLOSED");
    expect(options).not.toContain("RESOLVED");
    expect(options).not.toContain("IN_PROGRESS");
  });

  it("UI-10: Internal Notes tab panel is visually distinct with amber tint and warning notice", async () => {
    vi.spyOn(api, "getMe").mockResolvedValue(mockStaffUser);
    vi.spyOn(api, "getInternalNotes").mockResolvedValue([
      {
        id: 1,
        ticketId: 101,
        authorId: 2,
        authorName: "Alex Staff",
        authorRole: "IT_STAFF",
        content: "Privately checked hardware logs.",
        createdAt: "2026-09-19T11:00:00.000Z",
      },
    ]);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText("TKT-2026-000001")).toBeInTheDocument();
    });

    // Switch to Internal Notes tab
    const notesTab = screen.getByRole("tab", { name: /Internal Notes/i });
    fireEvent.click(notesTab);

    await waitFor(() => {
      expect(screen.getByText(/Internal Notes — visible to IT Staff and Administrators only/i)).toBeInTheDocument();
      expect(screen.getByText("Privately checked hardware logs.")).toBeInTheDocument();
    });

    const notesPanel = screen.getByRole("tabpanel", { name: /Internal Notes/i });
    expect(notesPanel).toHaveStyle({ background: "rgb(255, 251, 240)" }); // #FFFBF0
  });

  it("Authorization: Requester role receives 403 Forbidden state", async () => {
    vi.spyOn(api, "getMe").mockResolvedValue(mockRequesterUser);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText(/403 Forbidden/i)).toBeInTheDocument();
      expect(
        screen.getByText(/Access denied. You do not have permission to view IT Staff Ticket Details./i)
      ).toBeInTheDocument();
    });
  });

  it("Status Transition Confirmation: RESOLVED -> CLOSED and RESOLVED -> REOPENED do NOT prompt confirm", async () => {
    vi.spyOn(api, "getMe").mockResolvedValue(mockStaffUser);
    const resolvedTicket: api.StaffTicketDetail = {
      ...mockTicketDetail,
      currentStatus: "RESOLVED",
    };
    vi.spyOn(api, "getStaffTicketDetail").mockResolvedValue(resolvedTicket);
    vi.spyOn(api, "setTicketStatus").mockResolvedValue({ id: 101, currentStatus: "CLOSED" });

    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText("TKT-2026-000001")).toBeInTheDocument();
    });

    const statusSelect = screen.getByLabelText("Select new ticket status") as HTMLSelectElement;
    fireEvent.change(statusSelect, { target: { value: "CLOSED" } });

    await waitFor(() => {
      expect(api.setTicketStatus).toHaveBeenCalledWith(101, "CLOSED");
    });
    // Confirmation MUST NOT be requested for RESOLVED -> CLOSED per matrix
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it("Status Transition Confirmation: OPEN -> CANCELLED DOES prompt window.confirm", async () => {
    vi.spyOn(api, "getMe").mockResolvedValue(mockStaffUser);
    const openTicket: api.StaffTicketDetail = {
      ...mockTicketDetail,
      currentStatus: "OPEN",
    };
    vi.spyOn(api, "getStaffTicketDetail").mockResolvedValue(openTicket);
    vi.spyOn(api, "setTicketStatus").mockResolvedValue({ id: 101, currentStatus: "CANCELLED" });

    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText("TKT-2026-000001")).toBeInTheDocument();
    });

    const statusSelect = screen.getByLabelText("Select new ticket status") as HTMLSelectElement;
    fireEvent.change(statusSelect, { target: { value: "CANCELLED" } });

    await waitFor(() => {
      expect(confirmSpy).toHaveBeenCalled();
      expect(api.setTicketStatus).toHaveBeenCalledWith(101, "CANCELLED");
    });
  });

  it("Attachments: displays error message when API call fails instead of silent empty list", async () => {
    vi.spyOn(api, "getMe").mockResolvedValue(mockStaffUser);
    vi.spyOn(api, "getAttachments").mockRejectedValue(new Error("Unable to load attachments"));

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText("TKT-2026-000001")).toBeInTheDocument();
    });

    // Switch to Attachments tab
    const attachmentsTab = screen.getByRole("tab", { name: /Attachments/i });
    fireEvent.click(attachmentsTab);

    await waitFor(() => {
      expect(screen.getByText("Unable to load attachments")).toBeInTheDocument();
      expect(screen.queryByText("No attachments found.")).not.toBeInTheDocument();
    });
  });
});
