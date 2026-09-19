import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { RequesterTicketDetailScreen } from "../../src/components/RequesterTicketDetailScreen.js";
import { AuthProvider } from "../../src/context/AuthContext.js";
import * as api from "../../src/api.js";

describe("RequesterTicketDetailScreen Lab 3 Additions (Public Comments & Resolution Flag)", () => {
  const mockUser: api.AuthUser = {
    id: 1,
    name: "Jennifer Anderson",
    email: "jennifer.anderson@example.com",
    role: "REQUESTER",
    mustChangePassword: false,
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
    problemAppearsResolved: false,
    createdAt: "2026-08-20T09:14:00.000Z",
    updatedAt: "2026-08-20T09:14:00.000Z",
  };

  const mockComment: api.PublicComment = {
    id: 1,
    ticketId: 101,
    authorId: 1,
    authorName: "Jennifer Anderson",
    authorRole: "REQUESTER",
    content: "I tested restarting and the issue persists.",
    createdAt: "2026-08-20T10:00:00.000Z",
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api, "getMe").mockResolvedValue(mockUser);
    vi.spyOn(api, "getTicket").mockResolvedValue(mockTicket);
    vi.spyOn(api, "getAttachments").mockResolvedValue([]);
    vi.spyOn(api, "getPublicComments").mockResolvedValue([mockComment]);
  });

  it("renders Public Comments thread and posts a new comment", async () => {
    const postSpy = vi.spyOn(api, "postPublicComment").mockResolvedValue({
      id: 2,
      ticketId: 101,
      authorId: 1,
      authorName: "Jennifer Anderson",
      authorRole: "REQUESTER",
      content: "Another comment for testing",
      createdAt: new Date().toISOString(),
    });

    render(
      <MemoryRouter>
        <AuthProvider>
          <RequesterTicketDetailScreen ticketId={101} onBack={() => {}} />
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("I tested restarting and the issue persists.")).toBeInTheDocument();
    });

    // Check Public Comments heading
    expect(screen.getByText(/Public Comments \(1\)/i)).toBeInTheDocument();

    // Verify Internal Notes is NOT rendered anywhere
    expect(screen.queryByText(/Internal Notes/i)).not.toBeInTheDocument();

    // Enter text in comment box
    const commentInput = screen.getByPlaceholderText(/Write a public comment.../i);
    fireEvent.change(commentInput, { target: { value: "Another comment for testing" } });

    // Submit form
    const submitBtn = screen.getByRole("button", { name: /\+ Post Comment/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith(101, "Another comment for testing");
      expect(screen.getByText("Another comment for testing")).toBeInTheDocument();
    });
  });

  it("shows 'Mark problem as resolved' button and updates status badge after confirmation modal", async () => {
    const resolveSpy = vi.spyOn(api, "updateResolutionFlag").mockResolvedValue({
      id: 101,
      problemAppearsResolved: true,
    });

    render(
      <MemoryRouter>
        <AuthProvider>
          <RequesterTicketDetailScreen ticketId={101} onBack={() => {}} />
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Mark problem as resolved")).toBeInTheDocument();
    });

    // Click "Mark problem as resolved" button
    fireEvent.click(screen.getByText("Mark problem as resolved"));

    // Confirmation modal should appear
    expect(screen.getByText("Mark Problem as Resolved")).toBeInTheDocument();

    // Click "Confirm Resolution" button in modal
    fireEvent.click(screen.getByRole("button", { name: /Confirm Resolution/i }));

    await waitFor(() => {
      expect(resolveSpy).toHaveBeenCalledWith(101);
      expect(screen.getByText("✓ Problem Appears Resolved")).toBeInTheDocument();
    });
  });
});
