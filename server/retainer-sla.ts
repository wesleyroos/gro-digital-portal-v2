// Retainer SLA reporting — GRO Digital's own tooling, deliberately living here.
//
// This belongs in the GD portal and NOT in any client codebase. It reports on
// whether GRO Digital met its own contractual obligations, and its monitor
// registry names every GD-hosted platform across all clients. Putting that in a
// client's app would expose GD's client list, hand the tooling to that client
// under the deliverables clause of their agreement, and require GD's monitoring
// credential to sit on their infrastructure.
//
// Currently reports the Fundi retainer (CSS-2026-01). Structured so other
// retainer clients can be added as their own tier without reshaping anything.
//
// Contractual basis for the Fundi figures (CSS-2026-01):
//   14.1  Service levels apply ONLY to GRO-hosted platforms.
//   14.5  99.0% monthly availability per GRO-hosted PRODUCTION environment,
//         measured per calendar month.
//   14.3  Response and resolution targets by severity — the outage log evidences these.
//   15.2  "SLA performance" is a required section of the Monthly Report.

const API = "https://api.uptimerobot.com/v2";

/** The contractual floor for Fundi. Not a config knob — this is the contract. */
export const AVAILABILITY_TARGET = 99.0;

export type Tier =
  /** GRO-hosted Fundi production. SLA-bearing: counts toward the reported 99.0%. */
  | "fundi-gd-production"
  /** GRO-hosted Fundi staging. Alerted on, reported as context, never in the SLA figure. */
  | "fundi-gd-staging"
  /** Fundi-hosted. Listed for context. No SLA attaches (clause 14.1). */
  | "fundi-external"
  /** GD's own products and other clients. Never in the Fundi report. */
  | "gd-other";

export type MonitorEntry = {
  /** UptimeRobot monitor id — the join key. Names get edited; ids do not. */
  id: number;
  platform: string;
  tier: Tier;
  db: "postgres" | "sqlite" | "none";
  note?: string;
};

// The registry lives in code because UptimeRobot's API does not expose monitor
// groups. The classification driving contractual reporting therefore cannot be
// read back from the dashboard, so it has to be explicit and reviewable here.
export const MONITORS: MonitorEntry[] = [
  // ---- Fundi, GRO-hosted, production (SLA-bearing) ----
  {
    id: 803096925,
    platform: "MyFundi",
    tier: "fundi-gd-production",
    db: "postgres",
    note: "Watches myfundi.fly.dev — DNS cutover to the customer-facing domain still pending with Fundi.",
  },
  { id: 803092806, platform: "bursaries.co.za", tier: "fundi-gd-production", db: "postgres" },
  { id: 803096932, platform: "FundiConnect", tier: "fundi-gd-production", db: "postgres" },
  {
    id: 803174081,
    platform: "FundiJobs",
    tier: "fundi-gd-production",
    db: "postgres",
    note: "Watches fundijobs-prod.fly.dev — DNS cutover still pending with Fundi.",
  },
  { id: 803096938, platform: "FundiHealth", tier: "fundi-gd-production", db: "none" },
  { id: 803096944, platform: "FundiMatch", tier: "fundi-gd-production", db: "none" },
  { id: 803713792, platform: "FundiMatch (my.)", tier: "fundi-gd-production", db: "none" },
  {
    id: 803096937,
    platform: "FundiShop (frontend)",
    tier: "fundi-gd-production",
    db: "sqlite",
    note: "Watches fundi-shop.fly.dev, the GRO-hosted frontend. Customer-facing shop.fundi.co.za is Fundi-hosted.",
  },

  // ---- Fundi, GRO-hosted, staging (never in the SLA figure — 14.5 says production) ----
  { id: 803096964, platform: "MyFundi (staging)", tier: "fundi-gd-staging", db: "postgres" },
  { id: 803096970, platform: "bursaries.co.za (staging)", tier: "fundi-gd-staging", db: "postgres" },
  { id: 803096971, platform: "FundiConnect (staging)", tier: "fundi-gd-staging", db: "postgres" },
  { id: 803174087, platform: "FundiJobs (staging)", tier: "fundi-gd-staging", db: "postgres" },
  { id: 803096975, platform: "FundiShop (staging)", tier: "fundi-gd-staging", db: "sqlite" },

  // ---- Fundi, externally hosted (context only, no SLA — 14.1) ----
  { id: 803713395, platform: "shop.fundi.co.za", tier: "fundi-external", db: "none" },

  // ---- GD's own products and other clients (never in the Fundi report) ----
  { id: 803713520, platform: "Engage (console)", tier: "gd-other", db: "postgres" },
  { id: 803713523, platform: "Engage (API)", tier: "gd-other", db: "postgres" },
  { id: 803372756, platform: "Addex", tier: "gd-other", db: "none" },
  { id: 803274912, platform: "Land Cruiser SA", tier: "gd-other", db: "sqlite" },
  { id: 803713458, platform: "Jimny SA", tier: "gd-other", db: "sqlite" },
  { id: 803713455, platform: "Sensitive People Thriving", tier: "gd-other", db: "postgres" },
  { id: 803714841, platform: "SpeechLab", tier: "gd-other", db: "postgres" },
];

