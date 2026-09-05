import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";

describe("GET /api/categories", () => {
  it("returns the four seeded categories in id order", async () => {
    const res = await request(app).get("/api/categories");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { id: 1, name: "Account and Access" },
      { id: 2, name: "Hardware" },
      { id: 3, name: "Software" },
      { id: 4, name: "Network" },
    ]);
  });

  it("excludes inactive categories from results", async () => {
    const prisma = getPrisma();
    const inactiveCategory = await prisma.category.create({
      data: {
        name: "Legacy System (Deprecated)",
        isActive: false,
      },
    });

    try {
      const res = await request(app).get("/api/categories");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);

      const foundInactive = res.body.some(
        (cat: { name: string }) => cat.name === "Legacy System (Deprecated)"
      );
      expect(foundInactive).toBe(false);
    } finally {
      await prisma.category.delete({
        where: { id: inactiveCategory.id },
      });
    }
  });
});


