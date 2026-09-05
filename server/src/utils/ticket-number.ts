import { PrismaClient } from "@prisma/client";

/**
 * Format a ticket number string given a year and sequence integer.
 * Example: formatTicketNumber(2026, 42) -> "TKT-2026-000042"
 */
export function formatTicketNumber(year: number, sequence: number): string {
  const paddedSeq = sequence.toString().padStart(6, "0");
  return `TKT-${year}-${paddedSeq}`;
}

/**
 * Generates the next sequential Ticket Number for the specified year.
 * Format: TKT-YYYY-NNNNNN
 */
export async function generateTicketNumber(
  prisma: PrismaClient | any,
  year?: number
): Promise<string> {
  const currentYear = year ?? new Date().getFullYear();
  const prefix = `TKT-${currentYear}-`;

  const lastTicket = await prisma.ticket.findFirst({
    where: {
      ticketNumber: {
        startsWith: prefix,
      },
    },
    orderBy: {
      ticketNumber: "desc",
    },
    select: {
      ticketNumber: true,
    },
  });

  let nextSeq = 1;
  if (lastTicket && lastTicket.ticketNumber) {
    const parts = lastTicket.ticketNumber.split("-");
    const lastSeq = parseInt(parts[2], 10);
    if (!isNaN(lastSeq)) {
      nextSeq = lastSeq + 1;
    }
  }

  return formatTicketNumber(currentYear, nextSeq);
}
