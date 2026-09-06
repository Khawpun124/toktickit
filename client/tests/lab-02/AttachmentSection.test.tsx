import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { RequesterTicketDetailScreen } from "../../src/components/RequesterTicketDetailScreen.js";
import { RequesterProvider } from "../../src/context/RequesterContext.js";
import * as api from "../../src/api.js";

describe("AttachmentSection (UI-11, UI-12)", () => {
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
    description: "My laptop battery is draining much faster than usual.",
    requestedPriority: "MEDIUM",
    itPriority: null,
    currentStatus: "NEW",
    createdAt: "2026-08-20T09:14:00.000Z",
    updatedAt: "2026-08-20T09:14:00.000Z",
  };

  const activeAttachment: api.AttachmentItem = {
    id: 501,
    fileName: "battery_report.pdf",
    sizeBytes: 843211,
    uploadedAt: "2026-08-20T09:16:00.000Z",
    removedAt: null,
    removedReason: null,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    sessionStorage.setItem("toktickit_selected_requester", JSON.stringify(mockRequester));
    vi.spyOn(api, "getTicket").mockResolvedValue(mockTicket);
  });

  it("UI-11: soft-removes attachment in UI, displaying removed metadata and disabling download (AC-08)", async () => {
    vi.spyOn(api, "getAttachments").mockResolvedValue([activeAttachment]);
    vi.spyOn(api, "deleteAttachment").mockResolvedValue({
      id: 501,
      fileName: "battery_report.pdf",
      removedAt: "2026-08-20T10:00:00.000Z",
      removedReason: "Uploaded wrong document",
    });

    render(
      <RequesterProvider>
        <RequesterTicketDetailScreen ticketId={101} onBack={() => {}} />
      </RequesterProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("battery_report.pdf")).toBeInTheDocument();
    });

    // Click Remove button
    const removeBtn = screen.getByRole("button", { name: /Remove battery_report.pdf/i });
    fireEvent.click(removeBtn);

    // Enter reason and confirm
    await waitFor(() => {
      expect(screen.getByText(/Remove Attachment/i)).toBeInTheDocument();
    });

    const reasonInput = screen.getByPlaceholderText(/Enter reason for removing/i);
    fireEvent.change(reasonInput, { target: { value: "Uploaded wrong document" } });

    const confirmBtn = screen.getByRole("button", { name: /Confirm Removal/i });
    fireEvent.click(confirmBtn);

    // Expect attachment to show as removed badge with reason, and Download link removed
    await waitFor(() => {
      expect(screen.getByText(/Uploaded wrong document/i)).toBeInTheDocument();
      expect(screen.getByText("Removed")).toBeInTheDocument();
    });

    expect(screen.queryByRole("link", { name: /Download battery_report.pdf/i })).not.toBeInTheDocument();
  });

  it("UI-12: rejects oversized file selection client-side before upload attempt (AC-06)", async () => {
    vi.spyOn(api, "getAttachments").mockResolvedValue([]);
    const uploadSpy = vi.spyOn(api, "uploadAttachment");

    render(
      <RequesterProvider>
        <RequesterTicketDetailScreen ticketId={101} onBack={() => {}} />
      </RequesterProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/Attachments \(/i)).toBeInTheDocument();
    });

    // Create a 6MB dummy file
    const oversizedFile = new File([new ArrayBuffer(6 * 1024 * 1024)], "large.pdf", {
      type: "application/pdf",
    });

    const fileInput = screen.getByLabelText(/Upload Attachment/i);
    fireEvent.change(fileInput, { target: { files: [oversizedFile] } });

    await waitFor(() => {
      expect(screen.getByText(/File exceeds the 5 MB limit/i)).toBeInTheDocument();
    });

    // Verify upload API was NOT called
    expect(uploadSpy).not.toHaveBeenCalled();
  });
});