const BY_ID = new Map(MONITORS.map((m) => [m.id, m]));

// ---------------------------------------------------------------- UptimeRobot

function apiKey(): string {
  const key = process.env.UPTIMEROBOT_API_KEY;
  if (!key) throw new Error("UPTIMEROBOT_API_KEY is not set");
  return key;
}

async function post<T>(path: string, params: Record<string, string>): Promise<T> {
  const body = new URLSearchParams({ api_key: apiKey(), format: "json", ...params });
  const res = await fetch(`${API}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "Cache-Control": "no-cache" },
    body,
  });
  if (!res.ok) throw new Error(`UptimeRobot ${path} HTTP ${res.status}`);
  const json = (await res.json()) as { stat?: string; error?: { message?: string } } & T;
  if (json.stat !== "ok") {
    throw new Error(`UptimeRobot ${path} failed: ${json.error?.message ?? "unknown error"}`);
  }
  return json;
}

export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Unix-second bounds of a calendar month, UTC. `month` is "YYYY-MM".
 *
 * ⚠️ Why this exists rather than using UptimeRobot's `custom_uptime_ratios=30`:
 * clause 14.5 measures availability per CALENDAR month, and that parameter is a
 * rolling 30-day window. Using it would report a number the contract does not
 * describe.
 */
export function monthBounds(month: string): { from: number; to: number } {
  const [y, m] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return {
    from: Math.floor(Date.parse(`${month}-01T00:00:00Z`) / 1000),
    to: Math.floor(Date.parse(`${month}-${String(lastDay).padStart(2, "0")}T23:59:59Z`) / 1000),
  };
}

export type DownEvent = {
  startedAt: string;
  durationSeconds: number;
  reason: string;
};

type RawMonitor = {
  id: number;
  friendly_name: string;
  url?: string;
  custom_uptime_ranges?: string;
  create_datetime?: number;
  logs?: { type: number; datetime: number; duration?: number; reason?: { code?: string; detail?: string } }[];
};

// -------------------------------------------------------------- report shapes

export type PlatformUptime = {
  platform: string;
  tier: Tier;
  url: string;
  uptimePercent: number;
  downSeconds: number;
  /**
   * Null for anything not SLA-bearing, and null where monitoring did not cover
   * the whole month — we do not assert availability we cannot evidence.
   */
  meetsTarget: boolean | null;
  /**
   * False when the monitor was created mid-month.
   *
   * UptimeRobot reports 100% for periods predating a monitor's creation, which
   * would put a fabricated perfect score into a contractual report.
   */
  dataComplete: boolean;
  monitoringSince: string;
  events: DownEvent[];
  note?: string;
};

export type RegistryDrift = {
  /** In UptimeRobot but unclassified — would silently escape SLA scope. */
  unclassified: { id: number; name: string }[];
  /** Classified here but gone from UptimeRobot — would silently drop out. */
  missing: { id: number; platform: string }[];
};

export type SlaSection = {
  month: string;
  target: number;
  slaPlatforms: PlatformUptime[];
  contextPlatforms: PlatformUptime[];
  breaches: PlatformUptime[];
  worst: PlatformUptime | null;
  summary: string;
  drift: RegistryDrift;
  expectedSlaCount: number;
};

function fmtPct(n: number): string {
  return `${n.toFixed(3)}%`;
}

function buildSummary(sla: PlatformUptime[], breaches: PlatformUptime[], worst: PlatformUptime | null): string {
  if (sla.length === 0) return "No SLA-bearing platforms were monitored this month.";

  const partial = sla.filter((p) => !p.dataComplete);
  const partialNote = partial.length
    ? ` ${partial.length === 1 ? "One platform" : `${partial.length} platforms`} ` +
      `(${partial.map((p) => p.platform).join(", ")}) had monitoring in place for only part of the ` +
      `month, so no availability figure is reported for ${partial.length === 1 ? "it" : "them"}.`
    : "";

  const measured = sla.filter((p) => p.dataComplete);

  if (breaches.length === 0) {
    const head = worst
      ? `All ${measured.length} fully monitored platforms met the ${AVAILABILITY_TARGET}% availability ` +
        `commitment. Lowest was ${worst.platform} at ${fmtPct(worst.uptimePercent)}.`
      : `All ${measured.length} fully monitored platforms met the ${AVAILABILITY_TARGET}% commitment.`;
    return head + partialNote;
  }

  const names = breaches.map((b) => `${b.platform} (${fmtPct(b.uptimePercent)})`).join(", ");
  const noun = breaches.length === 1 ? "platform" : "platforms";
  return (
    `${breaches.length} ${noun} fell below the ${AVAILABILITY_TARGET}% commitment: ${names}. ` +
    `A remediation plan is required under clause 14.7; service credits apply only if a material ` +
    `failure persists for two consecutive months thereafter.` + partialNote
  );
}

export async function buildSlaSection(month: string): Promise<SlaSection> {
  if (!MONTH_RE.test(month)) throw new Error(`invalid month: ${month}`);
  const { from, to } = monthBounds(month);

  const json = await post<{ monitors: RawMonitor[] }>("getMonitors", {
    custom_uptime_ranges: `${from}_${to}`,
    logs: "1",
    logs_limit: "50",
  });

  const liveIds = new Set(json.monitors.map((m) => m.id));
  const drift: RegistryDrift = {
    unclassified: json.monitors
      .filter((m) => !BY_ID.has(m.id))
      .map((m) => ({ id: m.id, name: m.friendly_name })),
    missing: MONITORS.filter((m) => !liveIds.has(m.id)).map((m) => ({ id: m.id, platform: m.platform })),
  };

  const mapped: PlatformUptime[] = [];
  for (const m of json.monitors) {
    const entry = BY_ID.get(m.id);
    if (!entry || entry.tier === "gd-other") continue; // GD's own estate is not Fundi's report

    const uptimePercent = Number.parseFloat(m.custom_uptime_ranges ?? "0");
    const createdAt = m.create_datetime ?? 0;
    const dataComplete = createdAt > 0 && createdAt <= from;

    // UptimeRobot does not scope logs to the requested range, so filter here.
    // Log type 1 is "down".
    const events: DownEvent[] = (m.logs ?? [])
      .filter((l) => l.type === 1 && l.datetime >= from && l.datetime <= to)
      .map((l) => ({
        startedAt: new Date(l.datetime * 1000).toISOString(),
        durationSeconds: l.duration ?? 0,
        reason: [l.reason?.code, l.reason?.detail].filter(Boolean).join(" — ") || "unknown",
      }))
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));

    const slaBorne = entry.tier === "fundi-gd-production";
    mapped.push({
      platform: entry.platform,
      tier: entry.tier,
      url: m.url ?? "",
      uptimePercent: Number.isFinite(uptimePercent) ? uptimePercent : 0,
      downSeconds: events.reduce((sum, e) => sum + e.durationSeconds, 0),
      meetsTarget: slaBorne && dataComplete ? uptimePercent >= AVAILABILITY_TARGET : null,
      dataComplete,
      monitoringSince: new Date(createdAt * 1000).toISOString(),
      events,
      note: entry.note,
    });
  }

  const slaPlatforms = mapped
    .filter((p) => p.tier === "fundi-gd-production")
    // Fully measured first, worst availability at the top. Partial-data rows sort
    // last, since their percentage is not a claim we are making.
    .sort((a, b) => Number(a.dataComplete) - Number(b.dataComplete) || a.uptimePercent - b.uptimePercent);

  const contextPlatforms = mapped
    .filter((p) => p.tier === "fundi-gd-staging" || p.tier === "fundi-external")
    .sort((a, b) => a.platform.localeCompare(b.platform));

  const breaches = slaPlatforms.filter((p) => p.meetsTarget === false);
  // "Worst" must only cite a platform we actually measured for the month.
  const worst = slaPlatforms.find((p) => p.dataComplete) ?? null;

  return {
    month,
    target: AVAILABILITY_TARGET,
    slaPlatforms,
    contextPlatforms,
    breaches,
    worst,
    summary: buildSummary(slaPlatforms, breaches, worst),
    drift,
    expectedSlaCount: MONITORS.filter((m) => m.tier === "fundi-gd-production").length,
  };
}
