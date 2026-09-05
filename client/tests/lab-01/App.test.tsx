import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";
import App from "../../src/App.js";
import * as api from "../../src/api.js";

describe("App", () => {
  const mockRequester = {
    id: 1,
    name: "Jennifer Anderson",
    email: "jennifer.anderson@example.com",
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
    vi.restoreAllMocks();
    sessionStorage.clear();
    vi.spyOn(api, "getRequesters").mockResolvedValue([mockRequester]);
    vi.spyOn(api, "getCategories").mockResolvedValue(mockCategories);
    vi.spyOn(api, "getRelatedSystems").mockResolvedValue(mockSystems);
  });

  it("renders the TokTickIT heading", async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getAllByText(/TokTickIT/i).length).toBeGreaterThan(0);
    });
  });


  it("shows Requester Selection screen when no requester is selected", async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText(/Select Development Requester/i)).toBeInTheDocument();
    });
  });

  it("renders Create Support Ticket screen when requester context is active", async () => {
    sessionStorage.setItem("toktickit_selected_requester", JSON.stringify(mockRequester));
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/Create Support Ticket/i)).toBeInTheDocument();
    });
  });

  it("displays category list in Create Ticket form when category fetch succeeds", async () => {
    sessionStorage.setItem("toktickit_selected_requester", JSON.stringify(mockRequester));
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("option", { name: "Account and Access" })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "Hardware" })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "Software" })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "Network" })).toBeInTheDocument();
    });
  });
});



