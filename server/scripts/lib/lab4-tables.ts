/**
 * Lab 1-3 tables and columns compared by db:snapshot and db:verify:lab4.
 *
 * Session is excluded on purpose: it changes on every login.
 * Ticket lists only its Lab 1-3 columns, so version, resolvedAt, and statusChangedAt
 * do not affect the checksums.
 */
import type { PrismaClient } from "@prisma/client";

// Bump when the checksum expression changes; db:verify:lab4 refuses other formats.
export const SNAPSHOT_FORMAT = 2;

export const LAB13_TABLE_COLUMNS: Record<string, string[]> = {
  Category: ["id", "name", "isActive", "createdAt"],
  RequesterUser: ["id", "name", "email", "isActive", "createdAt"],
  RelatedSystem: ["id", "name", "isActive"],
  User: [
    "id", "name", "email", "passwordHash", "role",
    "isActive", "mustChangePassword", "createdAt", "updatedAt",
  ],
  Ticket: [
    "id", "ticketNumber", "requesterId", "ticketOwnerId",
    "categoryId", "relatedSystemId", "summary", "description",
    "requestedPriority", "itPriority", "currentStatus",
    "problemAppearsResolved", "createdAt", "updatedAt",
  ],
  Attachment: [
    "id", "ticketId", "fileName", "storedFileName",
    "mimeType", "sizeBytes", "uploadedAt", "removedAt", "removedReason",
  ],
  PublicComment: ["id", "ticketId", "authorId", "content", "createdAt"],
  InternalNote: ["id", "ticketId", "authorId", "content", "createdAt"],
};

export type RowEntry = { id: number; rowMd5: string };
export type TableSnapshot = { count: number; rows: RowEntry[] };
export type SnapshotFile = {
  format: number;
  capturedAt: string;
  database: string;
  tables: Record<string, TableSnapshot>;
};

/**
 * Row count and per-row md5 for one table. Each row is hashed as a JSON array of its
 * columns: NULL becomes null and '' becomes "", and every string is quoted and escaped,
 * so no value (not even the text "null" or one containing a separator) can make two
 * different rows hash the same. Only the md5 is returned, never the row values.
 */
export async function tableChecksums(
  prisma: PrismaClient,
  table: string,
  cols: string[]
): Promise<TableSnapshot> {
  const colList = cols.map(c => `"${c}"`).join(", ");
  const rows = await prisma.$queryRawUnsafe<Array<{ id: number; row_md5: string }>>(
    `SELECT id, md5(json_build_array(${colList})::text) AS row_md5 FROM "${table}" ORDER BY id ASC`
  );
  return { count: rows.length, rows: rows.map(r => ({ id: Number(r.id), rowMd5: r.row_md5 })) };
}
