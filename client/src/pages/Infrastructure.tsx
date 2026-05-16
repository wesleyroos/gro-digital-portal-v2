import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Server, RefreshCw, Loader2, ExternalLink, DollarSign, Activity, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import NotFound from "./NotFound";

type AppRow = {
  appName: string;
  orgSlug: string;
  clientSlug: string | null;
  label: string | null;
  status: string;
  regions: string[];
  machineCount: number;
  runningCount: number;
  vmSize: string | null;
  volumesGb: number;
  estimatedMtdCents: number;
  isEstimate: true;
};

const VIEW_KEY = "infrastructure_view_mode";
const FILTER_KEY = "infrastructure_filter";

function centsToUsd(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function statusBadgeClass(status: string) {
  if (status === "running") return "bg-emerald-500/15 text-emerald-700 border-emerald-200";
  if (status === "suspended") return "bg-amber-500/15 text-amber-700 border-amber-200";
  return "bg-slate-100 text-slate-500 border-slate-200";
}

function statusDot(status: string) {
  if (status === "running") return "bg-emerald-500";
  if (status === "suspended") return "bg-amber-400";
  return "bg-slate-400";
}

function EstimatePill({ cents }: { cents: number }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center gap-1 cursor-default">
          <span className="font-medium">{centsToUsd(cents)}</span>
          <Badge variant="outline" className="text-[9px] px-1 py-0 border-amber-300 text-amber-600">est.</Badge>
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs">
        Estimated from published Fly.io rates × machine runtime this month. Authoritative totals at{" "}
        <a href="https://fly.io/dashboard/billing" target="_blank" rel="noopener noreferrer" className="underline">fly.io/dashboard/billing</a>.
      </TooltipContent>
    </Tooltip>
  );
}

type AssignDialogProps = {
  row: AppRow;
  clientOptions: Array<{ clientSlug: string; clientName: string }>;
  onClose: () => void;
  onSaved: () => void;
};

