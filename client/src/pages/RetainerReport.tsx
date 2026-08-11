import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, Loader2, ShieldCheck } from "lucide-react";

// GRO Digital's own retainer reporting. Deliberately lives in the GD portal and
// not in any client codebase — it reports on whether GD met its own contractual
// obligations, and the registry behind it names every GD-hosted platform.

const AVAILABILITY_TARGET = 99.0;

function recentMonths(n: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

function monthLabel(month: string): string {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-ZA", {
    year: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

function fmtDuration(seconds: number): string {
  if (seconds <= 0) return "—";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

type Platform = {
  platform: string;
  tier: string;
  uptimePercent: number;
  downSeconds: number;
  meetsTarget: boolean | null;
  dataComplete: boolean;
  monitoringSince: string;
  events: { startedAt: string; durationSeconds: number; reason: string }[];
  note?: string;
};

function Verdict({ p }: { p: Platform }) {
  if (!p.dataComplete) {
    return <Badge variant="outline" className="bg-slate-100 text-slate-500 border-slate-200">No data</Badge>;
  }
  if (p.meetsTarget === null) {
    return <span className="text-xs text-slate-400">No SLA</span>;
  }
  return p.meetsTarget ? (
    <Badge variant="outline" className="bg-emerald-500/15 text-emerald-700 border-emerald-200">Met</Badge>
  ) : (
    <Badge variant="outline" className="bg-red-500/15 text-red-700 border-red-200">Breach</Badge>
  );
}

function UptimeCell({ p }: { p: Platform }) {
  if (!p.dataComplete) {
    return (
      <span className="text-slate-400 tabular-nums text-sm">
        n/a
        <span className="block text-[11px]">since {p.monitoringSince.slice(0, 10)}</span>
      </span>
    );
  }
  return (
    <span className={`tabular-nums text-sm font-medium ${p.meetsTarget === false ? "text-red-700" : "text-slate-900"}`}>
      {p.uptimePercent.toFixed(3)}%
    </span>
  );
}

function PlatformTable({ rows, basis }: { rows: Platform[]; basis?: boolean }) {
  if (rows.length === 0) {
    return <p className="text-sm text-slate-500 py-3">Nothing to report for this month.</p>;
  }
  return (
    <div className="overflow-x-auto border border-slate-200 rounded-lg">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200 text-left">
            <th className="px-3 py-2 text-xs font-medium text-slate-600">Platform</th>
            <th className="px-3 py-2 text-xs font-medium text-slate-600">Availability</th>
            <th className="px-3 py-2 text-xs font-medium text-slate-600">Downtime</th>
            <th className="px-3 py-2 text-xs font-medium text-slate-600">Outages</th>
            <th className="px-3 py-2 text-xs font-medium text-slate-600">
              {basis ? "Basis" : `Target ${AVAILABILITY_TARGET}%`}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.platform} className="border-b border-slate-100 last:border-0 align-top">
              <td className="px-3 py-2">
                <span className="text-slate-900">{p.platform}</span>
                {p.note && <span className="block text-[11px] text-amber-700 mt-0.5 max-w-md">{p.note}</span>}
              </td>
              <td className="px-3 py-2"><UptimeCell p={p} /></td>
              <td className="px-3 py-2 text-slate-600 tabular-nums">{fmtDuration(p.downSeconds)}</td>
              <td className="px-3 py-2 text-slate-600 tabular-nums">{p.events.length || "—"}</td>
              <td className="px-3 py-2">
                {basis ? (
                  <span className="text-[11px] text-slate-500">
                    {p.tier === "fundi-gd-staging" ? "Staging — excluded from SLA" : "Fundi-hosted — no SLA (14.1)"}
                  </span>
                ) : (
                  <Verdict p={p} />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function RetainerReport() {
  const months = recentMonths(12);
  const [month, setMonth] = useState(months[0]);

  const { data, isLoading, error } = trpc.retainer.sla.useQuery({ month }, { refetchOnWindowFocus: false });

  return (
    <div className="p-6 space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Fundi retainer — Monthly Report</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            CSS-2026-01 clause 15.2 · SLA performance · {monthLabel(month)}
          </p>
        </div>
        <select
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900"
        >
          {months.map((m) => (
            <option key={m} value={m}>{monthLabel(m)}</option>
          ))}
        </select>
      </header>

      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-slate-500 py-8">
          <Loader2 className="h-4 w-4 animate-spin" /> Reading uptime data…
        </div>
      )}

      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4 text-sm text-red-800">
            <p className="font-medium">SLA data unavailable.</p>
            <p className="mt-1">{error.message}</p>
            <p className="mt-1 text-xs text-red-700">
              Check that UPTIMEROBOT_API_KEY is set on this app.
            </p>
          </CardContent>
        </Card>
      )}

      {data && (
        <>
          {(data.drift.unclassified.length > 0 || data.drift.missing.length > 0) && (
            <Card className="border-amber-300 bg-amber-50">
              <CardContent className="p-4 text-sm text-amber-900">
                <p className="font-medium flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4" /> Monitor registry is out of date — fix before sending
                </p>
                {data.drift.unclassified.length > 0 && (
                  <p className="mt-1 text-xs">
                    In UptimeRobot but not classified, so absent from this report:{" "}
                    {data.drift.unclassified.map((m) => `${m.name} (${m.id})`).join(", ")}
                  </p>
                )}
                {data.drift.missing.length > 0 && (
                  <p className="mt-1 text-xs">
                    Classified here but missing from UptimeRobot:{" "}
                    {data.drift.missing.map((m) => m.platform).join(", ")}
                  </p>
                )}
                <p className="mt-1 text-xs">Update server/retainer-sla.ts.</p>
              </CardContent>
            </Card>
          )}

          <section className="space-y-2">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-slate-400" /> SLA performance
              </h2>
              <span className="text-[11px] text-slate-400">
                {data.slaPlatforms.length}/{data.expectedSlaCount} platforms · clause 14.5
              </span>
            </div>

            <p className="text-sm text-slate-700 max-w-3xl">{data.summary}</p>

            <PlatformTable rows={data.slaPlatforms as Platform[]} />

            <p className="text-[11px] text-slate-400 max-w-3xl">
              Availability is measured per calendar month against a {AVAILABILITY_TARGET}% commitment,
              which allows about 7.2 hours of downtime per month. Approved scheduled maintenance and
              upstream third-party failures are excluded under clause 14.5.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-900">Monitored, not part of the SLA</h2>
            <p className="text-xs text-slate-500 max-w-3xl">
              Staging environments and Fundi-hosted systems. Shown for completeness — no availability
              commitment attaches to either, and staging is excluded because clause 14.5 measures
              production.
            </p>
            <PlatformTable rows={data.contextPlatforms as Platform[]} basis />
          </section>

          {data.slaPlatforms.some((p) => p.events.length > 0) && (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-slate-900">Outage log</h2>
              <p className="text-xs text-slate-500 max-w-3xl">
                Evidence for the clause 14.3 response targets, and the basis for claiming any
                clause 14.5 exclusion.
              </p>
              <div className="space-y-3">
                {data.slaPlatforms
                  .filter((p) => p.events.length > 0)
                  .map((p) => (
                    <div key={p.platform} className="border border-slate-200 rounded-lg p-3">
                      <p className="text-sm font-medium text-slate-900 mb-1.5">{p.platform}</p>
                      <ul className="space-y-1">
                        {p.events.map((e) => (
                          <li key={e.startedAt} className="text-xs text-slate-600 tabular-nums">
                            {new Date(e.startedAt).toLocaleString("en-ZA")} · {fmtDuration(e.durationSeconds)} ·{" "}
                            {e.reason}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
              </div>
            </section>
          )}

          <p className="text-[11px] text-slate-400 pt-4 border-t border-slate-200 max-w-3xl">
            Remaining sections of clause 15.2 — development completed, maintenance performed, SEO
            activities, progress against backlog, outstanding defects, security incidents, hosting
            summary, third-party costs, risks and dependencies, next-month backlog — are not built yet.
          </p>
        </>
      )}
    </div>
  );
}
