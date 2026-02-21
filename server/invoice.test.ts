import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

describe("invoice.getByNumber", () => {
  it("returns invoice data for IGL002", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.invoice.getByNumber({ invoiceNumber: "IGL002" });

    if (result) {
      expect(result.invoice).toBeDefined();
      expect(result.invoice.invoiceNumber).toBe("IGL002");
      expect(result.invoice.clientName).toBe("IGL Coatings Africa");
      expect(result.invoice.clientSlug).toBe("igl-coatings-africa");
      expect(result.invoice.invoiceType).toBe("once-off");
      expect(result.invoice.amountDue).toBeDefined();
      expect(result.invoice.bankName).toBe("FNB/RMB");
      expect(result.invoice.accountNumber).toBe("62842244725");
      expect(result.invoice.branchCode).toBe("250655");
      expect(result.invoice.paymentReference).toBe("IGLCAFRICA-FINAL");
      expect(result.invoice.paymentTerms).toBe("Due upon receipt");
      expect(result.items).toBeDefined();
      expect(Array.isArray(result.items)).toBe(true);
      expect(result.items.length).toBeGreaterThan(0);
    }
  });

  it("returns monthly recurring invoice IGL-M001", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.invoice.getByNumber({ invoiceNumber: "IGL-M001" });

    if (result) {
      expect(result.invoice.invoiceNumber).toBe("IGL-M001");
      expect(result.invoice.invoiceType).toBe("monthly");
      expect(result.invoice.clientSlug).toBe("igl-coatings-africa");
      expect(result.items.length).toBeGreaterThan(0);
    }
  });

  it("returns annual recurring invoice IGL-A001", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.invoice.getByNumber({ invoiceNumber: "IGL-A001" });

    if (result) {
      expect(result.invoice.invoiceNumber).toBe("IGL-A001");
      expect(result.invoice.invoiceType).toBe("annual");
      expect(result.invoice.clientSlug).toBe("igl-coatings-africa");
      expect(result.items.length).toBe(1);
    }
  });

  it("returns null for a non-existent invoice number", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.invoice.getByNumber({ invoiceNumber: "NONEXISTENT999" });
    expect(result).toBeNull();
  });
});

describe("invoice.list", () => {
  it("returns an array of invoices", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.invoice.list();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThanOrEqual(3);
  });
});

describe("invoice.listByClient", () => {
  it("returns invoices for igl-coatings-africa", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.invoice.listByClient({ clientSlug: "igl-coatings-africa" });
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThanOrEqual(3);
    result.forEach((inv) => {
      expect(inv.clientSlug).toBe("igl-coatings-africa");
    });
  });

  it("returns empty array for non-existent client", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.invoice.listByClient({ clientSlug: "non-existent-client" });
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });
});

describe("invoice.clients", () => {
  it("returns a list of distinct clients", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.invoice.clients();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThanOrEqual(1);

    const igl = result.find((c) => c.clientSlug === "igl-coatings-africa");
    expect(igl).toBeDefined();
    expect(igl?.clientName).toBe("IGL Coatings Africa");
  });
});
