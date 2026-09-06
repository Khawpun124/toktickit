import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { CreateTicketScreen } from "../../src/components/CreateTicketScreen.js";
import { RequesterProvider } from "../../src/context/RequesterContext.js";
import * as api from "../../src/api.js";


describe("CreateTicketScreen (UI-03..UI-06, STYLE-01, STYLE-02)", () => {
  const mockRequester: api.RequesterUser = {
    id: 1,
    name: "Jennifer Anderson",
    email: "jennifer.anderson@example.com",
  };

  const mockCategories: api.Category[] = [
    { id: 1, name: "Account and Access" },
    { id: 2, name: "Hardware" },
  ];

  const mockRelatedSystems: api.RelatedSystem[] = [
    { id: 1, name: "Email" },
    { id: 2, name: "Campus Wi-Fi" },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    sessionStorage.setItem("toktickit_selected_requester", JSON.stringify(mockRequester));
    vi.spyOn(api, "getRequesters").mockResolvedValue([mockRequester]);
    vi.spyOn(api, "getCategories").mockResolvedValue(mockCategories);
    vi.spyOn(api, "getRelatedSystems").mockResolvedValue(mockRelatedSystems);
  });

  it("UI-03 & STYLE-01: shows field-level error message directly below Summary input when Summary < 5 chars without calling API (AC-04, BR-15)", async () => {
    const createSpy = vi.spyOn(api, "createTicket");

    render(
      <MemoryRouter>
        <RequesterProvider>
          <CreateTicketScreen />
        </RequesterProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/Summary/i)).toBeInTheDocument();
    });

    const summaryInput = screen.getByLabelText(/Summary/i);
    fireEvent.change(summaryInput, { target: { value: "Help" } });

    const submitButton = screen.getByRole("button", { name: /Submit Ticket/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(
        screen.getByText("Summary must be between 5 and 150 characters")
      ).toBeInTheDocument();
    });

    // Verify no API call was made for client-side validation failure
    expect(createSpy).not.toHaveBeenCalled();

    // Verify asterisk is present near Summary label (STYLE-01)
    const summaryLabel = screen.getByText((content, element) => {
      return element?.tagName.toLowerCase() === "label" && /Summary/i.test(content);
    });
    expect(summaryLabel.textContent).toContain("*");
  });

  it("UI-04: submits valid ticket data and displays official Ticket Number (AC-01)", async () => {
    const createdTicket: api.Ticket = {
      id: 101,
      ticketNumber: "TKT-2026-000042",
      requesterId: 1,
      categoryId: 1,
      relatedSystemId: 1,
      summary: "Laptop battery drains quickly",
      description: "My laptop battery is draining much faster than usual during normal usage.",
      requestedPriority: "MEDIUM",
      itPriority: null,
      currentStatus: "NEW",
      createdAt: "2026-08-20T09:14:00.000Z",
      updatedAt: "2026-08-20T09:14:00.000Z",
      attachmentUploadErrors: [],
    };

    vi.spyOn(api, "createTicket").mockResolvedValue(createdTicket);

    render(
      <MemoryRouter>
        <RequesterProvider>
          <CreateTicketScreen />
        </RequesterProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/Summary/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/Summary/i), {
      target: { value: "Laptop battery drains quickly" },
    });
    fireEvent.change(screen.getByLabelText(/Description/i), {
      target: { value: "My laptop battery is draining much faster than usual during normal usage." },
    });

    const submitButton = screen.getByRole("button", { name: /Submit Ticket/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/Ticket Created Successfully!/i)).toBeInTheDocument();
      expect(screen.getByText("TKT-2026-000042")).toBeInTheDocument();
    });
  });

  it("UI-05: handles backend failure, displays safe error message, and preserves entered field values (AC-11, BR-19, BR-20)", async () => {
    vi.spyOn(api, "createTicket").mockRejectedValue(
      new Error("Unable to connect to TokTickIT API")
    );

    render(
      <MemoryRouter>
        <RequesterProvider>
          <CreateTicketScreen />
        </RequesterProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/Summary/i)).toBeInTheDocument();
    });

    const summaryValue = "Valid summary testing backend error";
    const descValue = "Detailed description testing data preservation on failure.";

    fireEvent.change(screen.getByLabelText(/Summary/i), {
      target: { value: summaryValue },
    });
    fireEvent.change(screen.getByLabelText(/Description/i), {
      target: { value: descValue },
    });

    const submitButton = screen.getByRole("button", { name: /Submit Ticket/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/Unable to connect to TokTickIT API/i)).toBeInTheDocument();
    });

    // Entered field values must be preserved
    expect((screen.getByLabelText(/Summary/i) as HTMLInputElement).value).toBe(summaryValue);
    expect((screen.getByLabelText(/Description/i) as HTMLTextAreaElement).value).toBe(descValue);
  });

  it("UI-06: shows busy state and disables submit button during flight (BR-18)", async () => {
    let resolvePromise: (value: api.Ticket) => void;
    const pendingPromise = new Promise<api.Ticket>((resolve) => {
      resolvePromise = resolve;
    });

    vi.spyOn(api, "createTicket").mockReturnValue(pendingPromise);

    render(
      <MemoryRouter>
        <RequesterProvider>
          <CreateTicketScreen />
        </RequesterProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/Summary/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/Summary/i), {
      target: { value: "Summary for busy state test" },
    });
    fireEvent.change(screen.getByLabelText(/Description/i), {
      target: { value: "Detailed description for busy state test." },
    });

    const submitButton = screen.getByRole("button", { name: /Submit Ticket/i });
    fireEvent.click(submitButton);

    // Button should be disabled and show busy text during flight
    expect(submitButton).toBeDisabled();
    expect(submitButton.textContent).toMatch(/Submitting/i);

    // Resolve the promise
    resolvePromise!({
      id: 102,
      ticketNumber: "TKT-2026-000043",
      requesterId: 1,
      categoryId: 1,
      relatedSystemId: 1,
      summary: "Summary for busy state test",
      description: "Detailed description for busy state test.",
      requestedPriority: "MEDIUM",
      itPriority: null,
      currentStatus: "NEW",
      createdAt: "2026-08-20T09:14:00.000Z",
      updatedAt: "2026-08-20T09:14:00.000Z",
      attachmentUploadErrors: [],
    });

    await waitFor(() => {
      expect(screen.getByText("TKT-2026-000043")).toBeInTheDocument();
    });
  });

  it("STYLE-02: visually distinguishes read-only fields from editable fields", async () => {
    render(
      <MemoryRouter>
        <RequesterProvider>
          <CreateTicketScreen />
        </RequesterProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/Ticket Number/i)).toBeInTheDocument();
    });

    const readOnlyTicketNumber = screen.getByLabelText(/Ticket Number/i);
    expect(readOnlyTicketNumber).toHaveAttribute("readOnly");
    expect(readOnlyTicketNumber.className).toMatch(/bg-light|zg-field-readonly/);
  });

  it("AC-05: uploads valid attachment files after creating ticket upon submission", async () => {
    const createdTicket: api.Ticket = {
      id: 101,
      ticketNumber: "TKT-2026-000042",
      requesterId: 1,
      categoryId: 1,
      relatedSystemId: 1,
      summary: "Ticket with attachment test",
      description: "Detailed description for ticket creation with attachment.",
      requestedPriority: "MEDIUM",
      itPriority: null,
      currentStatus: "NEW",
      createdAt: "2026-08-20T09:14:00.000Z",
      updatedAt: "2026-08-20T09:14:00.000Z",
      attachmentUploadErrors: [],
    };

    vi.spyOn(api, "createTicket").mockResolvedValue(createdTicket);
    const uploadSpy = vi.spyOn(api, "uploadAttachment").mockResolvedValue({
      id: 1,
      ticketId: 101,
      fileName: "screenshot.png",
      filePath: "uploads/attachments/101-screenshot.png",
      fileType: "image/png",
      sizeBytes: 1024,
      uploadedAt: "2026-08-20T09:14:00.000Z",
      removedAt: null,
      removedReason: null,
    });

    render(
      <MemoryRouter>
        <RequesterProvider>
          <CreateTicketScreen />
        </RequesterProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/Summary/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/Summary/i), {
      target: { value: "Ticket with attachment test" },
    });
    fireEvent.change(screen.getByLabelText(/Description/i), {
      target: { value: "Detailed description for ticket creation with attachment." },
    });

    const validFile = new File(["dummy content"], "screenshot.png", { type: "image/png" });
    const fileInput = screen.getByLabelText(/Upload Attachment/i);
    fireEvent.change(fileInput, { target: { files: [validFile] } });

    expect(screen.getByText("screenshot.png")).toBeInTheDocument();

    const submitButton = screen.getByRole("button", { name: /Submit Ticket/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/Ticket Created Successfully!/i)).toBeInTheDocument();
      expect(uploadSpy).toHaveBeenCalledWith(101, validFile, 1);
    });
  });

  it("BR-21 & BR-22: displays client-side error immediately when selecting file with invalid type or oversized file (>5MB) before submission", async () => {
    const createSpy = vi.spyOn(api, "createTicket");

    render(
      <MemoryRouter>
        <RequesterProvider>
          <CreateTicketScreen />
        </RequesterProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/Summary/i)).toBeInTheDocument();
    });

    const fileInput = screen.getByLabelText(/Upload Attachment/i);

    // Invalid type (.docx)
    const invalidTypeFile = new File(["dummy content"], "document.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    fireEvent.change(fileInput, { target: { files: [invalidTypeFile] } });

    expect(screen.getByText(/Only JPG, PNG, WEBP, and PDF files are allowed/i)).toBeInTheDocument();
    expect(createSpy).not.toHaveBeenCalled();

    // Oversized file (> 5MB)
    const oversizedBuffer = new ArrayBuffer(6 * 1024 * 1024);
    const oversizedFile = new File([oversizedBuffer], "large_file.pdf", { type: "application/pdf" });
    fireEvent.change(fileInput, { target: { files: [oversizedFile] } });

    expect(screen.getByText(/File exceeds the 5 MB limit/i)).toBeInTheDocument();
    expect(createSpy).not.toHaveBeenCalled();
  });

  it("BR-23: displays client-side error when attempting to attach more than 5 files", async () => {
    render(
      <MemoryRouter>
        <RequesterProvider>
          <CreateTicketScreen />
        </RequesterProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/Summary/i)).toBeInTheDocument();
    });

    const fileInput = screen.getByLabelText(/Upload Attachment/i);
    const files = Array.from({ length: 6 }, (_, i) =>
      new File(["content"], `file_${i + 1}.png`, { type: "image/png" })
    );

    fireEvent.change(fileInput, { target: { files } });

    expect(screen.getByText(/A ticket may have at most 5 active attachments/i)).toBeInTheDocument();
  });

  it("BR-27: preserves created ticket when attachment upload fails and displays per-file upload warning on success screen", async () => {
    const createdTicket: api.Ticket = {
      id: 105,
      ticketNumber: "TKT-2026-000099",
      requesterId: 1,
      categoryId: 1,
      relatedSystemId: 1,
      summary: "Ticket with failing attachment test",
      description: "Description for testing partial attachment upload failure.",
      requestedPriority: "MEDIUM",
      itPriority: null,
      currentStatus: "NEW",
      createdAt: "2026-08-20T09:14:00.000Z",
      updatedAt: "2026-08-20T09:14:00.000Z",
      attachmentUploadErrors: [],
    };

    vi.spyOn(api, "createTicket").mockResolvedValue(createdTicket);
    vi.spyOn(api, "uploadAttachment").mockRejectedValue(new Error("File failed virus check"));

    render(
      <MemoryRouter>
        <RequesterProvider>
          <CreateTicketScreen />
        </RequesterProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/Summary/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/Summary/i), {
      target: { value: "Ticket with failing attachment test" },
    });
    fireEvent.change(screen.getByLabelText(/Description/i), {
      target: { value: "Description for testing partial attachment upload failure." },
    });

    const validFile = new File(["dummy content"], "bad_file.png", { type: "image/png" });
    const fileInput = screen.getByLabelText(/Upload Attachment/i);
    fireEvent.change(fileInput, { target: { files: [validFile] } });

    const submitButton = screen.getByRole("button", { name: /Submit Ticket/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/Ticket Created Successfully!/i)).toBeInTheDocument();
      expect(screen.getByText("TKT-2026-000099")).toBeInTheDocument();
      expect(screen.getByText(/Attachment Warning/i)).toBeInTheDocument();
      expect(screen.getByText("bad_file.png")).toBeInTheDocument();
      expect(screen.getByText(/File failed virus check/i)).toBeInTheDocument();
    });
  });
});

