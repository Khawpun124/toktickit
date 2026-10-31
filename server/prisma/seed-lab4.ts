import { ActionStatus, Priority, Role, TicketStatus, type PrismaClient } from "@prisma/client";

/**
 * Lab 4 seed data (BR-38, AC-27): dedicated users for each Lab 4 end-to-end spec and a set
 * of Tickets with Actions Taken that covers every status, every priority, owned and unowned
 * Tickets, and 0, 1, and several Actions.
 *
 * Isolation from Labs 1-3:
 * - Every Lab 4 user is new. The Lab 1-3 users and their passwords are not touched here.
 * - Lab 4 users are created after the Lab 1-3 users, so Lab 2 tests that take the first active
 *   Requesters by id never pick them. Their emails also contain "-", which those tests exclude.
 * - Every seeded Ticket belongs to a Lab 4 Requester and, when owned, to a Lab 4 staff member.
 * - Ticket numbers use the TKT-L4- prefix, which never matches the TKT-YYYY- prefix that
 *   generateTicketNumber() reads, so the sequence for new Tickets is unaffected.
 *
 * Idempotency: users are upserted by email (same pattern as the Lab 1-3 users). A Ticket is
 * created together with its Actions in one nested create, only when its ticketNumber does not
 * exist yet, so a second run creates nothing and never duplicates an Action.
 */

// ─── Users ───────────────────────────────────────────────────────────────────
// Development password for every Lab 4 user: MIGRATED_USER_INITIAL_PASSWORD from src/constants.ts
// (the same constant as the Lab 1-3 users). They must change it at first login.

export const LAB4_USERS = {
  // e2e/lab-04/dashboards.spec.ts (E2E-05) and server/tests/lab-04/seed.test.ts (MIG-04)
  dashStaff: { name: "L4 Dashboard Staff", email: "l4-dash-staff@tiktockit.com", role: Role.IT_STAFF },
  dashStaffIdle: { name: "L4 Dashboard Idle Staff", email: "l4-dash-staff-idle@tiktockit.com", role: Role.IT_STAFF },
  dashRequesterMany: { name: "L4 Dashboard Busy Requester", email: "l4-dash-requester-many@example.com", role: Role.REQUESTER },
  dashRequesterEmpty: { name: "L4 Dashboard Empty Requester", email: "l4-dash-requester-empty@example.com", role: Role.REQUESTER },
  // e2e/lab-04/actions-taken-flow.spec.ts (E2E-01, E2E-02: two staff edit the same Action)
  flowStaffA: { name: "L4 Flow Staff A", email: "l4-flow-staff-a@tiktockit.com", role: Role.IT_STAFF },
  flowStaffB: { name: "L4 Flow Staff B", email: "l4-flow-staff-b@tiktockit.com", role: Role.IT_STAFF },
  flowRequester: { name: "L4 Flow Requester", email: "l4-flow-requester@example.com", role: Role.REQUESTER },
  // e2e/lab-04/ticket-resolution.spec.ts (E2E-03, E2E-04)
  resolveStaff: { name: "L4 Resolution Staff", email: "l4-resolve-staff@tiktockit.com", role: Role.IT_STAFF },
  resolveRequester: { name: "L4 Resolution Requester", email: "l4-resolve-requester@example.com", role: Role.REQUESTER },
  // e2e/lab-04/accessibility.spec.ts (A11Y-02, A11Y-03)
  a11yStaff: { name: "L4 Accessibility Staff", email: "l4-a11y-staff@tiktockit.com", role: Role.IT_STAFF },
  a11yRequester: { name: "L4 Accessibility Requester", email: "l4-a11y-requester@example.com", role: Role.REQUESTER },
  // e2e/lab-04/regression-sweep.spec.ts (E2E-06, E2E-07)
  sweepStaff: { name: "L4 Sweep Staff", email: "l4-sweep-staff@tiktockit.com", role: Role.IT_STAFF },
  sweepRequester: { name: "L4 Sweep Requester", email: "l4-sweep-requester@example.com", role: Role.REQUESTER },
  // Not "...-admin@tiktockit.com": the Lab 3 admin spec finds its row by the substring "admin@tiktockit.com".
  sweepAdmin: { name: "L4 Sweep Administrator", email: "l4-sweep-administrator@tiktockit.com", role: Role.ADMINISTRATOR },
} as const;