function AssignDialog({ row, clientOptions, onClose, onSaved }: AssignDialogProps) {
  const [clientSlug, setClientSlug] = useState<string>(row.clientSlug ?? "__none__");
  const [label, setLabel] = useState(row.label ?? "");
  const [notes, setNotes] = useState("");
  const utils = trpc.useUtils();

  const assign = trpc.infrastructure.assignClient.useMutation({
    onSuccess: () => {
      toast.success("Saved");
      utils.infrastructure.listApps.invalidate();
      onSaved();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">{row.appName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Client</label>
            <Select value={clientSlug} onValueChange={setClientSlug}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Unassigned</SelectItem>
                {clientOptions.map(c => (
                  <SelectItem key={c.clientSlug} value={c.clientSlug}>
                    {c.clientName || c.clientSlug}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Display label (optional)</label>
            <input
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
              placeholder={row.appName}
              value={label}
              onChange={e => setLabel(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Notes (optional)</label>
            <textarea
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring resize-none"
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button
              size="sm"
              disabled={assign.isPending}
              onClick={() => assign.mutate({
                appName: row.appName,
                orgSlug: row.orgSlug,
                clientSlug: clientSlug === "__none__" ? null : clientSlug,
                label: label || null,
                notes: notes || null,
              })}
            >
              {assign.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Infrastructure() {
  const { user } = useAuth();
  if (user && user.role !== "superAdmin") return <NotFound />;

  const utils = trpc.useUtils();
  const [viewMode, setViewMode] = useState<"cards" | "list">(() => {
    const s = localStorage.getItem(VIEW_KEY);
    return s === "list" ? "list" : "cards";
  });
  const updateView = (mode: "cards" | "list") => {
    setViewMode(mode);
    localStorage.setItem(VIEW_KEY, mode);
  };

  const [filter, setFilter] = useState<string>(() => localStorage.getItem(FILTER_KEY) ?? "all");
  const updateFilter = (f: string) => {
    setFilter(f);
    localStorage.setItem(FILTER_KEY, f);
  };

  const [assignRow, setAssignRow] = useState<AppRow | null>(null);
  const [detailRow, setDetailRow] = useState<AppRow | null>(null);

  const appsQuery = trpc.infrastructure.listApps.useQuery(undefined, { refetchInterval: false });
  const summaryQuery = trpc.infrastructure.summary.useQuery(undefined, { refetchInterval: false });
  const clientsQuery = trpc.invoice.clients.useQuery();

  const refresh = trpc.infrastructure.refresh.useMutation({
    onSuccess: () => {
      utils.infrastructure.listApps.invalidate();
      utils.infrastructure.summary.invalidate();
      toast.success("Refreshed");
    },
    onError: (e) => toast.error(e.message),
  });

  const rows: AppRow[] = appsQuery.data?.rows ?? [];
  const fetchedAt = appsQuery.data?.fetchedAt ? new Date(appsQuery.data.fetchedAt) : null;

  const clientSlugs = [...new Set(rows.map(r => r.clientSlug).filter((s): s is string => !!s))];
  const filteredRows = filter === "all"
    ? rows
    : filter === "__unassigned__"
    ? rows.filter(r => !r.clientSlug)
    : rows.filter(r => r.clientSlug === filter);

  const totalMtdCents = rows.reduce((sum, r) => sum + r.estimatedMtdCents, 0);
  const runningCount = rows.reduce((sum, r) => sum + r.runningCount, 0);

  const clientOptions = (clientsQuery.data ?? []).map(c => ({
    clientSlug: c.clientSlug,
    clientName: c.clientName,
  }));

  const credits = summaryQuery.data?.credits ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Infrastructure</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {fetchedAt
              ? `Fly.io apps across all orgs — last fetched ${fetchedAt.toLocaleTimeString()}`
              : "Fly.io apps across all orgs"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border border-border bg-background p-0.5">
            <button
              onClick={() => updateView("cards")}
              className={`flex items-center gap-1 px-2 py-1 text-xs rounded ${viewMode === "cards" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Server className="h-3.5 w-3.5" />
              Cards
            </button>
            <button
              onClick={() => updateView("list")}
              className={`flex items-center gap-1 px-2 py-1 text-xs rounded ${viewMode === "list" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Activity className="h-3.5 w-3.5" />
              List
            </button>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refresh.mutate()}
            disabled={refresh.isPending || appsQuery.isFetching}
          >
            {(refresh.isPending || appsQuery.isFetching)
              ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              : <RefreshCw className="h-4 w-4 mr-2" />}
            Refresh
          </Button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Total apps</p>
            <p className="text-2xl font-bold mt-1">{rows.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Running machines</p>
            <p className="text-2xl font-bold mt-1 text-emerald-600">{runningCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Est. MTD spend</p>
            <div className="mt-1 flex items-baseline gap-1">
              <p className="text-2xl font-bold"><DollarSign className="inline h-5 w-5 text-muted-foreground" />{(totalMtdCents / 100).toFixed(2)}</p>
              <Badge variant="outline" className="text-[9px] px-1 py-0 border-amber-300 text-amber-600">est.</Badge>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Fly credit</p>
            <div className="space-y-0.5 mt-1">
              {credits.length === 0
                ? <p className="text-sm text-muted-foreground">—</p>
                : credits.map(c => (
                    <div key={c.orgSlug} className="flex items-center justify-between gap-2">
                      <span className="text-[11px] text-muted-foreground truncate">{c.orgSlug}</span>
                      <span className="text-sm font-semibold">{c.creditBalanceFormatted ?? "—"}</span>
                    </div>
                  ))
              }
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter chips */}
      {rows.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {[
            { key: "all", label: "All" },
            ...clientSlugs.map(s => ({ key: s, label: clientOptions.find(c => c.clientSlug === s)?.clientName || s })),
            { key: "__unassigned__", label: "Unassigned" },
          ].map(chip => (
            <button
              key={chip.key}
              onClick={() => updateFilter(chip.key)}
              className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                filter === chip.key
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {chip.label}
              {chip.key !== "all" && chip.key !== "__unassigned__" && (
                <span className="ml-1.5 opacity-60">
                  {rows.filter(r => r.clientSlug === chip.key).length}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* App list */}
      {appsQuery.isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 rounded-lg bg-muted/40 animate-pulse" />
          ))}
        </div>
      ) : appsQuery.isError ? (
        <Card>
          <CardContent className="p-8 text-center">
            <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-3" />
            <p className="font-medium">Failed to load apps</p>
            <p className="text-sm text-muted-foreground mt-1">{appsQuery.error.message}</p>
            <p className="text-xs text-muted-foreground mt-2">Make sure FLY_API_TOKEN and FLY_ORG_SLUGS are set.</p>
          </CardContent>
        </Card>
      ) : filteredRows.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center">
            <Server className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
            <p className="font-medium">No apps found</p>
            <p className="text-sm text-muted-foreground mt-1">
              {rows.length > 0 ? "No apps match this filter." : "Click Refresh to load apps from Fly.io."}
            </p>
          </CardContent>
        </Card>
      ) : viewMode === "cards" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filteredRows.map(row => (
            <Card key={row.appName} className="hover:shadow-sm transition-shadow cursor-pointer" onClick={() => setDetailRow(row)}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDot(row.status)}`} />
                    <p className="font-semibold text-sm truncate">{row.label || row.appName}</p>
                  </div>
                  <Badge variant="outline" className={`text-[10px] px-1.5 py-0 shrink-0 ${statusBadgeClass(row.status)}`}>
                    {row.status}
                  </Badge>
                </div>

                {row.label && (
                  <p className="text-[11px] text-muted-foreground mb-2 truncate">{row.appName}</p>
                )}

                <div className="flex flex-wrap gap-1 mb-3">
                  {row.clientSlug && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{row.clientSlug}</Badge>
                  )}
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">{row.orgSlug}</Badge>
                </div>

                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-muted-foreground pt-2 border-t border-border/50">
                  <div>{row.runningCount}/{row.machineCount} running</div>
                  <div>{row.regions.slice(0, 2).join(", ") || "—"}</div>
                  {row.vmSize && <div className="truncate">{row.vmSize}</div>}
                  {row.volumesGb > 0 && <div>{row.volumesGb} GB vol</div>}
                </div>

                <div className="flex items-center justify-between mt-3 pt-2 border-t border-border/50">
                  <EstimatePill cents={row.estimatedMtdCents} />
                  <button
                    className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2"
                    onClick={e => { e.stopPropagation(); setAssignRow(row); }}
                  >
                    Assign
                  </button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <div className="divide-y divide-border">
            {filteredRows.map(row => (
              <div
                key={row.appName}
                className="flex items-center gap-4 px-4 py-3 hover:bg-muted/30 transition-colors cursor-pointer"
                onClick={() => setDetailRow(row)}
              >
                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDot(row.status)}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-sm truncate">{row.label || row.appName}</p>
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 shrink-0 ${statusBadgeClass(row.status)}`}>
                      {row.status}
                    </Badge>
                    {row.clientSlug && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{row.clientSlug}</Badge>
                    )}
                  </div>
                  {row.label && <p className="text-[11px] text-muted-foreground mt-0.5">{row.appName}</p>}
                </div>
                <div className="hidden sm:block text-[11px] text-muted-foreground shrink-0 w-28 text-right">
                  {row.regions.slice(0, 2).join(", ") || "—"}
                </div>
                <div className="hidden md:block text-[11px] text-muted-foreground shrink-0 w-24 text-right">
                  {row.runningCount}/{row.machineCount} machines
                </div>
                <div className="shrink-0 w-24 text-right">
                  <EstimatePill cents={row.estimatedMtdCents} />
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <a
                    href={`https://fly.io/apps/${row.appName}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                  <button
                    className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2"
                    onClick={e => { e.stopPropagation(); setAssignRow(row); }}
                  >
                    Assign
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Assign dialog */}
      {assignRow && (
        <AssignDialog
          row={assignRow}
          clientOptions={clientOptions}
          onClose={() => setAssignRow(null)}
          onSaved={() => setAssignRow(null)}
        />
      )}

      {/* App detail dialog */}
      {detailRow && (
        <AppDetailDialog row={detailRow} onClose={() => setDetailRow(null)} />
      )}
    </div>
  );
}

function AppDetailDialog({ row, onClose }: { row: AppRow; onClose: () => void }) {
  const detailQuery = trpc.infrastructure.appDetail.useQuery({ appName: row.appName });

  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            {row.label || row.appName}
            <a
              href={`https://fly.io/apps/${row.appName}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          </DialogTitle>
        </DialogHeader>

        {detailQuery.isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : detailQuery.isError ? (
          <p className="text-sm text-destructive py-4">{detailQuery.error.message}</p>
        ) : (
          <div className="space-y-4">
            {/* Machines */}
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Machines</p>
              {detailQuery.data?.machines?.length === 0 ? (
                <p className="text-sm text-muted-foreground">No machines</p>
              ) : (
                <div className="divide-y divide-border rounded-md border">
                  {(detailQuery.data?.machines ?? []).map((m: {
                    id?: string;
                    region?: string;
                    state?: string;
                    config?: { guest?: { cpus?: number; memory_mb?: number; cpu_kind?: string } };
                    estimate?: { totalCents?: number };
                  }, i) => (
                    <div key={m.id ?? i} className="flex items-center justify-between px-3 py-2 text-sm gap-4">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${m.state === "started" ? "bg-emerald-500" : "bg-slate-400"}`} />
                        <span className="text-[11px] text-muted-foreground font-mono truncate">{m.id?.slice(0, 8) ?? "—"}</span>
                        <Badge variant="outline" className="text-[10px] px-1 py-0 shrink-0">{m.region ?? "?"}</Badge>
                      </div>
                      <div className="flex items-center gap-3 shrink-0 text-[11px] text-muted-foreground">
                        {m.config?.guest && (
                          <span>{m.config.guest.cpus ?? 1}×{m.config.guest.cpu_kind ?? "shared"}, {((m.config.guest.memory_mb ?? 0) / 1024).toFixed(0)}GB</span>
                        )}
                        <EstimatePill cents={m.estimate?.totalCents ?? 0} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Volumes */}
            {(detailQuery.data?.volumes?.length ?? 0) > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Volumes</p>
                <div className="divide-y divide-border rounded-md border">
                  {(detailQuery.data?.volumes ?? []).map((v: { id?: string; name?: string; size_gb?: number; estimateCents?: number }, i) => (
                    <div key={v.id ?? i} className="flex items-center justify-between px-3 py-2 text-sm">
                      <span className="text-[11px] text-muted-foreground font-mono">{v.name ?? v.id?.slice(0, 8) ?? "—"}</span>
                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                        <span>{v.size_gb ?? 0} GB</span>
                        <EstimatePill cents={v.estimateCents ?? 0} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p className="text-[11px] text-muted-foreground">
              Costs are estimates based on published Fly.io rates. Egress not included.{" "}
              <a href="https://fly.io/dashboard/billing" target="_blank" rel="noopener noreferrer" className="underline">View authoritative billing →</a>
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
