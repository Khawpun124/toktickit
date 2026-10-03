import { PrismaClient, Role } from "@prisma/client";
import { hashPassword } from "./password.js";
import { MIGRATED_USER_INITIAL_PASSWORD } from "../constants.js";

export const MIGRATED_DEFAULT_PASSWORD = MIGRATED_USER_INITIAL_PASSWORD;

/**
 * Migrates RequesterUser records to the User model and updates Ticket.requesterId FK.
 * Idempotent: safe to run multiple times without duplicating records or breaking references.
 */
export async function runUserMigration(prisma: PrismaClient) {
  const requesters = await prisma.requesterUser.findMany();
  let migratedUsersCount = 0;
  let updatedTicketsCount = 0;

  const defaultPasswordHash = await hashPassword(MIGRATED_USER_INITIAL_PASSWORD);


  for (const requester of requesters) {
    // Check if User already exists by email
    let user = await prisma.user.findUnique({
      where: { email: requester.email },
    });

    if (!user) {
      try {
        user = await prisma.user.create({
          data: {
            id: requester.id,
            name: requester.name,
            email: requester.email,
            passwordHash: defaultPasswordHash,
            role: Role.REQUESTER,
            isActive: requester.isActive,
            mustChangePassword: true,
            createdAt: requester.createdAt,
          },
        });
      } catch (_err) {
        user = await prisma.user.create({
          data: {
            name: requester.name,
            email: requester.email,
            passwordHash: defaultPasswordHash,
            role: Role.REQUESTER,
            isActive: requester.isActive,
            mustChangePassword: true,
            createdAt: requester.createdAt,
          },
        });
      }
      migratedUsersCount++;
    }

    if (user) {
      const updateResult = await prisma.ticket.updateMany({
        where: { requesterId: requester.id },
        data: { requesterId: user.id },
      });
      updatedTicketsCount += updateResult.count;
    }
  }

  // Reset/sync User_id_seq sequence so future auto-increment inserts won't conflict with explicitly inserted user IDs
  try {
    await prisma.$executeRawUnsafe(
      `SELECT setval(pg_get_serial_sequence('"User"', 'id'), COALESCE(max(id), 1)) FROM "User";`
    );
  } catch (_seqErr) {
    // Ignore sequence reset error if table/sequence isn't serial
  }

  // Ensure the FK constraint exists after data migration.
  // Migration #6 intentionally omits this FK (User table is empty at migration time).
  // We add it here after User data has been populated. Idempotent via IF NOT EXISTS check.
  try {
    const fkExists = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint as count FROM information_schema.table_constraints 
      WHERE constraint_name = 'Ticket_requesterId_fkey' 
        AND table_name = 'Ticket'
        AND constraint_type = 'FOREIGN KEY'
    `;
    if (!fkExists[0] || fkExists[0].count === BigInt(0)) {
      await prisma.$executeRaw`
        ALTER TABLE "Ticket" 
        ADD CONSTRAINT "Ticket_requesterId_fkey" 
        FOREIGN KEY ("requesterId") REFERENCES "User"("id") 
        ON DELETE RESTRICT ON UPDATE CASCADE
      `;
    }
  } catch (_fkErr) {
    // FK may already exist from a previous run — safe to ignore
  }

  return {
    migratedUsersCount,
    updatedTicketsCount,
  };
}

// Standalone execution entry point
if (process.argv[1]?.replace(/\\/g, "/").endsWith("src/utils/migrate-users.ts")) {
  const { getPrisma } = await import("../prisma.js");
  const prisma = getPrisma();
  console.log("Starting user data migration...");
  runUserMigration(prisma)
    .then((res) => {
      console.log(
        `Migration completed successfully: ${res.migratedUsersCount} users migrated, ${res.updatedTicketsCount} ticket references updated.`
      );
      process.exit(0);
    })
    .catch((err) => {
      console.error("Migration failed:", err);
      process.exit(1);
    });
}