type UserKey = keyof typeof LAB4_USERS;

// ─── Tickets ─────────────────────────────────────────────────────────────────
// Times are hours relative to the moment the Ticket is first seeded (negative = in the past).
// All Tickets belong to dashRequesterMany; dashRequesterEmpty has none.

type SeedAction = {
  status: ActionStatus;
  actionAtH: number;
  description: string;
  result?: string;
  followUpNote?: string;
  attachmentNotes?: string;
  version?: number;
};

type SeedTicket = {
  ticketNumber: string;
  status: TicketStatus;
  owner: UserKey | null;
  requestedPriority: Priority;
  itPriority: Priority | null;
  category: string;
  relatedSystem: string;
  summary: string;
  createdH: number;
  statusChangedH: number;
  updatedH: number;
  resolvedH?: number;
  actions: SeedAction[];
};

export const LAB4_TICKETS: SeedTicket[] = [
  {
    ticketNumber: "TKT-L4-0001", status: TicketStatus.NEW, owner: null,
    requestedPriority: Priority.MEDIUM, itPriority: null,
    category: "Account and Access", relatedSystem: "Email",
    summary: "Shared mailbox not visible in Outlook",
    createdH: -3, statusChangedH: -3, updatedH: -3,
    actions: [],
  },
  {
    ticketNumber: "TKT-L4-0002", status: TicketStatus.OPEN, owner: "dashStaff",
    requestedPriority: Priority.HIGH, itPriority: Priority.HIGH,
    category: "Hardware", relatedSystem: "Corporate Laptop",
    summary: "Laptop does not charge from the docking station",
    createdH: -96, statusChangedH: -72, updatedH: -48,
    actions: [
      { status: ActionStatus.PLANNED, actionAtH: 24, description: "Replace the docking station power adapter" },
    ],
  },
  {
    ticketNumber: "TKT-L4-0003", status: TicketStatus.IN_PROGRESS, owner: "dashStaff",
    requestedPriority: Priority.LOW, itPriority: Priority.HIGH,
    category: "Network", relatedSystem: "VPN",
    summary: "VPN disconnects every few minutes",
    createdH: -144, statusChangedH: -120, updatedH: -6,
    actions: [
      { status: ActionStatus.COMPLETED, actionAtH: -120, description: "Collected VPN client logs from the laptop", result: "Logs show repeated TLS renegotiation timeouts." },
      { status: ActionStatus.CANCELLED, actionAtH: -96, description: "Install the vendor hotfix for the VPN client", result: "Cancelled because the vendor withdrew the hotfix.", version: 2 },
      { status: ActionStatus.IN_PROGRESS, actionAtH: -24, description: "Test the connection with a shorter keep-alive interval" },
      { status: ActionStatus.PLANNED, actionAtH: 48, description: "Move the user to the new VPN gateway", followUpNote: "Confirm with the requester after the next working day.", attachmentNotes: "Screenshot of the disconnect error in the ticket attachments." },
    ],
  },
  {
    // Longest waiting: oldest statusChangedAt, but the most recent updatedAt of the waiting Tickets.
    ticketNumber: "TKT-L4-0004", status: TicketStatus.WAITING_FOR_REQUESTER, owner: "dashStaff",
    requestedPriority: Priority.MEDIUM, itPriority: Priority.MEDIUM,
    category: "Software", relatedSystem: "Grade Submission App",
    summary: "Grade export button returns an empty file",
    createdH: -192, statusChangedH: -120, updatedH: -1,
    actions: [
      { status: ActionStatus.COMPLETED, actionAtH: -144, description: "Reproduced the empty export with the requester's course", result: "Export is empty only for courses with more than 200 students." },
    ],
  },
  {
    ticketNumber: "TKT-L4-0005", status: TicketStatus.WAITING_FOR_REQUESTER, owner: null,
    requestedPriority: Priority.LOW, itPriority: Priority.LOW,
    category: "Hardware", relatedSystem: "Printer",
    summary: "Printer on floor 3 prints faded pages",
    createdH: -72, statusChangedH: -48, updatedH: -48,
    actions: [],
  },
  {
    ticketNumber: "TKT-L4-0006", status: TicketStatus.WAITING_FOR_REQUESTER, owner: "dashStaff",
    requestedPriority: Priority.HIGH, itPriority: Priority.HIGH,
    category: "Network", relatedSystem: "Campus Wi-Fi",
    summary: "Wi-Fi drops in lecture hall B",
    createdH: -48, statusChangedH: -2, updatedH: -2,
    actions: [
      { status: ActionStatus.COMPLETED, actionAtH: -24, description: "Checked the access point logs for lecture hall B", result: "Access point reboots under load; firmware update scheduled.", attachmentNotes: "Signal map photo sent by the requester." },
    ],
  },
  {
    ticketNumber: "TKT-L4-0007", status: TicketStatus.RESOLVED, owner: "dashStaff",
    requestedPriority: Priority.HIGH, itPriority: Priority.HIGH,
    category: "Account and Access", relatedSystem: "LEB2 App",
    summary: "Cannot log in to LEB2 after password change",
    createdH: -240, statusChangedH: -48, updatedH: -48, resolvedH: -48,
    actions: [
      { status: ActionStatus.COMPLETED, actionAtH: -50, description: "Cleared the cached LEB2 session for the account", result: "The requester can log in again." },
    ],
  },
  {
    ticketNumber: "TKT-L4-0008", status: TicketStatus.CLOSED, owner: "dashStaff",
    requestedPriority: Priority.MEDIUM, itPriority: Priority.MEDIUM,
    category: "Software", relatedSystem: "Email",
    summary: "Email signature template is out of date",
    createdH: -480, statusChangedH: -240, updatedH: -240, resolvedH: -288,
    actions: [
      { status: ActionStatus.COMPLETED, actionAtH: -300, description: "Updated the signature template in the admin console", result: "New template rolled out to the department." },
      { status: ActionStatus.CANCELLED, actionAtH: -296, description: "Send a manual update guide to every user", result: "Not needed because the template updated automatically.", version: 2 },
    ],
  },
  {
    ticketNumber: "TKT-L4-0009", status: TicketStatus.REOPENED, owner: "dashStaff",
    requestedPriority: Priority.LOW, itPriority: Priority.LOW,
    category: "Hardware", relatedSystem: "Corporate Laptop",
    summary: "Keyboard keys stick again after cleaning",
    createdH: -360, statusChangedH: -24, updatedH: -24,
    actions: [
      { status: ActionStatus.COMPLETED, actionAtH: -240, description: "Cleaned the keyboard with compressed air", result: "Keys worked normally after cleaning." },
      { status: ActionStatus.IN_PROGRESS, actionAtH: -12, description: "Order a replacement keyboard" },
    ],
  },
  {
    ticketNumber: "TKT-L4-0010", status: TicketStatus.CANCELLED, owner: null,
    requestedPriority: Priority.LOW, itPriority: null,
    category: "Software", relatedSystem: "LEB2 App",
    summary: "Request for a LEB2 dark theme",
    createdH: -120, statusChangedH: -96, updatedH: -96,
    actions: [
      // BR-18: unfinished Actions are cancelled with this exact Result when the Ticket is cancelled.
      { status: ActionStatus.CANCELLED, actionAtH: -110, description: "Check whether the LEB2 vendor supports themes", result: "Cancelled automatically because the Ticket was cancelled.", version: 2 },
    ],
  },
];

