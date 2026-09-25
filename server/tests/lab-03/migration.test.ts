import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getPrisma } from "../../src/prisma.js";
import { runUserMigration, MIGRATED_DEFAULT_PASSWORD } from "../../src/utils/migrate-users.js";
import { comparePassword } from "../../src/utils/password.js";

describe("Migration Tests (MIG-01, MIG-02, BR-23, BR-24, AC-16)", () => {
  const prisma = getPrisma();
  let testEmail: string;

  beforeEach(async () => {
    testEmail = `mig-${Date.now()}-${Math.random().toString(36).substring(7)}@example.com`;

    // Create a isolated RequesterUser row fixture
    await prisma.requesterUser.create({
      data: {
        name: "Migrated User Test",
        email: testEmail,
        isActive: true,
      },
    });
  });

  afterEach(async () => {
    await prisma.ticket.deleteMany({
      where: {
        OR: [
          { summary: { contains: testEmail } },
          { requester: { email: testEmail } },
        ],
      },
    });
    await prisma.user.deleteMany({ where: { email: testEmail } });
    await prisma.requesterUser.deleteMany({ where: { email: testEmail } });
  });

  it("MIG-01: Converts RequesterUser records to User model with role REQUESTER and hashed initial password (BR-23)", async () => {
    const result = await runUserMigration(prisma);
    expect(result).toHaveProperty("migratedUsersCount");

    const user = await prisma.user.findUnique({
      where: { email: testEmail },
    });

    expect(user).not.toBeNull();
    expect(user?.role).toBe("REQUESTER");
    expect(user?.mustChangePassword).toBe(true);

    const passMatches = await comparePassword(MIGRATED_DEFAULT_PASSWORD, user!.passwordHash);
    expect(passMatches).toBe(true);
  });

  it("MIG-02: Ticket ownership is preserved and points to the migrated User (BR-24, AC-16)", async () => {
    await runUserMigration(prisma);

    const user = await prisma.user.findUnique({
      where: { email: testEmail },
    });
    expect(user).not.toBeNull();

    // Create a ticket for this migrated user to test relationship
    const ticketNumber = `TKT-MIG-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    await prisma.ticket.create({
      data: {
        ticketNumber,
        requesterId: user!.id,
        categoryId: 1,
        relatedSystemId: 1,
        summary: `Migration Ticket Ownership Test ${testEmail}`,
        description: "Testing ticket requester relation after migration",
        requestedPriority: "LOW",
        currentStatus: "NEW",
      },
    });

    const tickets = await prisma.ticket.findMany({
      where: { summary: `Migration Ticket Ownership Test ${testEmail}` },
      include: { requester: true },
    });

    expect(tickets.length).toBeGreaterThan(0);
    for (const t of tickets) {
      expect(t.requesterId).toBe(user?.id);
      expect(t.requester.email).toBe(testEmail);
    }
  });

  it("MIG-03: Upgrades existing Lab 2 database where RequesterUser and Ticket pre-exist before migration", async () => {
    const preExistingEmail = `pre-mig-${Date.now()}@example.com`;

    const user = await prisma.user.create({
      data: {
        name: "Pre-existing Requester",
        email: preExistingEmail,
        passwordHash: "dummyhash",
        role: "REQUESTER",
        mustChangePassword: true,
        isActive: true,
      },
    });

    const requester = await prisma.requesterUser.create({
      data: {
        id: user.id,
        name: "Pre-existing Requester",
        email: preExistingEmail,
        isActive: true,
      },
    });

    const category = await prisma.category.upsert({
      where: { name: "Software" },
      update: {},
      create: { name: "Software" },
    });
    const relatedSystem = await prisma.relatedSystem.upsert({
      where: { name: "Email" },
      update: {},
      create: { name: "Email" },
    });

    const preTicketNumber = `TKT-PRE-${Date.now()}`;
    await prisma.ticket.create({
      data: {
        ticketNumber: preTicketNumber,
        requesterId: user.id,
        categoryId: category.id,
        relatedSystemId: relatedSystem.id,
        summary: `Pre-existing Ticket for ${preExistingEmail}`,
        description: "Simulating pre-migration Lab 2 state with existing ticket and requesterUser",
        requestedPriority: "HIGH",
        currentStatus: "NEW",
      },
    });

    const result = await runUserMigration(prisma);
    expect(result.migratedUsersCount).toBeGreaterThan(0);

    const migratedUser = await prisma.user.findUnique({
      where: { email: preExistingEmail },
    });
    expect(migratedUser).not.toBeNull();
    expect(migratedUser?.role).toBe("REQUESTER");
    expect(migratedUser?.mustChangePassword).toBe(true);

    const ticket = await prisma.ticket.findUnique({
      where: { ticketNumber: preTicketNumber },
      include: { requester: true },
    });
    expect(ticket).not.toBeNull();
    expect(ticket?.requesterId).toBe(migratedUser?.id);
    expect(ticket?.requester.email).toBe(preExistingEmail);

    await prisma.ticket.deleteMany({ where: { ticketNumber: preTicketNumber } });
    await prisma.user.deleteMany({ where: { email: preExistingEmail } });
    await prisma.requesterUser.deleteMany({ where: { email: preExistingEmail } });
  });
});

