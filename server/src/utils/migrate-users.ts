import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcrypt";

export const MIGRATED_DEFAULT_PASSWORD = "ChangeMe123!";

/**
 * Migrates RequesterUser records to the User model and updates Ticket.requesterId FK.
 * Idempotent: safe to run multiple times without duplicating records or breaking references.
 */
export async function runUserMigration(prisma: PrismaClient) {
  const requesters = await prisma.requesterUser.findMany();
  let migratedUsersCount = 0;
  let updatedTicketsCount = 0;

  const defaultPasswordHash = await bcrypt.hash(MIGRATED_DEFAULT_PASSWORD, 10);

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

  return {
    migratedUsersCount,
    updatedTicketsCount,
  };
}
