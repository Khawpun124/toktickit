import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import React from "react";
import App from "../../src/App.js";
import * as api from "../../src/api.js";

describe("App", () => {
  const mockUser: api.AuthUser = {
    id: 1,
    name: "Jennifer Anderson",
    email: "jennifer.anderson@example.com",
    role: "REQUESTER",
    mustChangePassword: false,
  };

  const mockCategories = [
    { id: 1, name: "Account and Access" },
    { id: 2, name: "Hardware" },
    { id: 3, name: "Software" },
    { id: 4, name: "Network" },
  ];

  const mockSystems = [
    { id: 1, name: "Email" },
  ];

  beforeEach(() => {
    window.history.pushState({}, "", "/");
    vi.restoreAllMocks();
    vi.spyOn(api, "getCategories").mockResolvedValue(mockCategories);
    vi.spyOn(api, "getRelatedSystems").mockResolvedValue(mockSystems);
    vi.spyOn(api, "getTickets").mockResolvedValue({
      data: [],
      pagination: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 },
    });
  });

  it("renders the TokTickIT heading", async () => {
    vi.spyOn(api, "getMe").mockRejectedValue(new Error("Unauthenticated"));
    render(<App />);
    await waitFor(() => {
      expect(screen.getAllByText(/TokTickIT/i).length).toBeGreaterThan(0);
    });
  });

  it("shows Login screen when user is unauthenticated", async () => {
    vi.spyOn(api, "getMe").mockRejectedValue(new Error("Unauthenticated"));
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText(/TokTickIT Login/i)).toBeInTheDocument();
    });
  });

  it("renders Create Support Ticket screen when authenticated user is active", async () => {
    vi.spyOn(api, "getMe").mockResolvedValue(mockUser);
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /My Tickets/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByRole("button", { name: /\+ Create Ticket/i })[0]);

    await waitFor(() => {
      expect(screen.getByText(/Create Support Ticket/i)).toBeInTheDocument();
    });
  });

  it("displays category list in Create Ticket form when category fetch succeeds", async () => {
    vi.spyOn(api, "getMe").mockResolvedValue(mockUser);
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /My Tickets/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByRole("button", { name: /\+ Create Ticket/i })[0]);

    await waitFor(() => {
      expect(screen.getByRole("option", { name: "Account and Access" })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "Hardware" })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "Software" })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "Network" })).toBeInTheDocument();
    });
  });
});