const TERMINAL_TICKET: TicketStatus[] = [TicketStatus.RESOLVED, TicketStatus.CLOSED, TicketStatus.CANCELLED];
const OPEN_ACTION: ActionStatus[] = [ActionStatus.PLANNED, ActionStatus.IN_PROGRESS];

export async function seedLab4(prisma: PrismaClient, passwordHash: string): Promise<void> {
  const userIds = {} as Record<UserKey, number>;
  for (const [key, u] of Object.entries(LAB4_USERS) as Array<[UserKey, (typeof LAB4_USERS)[UserKey]]>) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, role: u.role, isActive: true, passwordHash, mustChangePassword: true },
      create: { name: u.name, email: u.email, role: u.role, isActive: true, passwordHash, mustChangePassword: true },
    });
    userIds[key] = user.id;
  }

  const categories = new Map((await prisma.category.findMany()).map(c => [c.name, c.id]));
  const systems = new Map((await prisma.relatedSystem.findMany()).map(s => [s.name, s.id]));

  let created = 0;
  for (const t of LAB4_TICKETS) {
    if (await prisma.ticket.findUnique({ where: { ticketNumber: t.ticketNumber }, select: { id: true } })) continue;

    // BR-14: a resolved, closed, or cancelled Ticket never has an unfinished Action.
    if (TERMINAL_TICKET.includes(t.status) && t.actions.some(a => OPEN_ACTION.includes(a.status))) {
      throw new Error(`${t.ticketNumber}: unfinished Action on a ${t.status} Ticket`);
    }
    const categoryId = categories.get(t.category);
    const relatedSystemId = systems.get(t.relatedSystem);
    if (!categoryId || !relatedSystemId) {
      throw new Error(`${t.ticketNumber}: category "${t.category}" or related system "${t.relatedSystem}" is not seeded`);
    }

    const base = Date.now();
    const at = (hours: number) => new Date(base + hours * 3600_000);
    const ownerId = t.owner ? userIds[t.owner] : null;
    // Actions are performed by the owner, or by the dashboard staff member on unowned Tickets.
    const staffId = ownerId ?? userIds.dashStaff;

    await prisma.ticket.create({
      data: {
        ticketNumber: t.ticketNumber,
        requesterId: userIds.dashRequesterMany,
        ticketOwnerId: ownerId,
        categoryId,
        relatedSystemId,
        summary: t.summary,
        description: `${t.summary}. Seeded Lab 4 Ticket for dashboards and Actions Taken.`,
        requestedPriority: t.requestedPriority,
        itPriority: t.itPriority,
        currentStatus: t.status,
        resolvedAt: t.resolvedH !== undefined ? at(t.resolvedH) : null,
        statusChangedAt: at(t.statusChangedH),
        createdAt: at(t.createdH),
        updatedAt: at(t.updatedH),
        actionsTaken: {
          create: t.actions.map((a, i) => {
            // Creation order follows the list order, one minute apart, just after the Ticket.
            const createdH = t.createdH + (i + 1) / 60;
            // Last change: when the work happened (never before creation, never in the future).
            const updatedH = Math.max(createdH, Math.min(0, a.actionAtH));
            return {
              actionAt: at(a.actionAtH),
              description: a.description,
              result: a.result ?? null,
              performedById: staffId,
              assigneeId: staffId,
              status: a.status,
              followUpRequired: a.followUpNote !== undefined,
              followUpNote: a.followUpNote ?? null,
              attachmentNotes: a.attachmentNotes ?? null,
              version: a.version ?? 1,
              createdAt: at(createdH),
              updatedAt: at(updatedH),
            };
          }),
        },
      },
    });
    created++;
  }

  console.log(`Lab 4 seed: ${Object.keys(LAB4_USERS).length} users upserted, ${created} of ${LAB4_TICKETS.length} Tickets created (existing ones left unchanged).`);
}
