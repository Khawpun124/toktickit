import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ADMIN, REQUESTER, STAFF, mockServer, renderApp } from "./dashboardTestKit.js";

// Issue 5, ui-spec section 3 and FR-16 as clarified: UI-15 role navigation and landing pages, UI-16
// wrong-role dashboard URLs. Everything renders the real application routes (AppContent), so a
// screen that works alone but is not wired into the app fails here.

const location = () => screen.getByTestId("location").textContent;
const findNav = () => screen.findByRole("navigation", { name: "Main navigation" });
const navLabels = (nav: HTMLElement) => within(nav).getAllByRole("button").map(b => b.textContent?.trim());

async function signIn(email: string) {
  const user = userEvent.setup();
  await screen.findByRole("heading", { name: "TokTickIT Login" });
  await user.type(screen.getByLabelText(/Email address/i), email);
  await user.type(screen.getByLabelText(/^Password$/i), "ChangeMe123!");
  await user.click(screen.getByRole("button", { name: "Sign In" }));
}

async function changePassword() {
  const user = userEvent.setup();
  await screen.findByRole("heading", { name: /Mandatory Password Change/i });
  await user.type(screen.getByLabelText(/Current \(Temporary\) Password/i), "ChangeMe123!");
  await user.type(screen.getByLabelText(/^New Password$/i), "NewPassword123!");
  await user.type(screen.getByLabelText(/^Confirm New Password$/i), "NewPassword123!");
  await user.click(screen.getByRole("button", { name: /Continue/i }));
}

const LANDINGS = [
  { role: "Requester", who: REQUESTER, path: "/tickets", heading: "My Tickets" },
  { role: "IT Staff", who: STAFF, path: "/staff/dashboard", heading: "Welcome back, Quinn" },
  { role: "Administrator", who: ADMIN, path: "/staff/dashboard", heading: "Welcome back, Avery" },
];

afterEach(() => {
  vi.restoreAllMocks();
});

