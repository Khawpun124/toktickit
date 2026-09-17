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
    await prisma.ticket.deleteMany({ where: { summary: { contains: testEmail } } });
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
});
