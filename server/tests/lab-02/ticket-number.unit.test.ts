import { describe, it, expect } from "vitest";
import { formatTicketNumber, generateTicketNumber } from "../../src/utils/ticket-number.js";

describe("Ticket Number Generator Unit Test (UNIT-01)", () => {
  it("formats ticket numbers with TKT-YYYY-NNNNNN regex structure", () => {
    const year = 2026;
    const ticketNo = formatTicketNumber(year, 1);
    expect(ticketNo).toBe("TKT-2026-000001");
    expect(ticketNo).toMatch(/^TKT-\d{4}-\d{6}$/);

    const ticketNo42 = formatTicketNumber(year, 42);
    expect(ticketNo42).toBe("TKT-2026-000042");
    expect(ticketNo42).toMatch(/^TKT-\d{4}-\d{6}$/);
  });

  it("generateTicketNumber produces sequential and unique ticket numbers", async () => {
    let mockSequence = 0;
    const mockPrisma = {
      ticket: {
        findFirst: async ({ where }: any) => {
          if (mockSequence === 0) {
            return null;
          }
          const year = where.ticketNumber.startsWith.split("-")[1];
          return { ticketNumber: formatTicketNumber(parseInt(year, 10), mockSequence) };
        },
      },
    };

    const firstCall = await generateTicketNumber(mockPrisma, 2026);
    expect(firstCall).toBe("TKT-2026-000001");
    expect(firstCall).toMatch(/^TKT-\d{4}-\d{6}$/);

    // Simulate database record created for first call
    mockSequence = 1;

    const secondCall = await generateTicketNumber(mockPrisma, 2026);
    expect(secondCall).toBe("TKT-2026-000002");
    expect(secondCall).toMatch(/^TKT-\d{4}-\d{6}$/);

    // Two consecutive calls differ
    expect(firstCall).not.toBe(secondCall);
  });
});
