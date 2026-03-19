import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Brain } from "lucide-react";

const SOURCE_META: Record<string, { label: string; color: string }> = {
  mcp:                    { label: "MCP",            color: "bg-purple-100 text-purple-700" },
  campaign_jarvis:        { label: "Jarvis",         color: "bg-blue-100 text-blue-700" },
  campaign_auto_agent:    { label: "Auto Agent",     color: "bg-indigo-100 text-indigo-700" },
  campaign_image_prompt:  { label: "Image Prompt",   color: "bg-pink-100 text-pink-700" },
  mailer_chat:            { label: "Mailer Chat",    color: "bg-orange-100 text-orange-700" },
  outreach_discover:      { label: "Outreach",       color: "bg-green-100 text-green-700" },
  outreach_email_draft:   { label: "Email Draft",    color: "bg-teal-100 text-teal-700" },
};

function SourceBadge({ source }: { source: string }) {
  const meta = SOURCE_META[source] ?? { label: source, color: "bg-slate-100 text-slate-700" };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${meta.color}`}>
      {meta.label}
    </span>
  );
}

function formatDate(d: string | Date) {
  return new Date(d).toLocaleString("en-ZA", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export default function AiLog() {
  const [limit, setLimit] = useState(200);
  const [sourceFilter, setSourceFilter] = useState<string>("all");

  const { data, isLoading } = trpc.ai.getInteractions.useQuery({ limit });

  const rows = data ?? [];
  const filtered = sourceFilter === "all"
    ? rows
    : rows.filter((r) => r.source === sourceFilter);

  const sources = Array.from(new Set(rows.map((r) => r.source))).sort();

  // Basic stats
  const total = rows.length;
  const errors = rows.filter((r) => r.isError).length;
  const bySource = sources.map((s) => ({
    source: s,
    count: rows.filter((r) => r.source === s).length,
  }));

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Brain className="w-6 h-6 text-[#2286c2]" />
        <h1 className="text-2xl font-semibold">AI Interaction Log</h1>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Total interactions" value={total} />
        <StatCard label="Errors" value={errors} accent={errors > 0 ? "text-red-600" : undefined} />
        {bySource.slice(0, 2).map((s) => (
          <StatCard key={s.source} label={SOURCE_META[s.source]?.label ?? s.source} value={s.count} />
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <select
          className="border rounded px-3 py-1.5 text-sm"
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
        >
          <option value="all">All sources</option>
          {sources.map((s) => (
            <option key={s} value={s}>{SOURCE_META[s]?.label ?? s}</option>
          ))}
        </select>
        <select
          className="border rounded px-3 py-1.5 text-sm"
          value={limit}
          onChange={(e) => setLimit(Number(e.target.value))}
        >
          <option value={100}>Last 100</option>
          <option value={200}>Last 200</option>
          <option value={500}>Last 500</option>
          <option value={1000}>Last 1000</option>
        </select>
        <span className="text-sm text-slate-500">{filtered.length} rows</span>
      </div>

      {/* Table */}
      {isLoading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <Brain className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>No interactions logged yet.</p>
          <p className="text-xs mt-1">They will appear here once the AI is used.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-xs text-slate-500 uppercase tracking-wide">
                <th className="px-4 py-3 font-medium">Time</th>
                <th className="px-4 py-3 font-medium">Source</th>
                <th className="px-4 py-3 font-medium">Tool / Action</th>
                <th className="px-4 py-3 font-medium">Client</th>
                <th className="px-4 py-3 font-medium">Input</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">
                    {formatDate(row.createdAt)}
                  </td>
                  <td className="px-4 py-2.5">
                    <SourceBadge source={row.source} />
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-700">{row.toolName}</td>
                  <td className="px-4 py-2.5 text-slate-600">{row.clientSlug ?? "—"}</td>
                  <td className="px-4 py-2.5 text-slate-500 max-w-xs truncate" title={row.inputSummary ?? ""}>
                    {row.inputSummary ?? "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    {row.isError ? (
                      <span className="text-xs text-red-600 font-medium">Error</span>
                    ) : (
                      <span className="text-xs text-emerald-600">OK</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className={`text-2xl font-semibold ${accent ?? "text-slate-800"}`}>{value}</p>
    </div>
  );
}