describe("UI-15: role navigation and landing pages", () => {
  it("UI-15: a Requester opening / lands on My Tickets, as in Labs 2 and 3", async () => {
    mockServer({ me: REQUESTER });
    renderApp("/");
    expect(await screen.findByRole("heading", { level: 1, name: "My Tickets" })).toBeInTheDocument();
    expect(location()).toBe("/tickets");
  });

  it.each([
    { role: "IT Staff", who: STAFF, heading: "Welcome back, Quinn" },
    { role: "Administrator", who: ADMIN, heading: "Welcome back, Avery" },
  ])("UI-15: an $role opening / lands on the IT Staff Dashboard", async ({ who, heading }) => {
    mockServer({ me: who });
    renderApp("/");
    expect(await screen.findByRole("heading", { level: 1, name: heading })).toBeInTheDocument();
    expect(location()).toBe("/staff/dashboard");
  });

  it.each(LANDINGS)("UI-15: after login the $role lands on $path", async ({ who, path, heading }) => {
    mockServer({ me: null, loginAs: who });
    renderApp("/");
    await signIn(who.email);
    expect(await screen.findByRole("heading", { level: 1, name: heading })).toBeInTheDocument();
    expect(location()).toBe(path);
  });

  it.each([
    { role: "Requester", who: REQUESTER, deepLink: "/tickets/5", path: "/tickets" },
    { role: "IT Staff", who: STAFF, deepLink: "/tickets/5", path: "/staff/dashboard" },
    { role: "Administrator", who: ADMIN, deepLink: "/admin/users", path: "/staff/dashboard" },
  ])("UI-15: the $role signing in from a deep link ($deepLink) still lands on $path", async ({ who, deepLink, path }) => {
    const server = mockServer({ me: null, loginAs: who });
    renderApp(deepLink);
    await signIn(who.email);
    await waitFor(() => expect(location()).toBe(path));
    expect(await screen.findByRole("heading", { level: 1 })).toBeInTheDocument();
    // The deep-linked page was never mounted, so it requested nothing and could not redirect afterwards
    expect(server.count("GET /api/tickets/5")).toBe(0);
    expect(server.count("GET /api/admin/users")).toBe(0);
  });

  it.each(LANDINGS)("UI-15: after the mandatory password change the $role lands on $path", async ({ who, path, heading }) => {
    mockServer({ me: null, loginAs: { ...who, mustChangePassword: true } });
    renderApp("/dashboard");
    await signIn(who.email);
    await changePassword();
    expect(await screen.findByRole("heading", { level: 1, name: heading })).toBeInTheDocument();
    expect(location()).toBe(path);
  });

  it("UI-15: reopening a page with a restored session keeps that page (no redirect on page load)", async () => {
    mockServer({ me: STAFF });
    renderApp("/staff/tickets?currentStatus=NEW");
    expect(await screen.findByRole("heading", { level: 1, name: "My Queue" })).toBeInTheDocument();
    expect(location()).toBe("/staff/tickets?currentStatus=NEW");
  });

  it.each([
    { role: "Requester", who: REQUESTER, start: "/tickets", labels: ["Dashboard", "My Tickets", "+ Create Ticket"] },
    { role: "IT Staff", who: STAFF, start: "/staff/dashboard", labels: ["Dashboard", "My Queue", "+ Create Ticket"] },
    { role: "Administrator", who: ADMIN, start: "/staff/dashboard", labels: ["Dashboard", "My Queue", "Admin / User Management"] },
  ])("UI-15: the $role navigation is buttons with the old labels and Dashboard first, wrapping instead of a menu", async ({ who, start, labels }) => {
    mockServer({ me: who });
    renderApp(start);
    const nav = await findNav();
    expect(navLabels(nav)).toEqual(labels);
    expect(nav).toHaveClass("flex-wrap");
    expect(within(nav).queryAllByRole("link")).toHaveLength(0);
    // No hamburger: nothing collapses the entries behind a toggle
    expect(document.querySelector("header [aria-expanded], header .navbar-toggler, header .collapse")).toBeNull();
  });

  it("UI-15: the active entry carries aria-current=\"page\" and moves as the user navigates", async () => {
    const user = userEvent.setup();
    mockServer({ me: STAFF });
    renderApp("/staff/dashboard");
    const nav = await findNav();
    const current = () => within(nav).getAllByRole("button").filter(b => b.getAttribute("aria-current") === "page").map(b => b.textContent);
    expect(current()).toEqual(["Dashboard"]);
    await user.click(within(nav).getByRole("button", { name: "My Queue" }));
    await waitFor(() => expect(location()).toBe("/staff/tickets"));
    expect(current()).toEqual(["My Queue"]);
    await user.click(within(nav).getByRole("button", { name: "Dashboard" }));
    await waitFor(() => expect(location()).toBe("/staff/dashboard"));
    expect(current()).toEqual(["Dashboard"]);
  });

  it("UI-15: the Requester's Dashboard entry opens /dashboard and is marked current there", async () => {
    const user = userEvent.setup();
    mockServer({ me: REQUESTER });
    renderApp("/tickets");
    const nav = await findNav();
    expect(within(nav).getByRole("button", { name: "My Tickets" })).toHaveAttribute("aria-current", "page");
    await user.click(within(nav).getByRole("button", { name: "Dashboard" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Welcome, Robin" })).toBeInTheDocument();
    expect(location()).toBe("/dashboard");
    expect(within(nav).getByRole("button", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("button", { name: "My Tickets" })).not.toHaveAttribute("aria-current");
  });
});

describe("UI-16: a dashboard route of another role", () => {
  it.each([
    { role: "Requester", who: REQUESTER, typed: "/staff/dashboard", own: "/dashboard", heading: "Welcome, Robin" },
    { role: "IT Staff", who: STAFF, typed: "/dashboard", own: "/staff/dashboard", heading: "Welcome back, Quinn" },
    { role: "Administrator", who: ADMIN, typed: "/dashboard", own: "/staff/dashboard", heading: "Welcome back, Avery" },
  ])("UI-16: the $role typing $typed is redirected to $own with a notification", async ({ who, typed, own, heading }) => {
    const server = mockServer({ me: who });
    renderApp(typed);
    expect(await screen.findByRole("heading", { level: 1, name: heading })).toBeInTheDocument();
    expect(location()).toBe(own);
    const notice = screen.getByText("You do not have access to that page.");
    expect(notice).toHaveAttribute("role", "status");
    // The other role's dashboard API was never called
    const otherApi = typed === "/dashboard" ? "GET /api/dashboard/requester" : "GET /api/dashboard/staff";
    expect(server.count(otherApi)).toBe(0);
  });

  it("UI-16: a 403 from the dashboard API shows a readable message, never raw JSON", async () => {
    mockServer({
      me: STAFF,
      routes: { "GET /api/dashboard/staff": () => ({ status: 403, body: { error: "Forbidden", code: "FORBIDDEN" } }) },
    });
    renderApp("/staff/dashboard");
    expect(await screen.findByRole("alert")).toHaveTextContent("You do not have access to that page.");
    expect(screen.getByRole("main").textContent).not.toMatch(/FORBIDDEN|"error"|\{/);
  });
});
