import type { Express } from "express";
import { sql } from "drizzle-orm";
import { getDb } from "./db";

/**
 * GD engineering standard — see GD-Vault/Playbooks/Health Endpoint Standard.md.
 *
 * Registered before everything else so the process can still answer these two
 * routes when a later subsystem fails to come up.
 */
export function registerHealthRoutes(app: Express) {
  // Shallow: the process is alive. Never point infrastructure health checks at
  // the deep route — a transient database blip would have them kill the machine.
  app.get("/api/health", (_req, res) => {
    res.set("Cache-Control", "no-store").json({ ok: true });
  });

  // Deep: app + database, the SLA-bearing check. Our stack only — third-party
  // dependencies belong on a separate alert-only endpoint, since CSS 14.5
  // excludes upstream failures from the availability we report.
  app.get("/api/health/deep", async (_req, res) => {
    const checks: Record<string, "ok" | "fail"> = {};
    try {
      const db = await getDb();
      if (!db) throw new Error("database not configured");
      await db.execute(sql`SELECT 1`);
      checks.db = "ok";
    } catch {
      checks.db = "fail";
    }
    const allOk = Object.values(checks).every(v => v === "ok");
    res
      .status(allOk ? 200 : 503)
      .set("Cache-Control", "no-store")
      .json({ status: allOk ? "ok" : "degraded", checks });
  });
}
