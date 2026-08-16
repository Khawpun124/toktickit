import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import App from "../../src/App.js";
import * as api from "../../src/api.js";

describe("App", () => {
  it("renders the TokTickIT heading", () => {
    render(<App />);
    expect(screen.getByText(/TokTickIT/i)).toBeInTheDocument();
  });

  it("shows loading state and System Status: Online when health check succeeds", async () => {
    vi.spyOn(api, "checkHealth").mockResolvedValue({ status: "ok", service: "TokTickIT API" });
    vi.spyOn(api, "getCategories").mockResolvedValue([]);
    render(<App />);

    const button = screen.getByRole("button", { name: /Check System/i });
    fireEvent.click(button);

    expect(button).toBeDisabled();
    expect(screen.getByText(/Loading/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/System Status: Online/i)).toBeInTheDocument();
    });
  });

  it("shows System Status: Offline and error message when the API is unavailable", async () => {
    vi.spyOn(api, "checkHealth").mockRejectedValue(new Error("Unable to connect to TokTickIT API"));
    render(<App />);

    const button = screen.getByRole("button", { name: /Check System/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText(/System Status: Offline/i)).toBeInTheDocument();
      expect(screen.getByText(/Unable to connect to TokTickIT API/i)).toBeInTheDocument();
    });
  });

  it("displays category list when system check and category fetch succeed", async () => {
    vi.spyOn(api, "checkHealth").mockResolvedValue({ status: "ok", service: "TokTickIT API" });
    vi.spyOn(api, "getCategories").mockResolvedValue([
      { id: 1, name: "Account and Access" },
      { id: 2, name: "Hardware" },
      { id: 3, name: "Software" },
      { id: 4, name: "Network" },
    ]);
    render(<App />);

    const button = screen.getByRole("button", { name: /Check System/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText(/System Status: Online/i)).toBeInTheDocument();
      expect(screen.getByText(/Supported Request Categories:/i)).toBeInTheDocument();
      expect(screen.getByText("Account and Access")).toBeInTheDocument();
      expect(screen.getByText("Hardware")).toBeInTheDocument();
      expect(screen.getByText("Software")).toBeInTheDocument();
      expect(screen.getByText("Network")).toBeInTheDocument();
    });
  });
});
