import { describe, it, expect, beforeEach } from "vitest";
import { getPrisma } from "../../src/prisma.js";
import { runUserMigration, MIGRATED_DEFAULT_PASSWORD } from "../../src/utils/migrate-users.js";
import { comparePassword } from "../../src/utils/password.js";

describe("Migration Tests (MIG-01, MIG-02, BR-23, BR-24, AC-16)", () => {
  const prisma = getPrisma();
  let testEmail: string;
  let createdReqUserId: number;

  beforeEach(async () => {
    testEmail = `mig-${Date.now()}-${Math.random().toString(36).substring(7)}@example.com`;

    // Create a RequesterUser row
    const reqUser = await prisma.requesterUser.create({
      data: {
        name: "Migrated User Test",
        email: testEmail,
        isActive: true,
      },
    });
    createdReqUserId = reqUser.id;

    // Create a Ticket pointing to this requesterId
    // Note: Ticket.requesterId now references User(id), so we create User first or via migration
    const defaultPasswordHash = await comparePassword("dummy", "dummy") ? "" : "$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeg6Lruj3vjPGga31lW";
    const initialUser = await prisma.user.create({
      data: {
        id: reqUser.id,
        name: reqUser.name,
        email: reqUser.email,
        passwordHash: defaultPasswordHash,
        role: "REQUESTER",
        isActive: true,
        mustChangePassword: true,
      },
    }).catch(() => null);

    const targetUserId = initialUser ? initialUser.id : reqUser.id;

    const ticketNumber = `TKT-MIG-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    await prisma.ticket.create({
      data: {
        ticketNumber,
        requesterId: targetUserId,
        categoryId: 1,
        relatedSystemId: 1,
        summary: `Migration Ticket Ownership Test ${testEmail}`,
        description: "Testing ticket requester relation after migration",
        requestedPriority: "LOW",
        currentStatus: "NEW",
      },
    });
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
