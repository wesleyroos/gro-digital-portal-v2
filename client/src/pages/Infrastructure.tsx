import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Server, RefreshCw, Loader2, ExternalLink, DollarSign, Activity, AlertCircle, Plus, Pencil, Trash2 } from "lucide-react";
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
  source: "fly";
};

type ManualRow = {
  id: number;
  name: string;
  provider: string;
  clientSlug: string | null;
  label: string | null;
  monthlyCostUsd: number;
  notes: string | null;
  source: "manual";
};

const VIEW_KEY = "infrastructure_view_mode";
const FILTER_KEY = "infrastructure_filter";

function centsToUsd(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function centsToZar(cents: number, rate: number) {
  return `R${((cents / 100) * rate).toFixed(2)}`;
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

function EstimatePill({ cents, rate }: { cents: number; rate?: number | null }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center gap-1 cursor-default flex-wrap">
          <span className="font-medium">{centsToUsd(cents)}</span>
          {rate ? <span className="text-muted-foreground text-[11px]">≈ {centsToZar(cents, rate)}</span> : null}
          <Badge variant="outline" className="text-[9px] px-1 py-0 border-amber-300 text-amber-600">est.</Badge>
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs">
        Worst-case estimate: all machines billed at full rate for the entire month to date, regardless of sleep/suspend. Actual cost will be equal or lower. Authoritative totals at{" "}
        <a href="https://fly.io/dashboard/billing" target="_blank" rel="noopener noreferrer" className="underline">fly.io/dashboard/billing</a>.
      </TooltipContent>
    </Tooltip>
  );
}

function FixedPill({ usd, rate }: { usd: number; rate?: number | null }) {
  return (
    <span className="inline-flex items-center gap-1 flex-wrap">
      <span className="font-medium">${usd.toFixed(2)}</span>
      {rate ? <span className="text-muted-foreground text-[11px]">≈ R{(usd * rate).toFixed(2)}</span> : null}
      <Badge variant="outline" className="text-[9px] px-1 py-0 border-blue-300 text-blue-600">fixed/mo</Badge>
    </span>
  );
}

type ManualAppDialogProps = {
  initial?: ManualRow | null;
  clientOptions: Array<{ clientSlug: string; clientName: string }>;
  onClose: () => void;
  onSaved: () => void;
};

function ManualAppDialog({ initial, clientOptions, onClose, onSaved }: ManualAppDialogProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [provider, setProvider] = useState(initial?.provider ?? "");
  const [clientSlug, setClientSlug] = useState(initial?.clientSlug ?? "__none__");
  const [monthlyCostUsd, setMonthlyCostUsd] = useState(String(initial?.monthlyCostUsd ?? ""));
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const utils = trpc.useUtils();

  const save = trpc.infrastructure.saveManualApp.useMutation({
    onSuccess: () => {
      toast.success(initial ? "Updated" : "Added");
      utils.infrastructure.listManualApps.invalidate();
      onSaved();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">{initial ? "Edit app" : "Add manual app"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-1">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Name</label>
            <input
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
              placeholder="fundihealth"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Provider</label>
            <input
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
              placeholder="Replit / Vercel / Supabase…"
              value={provider}
              onChange={e => setProvider(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Monthly cost (USD)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
              placeholder="20.00"
              value={monthlyCostUsd}
              onChange={e => setMonthlyCostUsd(e.target.value)}
            />
          </div>
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
              disabled={save.isPending || !name.trim() || !provider.trim()}
              onClick={() => save.mutate({
                id: initial?.id,
                name: name.trim(),
                provider: provider.trim(),
                clientSlug: clientSlug === "__none__" ? null : clientSlug,
                label: null,
                monthlyCostUsd: parseFloat(monthlyCostUsd) || 0,
                notes: notes.trim() || null,
              })}
            >
              {save.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
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
  const [tab, setTab] = useState<"apps" | "backups">("apps");

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
  const [manualDialog, setManualDialog] = useState<ManualRow | null | "new">(null);
  const [deletingManual, setDeletingManual] = useState<number | null>(null);

  const [rateOverride, setRateOverride] = useState("");

  const rateQuery = trpc.infrastructure.exchangeRate.useQuery(undefined, { refetchInterval: false, staleTime: 60 * 60 * 1000 });
  const liveRate = rateQuery.data?.rate ?? null;
  const effectiveRate = rateOverride ? (parseFloat(rateOverride) || null) : liveRate;

  const appsQuery = trpc.infrastructure.listApps.useQuery(undefined, { refetchInterval: false });
  const summaryQuery = trpc.infrastructure.summary.useQuery(undefined, { refetchInterval: false });
  const manualAppsQuery = trpc.infrastructure.listManualApps.useQuery(undefined, { refetchInterval: false });
  const clientsQuery = trpc.invoice.clients.useQuery();

  const deleteManual = trpc.infrastructure.deleteManualApp.useMutation({
    onSuccess: () => {
      toast.success("Deleted");
      utils.infrastructure.listManualApps.invalidate();
      setDeletingManual(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const refresh = trpc.infrastructure.refresh.useMutation({
    onSuccess: () => {
      utils.infrastructure.listApps.invalidate();
      utils.infrastructure.summary.invalidate();
      toast.success("Refreshed");
    },
    onError: (e) => toast.error(e.message),
  });

  const rows: AppRow[] = (appsQuery.data?.rows ?? []).map(r => ({ ...r, source: "fly" as const }));
  const manualRows: ManualRow[] = (manualAppsQuery.data ?? []).map(r => ({
    id: r.id,
    name: r.name,
    provider: r.provider,
    clientSlug: r.clientSlug,
    label: r.label,
    monthlyCostUsd: parseFloat(r.monthlyCostUsd ?? "0"),
    notes: r.notes,
    source: "manual" as const,
  }));
  const fetchedAt = appsQuery.data?.fetchedAt ? new Date(appsQuery.data.fetchedAt) : null;

  const allClientSlugs = [...new Set([
    ...rows.map(r => r.clientSlug),
    ...manualRows.map(r => r.clientSlug),
  ].filter((s): s is string => !!s))];

  const filteredRows = filter === "all"
    ? rows
    : filter === "__unassigned__"
    ? rows.filter(r => !r.clientSlug)
    : rows.filter(r => r.clientSlug === filter);

  const filteredManual = filter === "all"
    ? manualRows
    : filter === "__unassigned__"
    ? manualRows.filter(r => !r.clientSlug)
    : manualRows.filter(r => r.clientSlug === filter);

  const totalMtdCents = filteredRows.reduce((sum, r) => sum + r.estimatedMtdCents, 0);
  const manualTotalUsd = filteredManual.reduce((sum, r) => sum + r.monthlyCostUsd, 0);
  const runningCount = filteredRows.reduce((sum, r) => sum + r.runningCount, 0);

  const clientOptions = (clientsQuery.data ?? []).map(c => ({
    clientSlug: c.clientSlug,
    clientName: c.clientName,
  }));

  const filterLabel = filter === "all" ? null
    : filter === "__unassigned__" ? "Unassigned"
    : clientOptions.find(c => c.clientSlug === filter)?.clientName || filter;

  const credits = summaryQuery.data?.credits ?? [];

  return (
    <div className="space-y-6">
      {/* Tab bar */}
      <div className="flex gap-1 border-b border-border">
        {(["apps", "backups"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors ${
              tab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "backups" ? "Backups" : "Apps"}
          </button>
        ))}
      </div>

      {/* Backups tab */}
      {tab === "backups" && <BackupsView />}

      {tab === "apps" && <>
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
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="hidden sm:inline">1 USD =</span>
            {liveRate
              ? <span className="font-medium text-foreground">R{liveRate.toFixed(2)}</span>
              : <span className="italic">{rateQuery.isLoading ? "loading…" : "unavailable"}</span>}
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="Override rate"
              value={rateOverride}
              onChange={e => setRateOverride(e.target.value)}
              className="w-28 h-7 rounded-md border border-input bg-background px-2 text-xs outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
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
            onClick={() => setManualDialog("new")}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add app
          </Button>
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
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
              {filterLabel ? `${filterLabel} apps` : "Total apps"}
            </p>
            <p className="text-2xl font-bold mt-1">{filteredRows.length + filteredManual.length}</p>
            {filterLabel && (rows.length + manualRows.length) !== (filteredRows.length + filteredManual.length) && (
              <p className="text-[11px] text-muted-foreground mt-0.5">{rows.length + manualRows.length} total</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
              {filterLabel ? `${filterLabel} running` : "Running machines"}
            </p>
            <p className="text-2xl font-bold mt-1 text-emerald-600">{runningCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
              {filterLabel ? `${filterLabel} monthly` : "Est. monthly total"}
            </p>
            <div className="mt-1 flex items-baseline gap-1 flex-wrap">
              <p className="text-2xl font-bold">
                <DollarSign className="inline h-5 w-5 text-muted-foreground" />
                {((totalMtdCents / 100) + manualTotalUsd).toFixed(2)}
              </p>
              <Badge variant="outline" className="text-[9px] px-1 py-0 border-amber-300 text-amber-600">est.</Badge>
            </div>
            {effectiveRate && (
              <p className="text-sm font-semibold text-muted-foreground mt-0.5">
                ≈ R{(((totalMtdCents / 100) + manualTotalUsd) * effectiveRate).toFixed(2)}
              </p>
            )}
            {manualTotalUsd > 0 && (
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Fly est. + ${manualTotalUsd.toFixed(2)} fixed
              </p>
            )}
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
      {(rows.length > 0 || manualRows.length > 0) && (
        <div className="flex flex-wrap gap-2">
          {[
            { key: "all", label: "All" },
            ...allClientSlugs.map(s => ({ key: s, label: clientOptions.find(c => c.clientSlug === s)?.clientName || s })),
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
                  {rows.filter(r => r.clientSlug === chip.key).length + manualRows.filter(r => r.clientSlug === chip.key).length}
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
                  <EstimatePill cents={row.estimatedMtdCents} rate={effectiveRate} />
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
                  <EstimatePill cents={row.estimatedMtdCents} rate={effectiveRate} />
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

      {/* Manual apps section */}
      {filteredManual.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Other providers</p>
          <Card>
            <div className="divide-y divide-border">
              {filteredManual.map(row => (
                <div key={row.id} className="flex items-center gap-4 px-4 py-3">
                  <div className="w-1.5 h-1.5 rounded-full shrink-0 bg-blue-400" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-sm">{row.label || row.name}</p>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-blue-200 text-blue-700">{row.provider}</Badge>
                      {row.clientSlug && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{row.clientSlug}</Badge>
                      )}
                    </div>
                    {row.notes && <p className="text-[11px] text-muted-foreground mt-0.5">{row.notes}</p>}
                  </div>
                  <div className="shrink-0 text-right">
                    <FixedPill usd={row.monthlyCostUsd} rate={effectiveRate} />
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => setManualDialog(row)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => setDeletingManual(row.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
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

      {/* Manual app add/edit dialog */}
      {manualDialog !== null && (
        <ManualAppDialog
          initial={manualDialog === "new" ? null : manualDialog}
          clientOptions={clientOptions}
          onClose={() => setManualDialog(null)}
          onSaved={() => setManualDialog(null)}
        />
      )}

      {/* Delete confirmation */}
      {deletingManual !== null && (
        <Dialog open onOpenChange={open => !open && setDeletingManual(null)}>
          <DialogContent className="max-w-xs">
            <DialogHeader>
              <DialogTitle className="text-base">Delete app?</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">This will remove it from the infrastructure page.</p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setDeletingManual(null)}>Cancel</Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={deleteManual.isPending}
                onClick={() => deleteManual.mutate({ id: deletingManual })}
              >
                {deleteManual.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                Delete
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* App detail dialog */}
      {detailRow && (
        <AppDetailDialog row={detailRow} rate={effectiveRate} onClose={() => setDetailRow(null)} />
      )}
      </> }
    </div>
  );
}

function BackupsView() {
  const utils = trpc.useUtils();
  const backupsQuery = trpc.infrastructure.listBackups.useQuery(undefined, { refetchInterval: false });
  const takeSnapshot = trpc.infrastructure.takeSnapshot.useMutation({
    onSuccess: () => {
      toast.success("Snapshot created");
      utils.infrastructure.listBackups.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const [copiedId, setCopiedId] = useState<string | null>(null);

  function copyCommand(text: string, id: string) {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function formatBytes(bytes: number) {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function ageLabel(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const h = Math.floor(diff / 3_600_000);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }

  if (backupsQuery.isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2].map(i => <div key={i} className="h-40 rounded-lg bg-muted/40 animate-pulse" />)}
      </div>
    );
  }

  if (backupsQuery.isError) {
    return (
      <Card><CardContent className="p-8 text-center">
        <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-3" />
        <p className="font-medium">Failed to load backups</p>
        <p className="text-sm text-muted-foreground mt-1">{backupsQuery.error.message}</p>
      </CardContent></Card>
    );
  }

  const dbs = backupsQuery.data ?? [];

  if (dbs.length === 0) {
    return (
      <Card><CardContent className="p-10 text-center">
        <Server className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
        <p className="font-medium">No database apps found</p>
      </CardContent></Card>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Fly automatically snapshots each database volume daily. Retention is 5 days.
        To restore, fork the volume from a snapshot — the CLI command is pre-filled below.
      </p>

      {dbs.map(db => (
        <div key={db.appName}>
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="font-semibold text-sm">{db.appName}</p>
              <p className="text-[11px] text-muted-foreground">{db.orgSlug}</p>
            </div>
            {db.volumes.map(v => (
              <Button
                key={v.id}
                variant="outline"
                size="sm"
                disabled={takeSnapshot.isPending}
                onClick={() => takeSnapshot.mutate({ appName: db.appName, volumeId: v.id, orgSlug: db.orgSlug })}
              >
                {takeSnapshot.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                Take snapshot now
              </Button>
            ))}
          </div>

          {db.volumes.map(vol => (
            <Card key={vol.id}>
              <div className="px-4 py-2 border-b border-border flex items-center gap-3">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Volume: {vol.name}</span>
                <span className="text-[11px] text-muted-foreground">{vol.size_gb} GB</span>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-emerald-200 text-emerald-700">auto-backup on</Badge>
                <span className="text-[11px] text-muted-foreground ml-auto">{vol.snapshots.length} snapshots · {vol.snapshot_retention}-day retention</span>
              </div>
              <div className="divide-y divide-border">
                {vol.snapshots.length === 0 ? (
                  <p className="px-4 py-4 text-sm text-muted-foreground">No snapshots yet</p>
                ) : vol.snapshots.map(snap => {
                  const restoreCmd = `fly volumes fork ${vol.id} --from-snapshot ${snap.id} --app ${db.appName}`;
                  const isCopied = copiedId === snap.id;
                  return (
                    <div key={snap.id} className="flex items-center gap-4 px-4 py-3">
                      <div className="w-1.5 h-1.5 rounded-full shrink-0 bg-emerald-500" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{new Date(snap.created_at).toLocaleString()}</p>
                        <p className="text-[11px] text-muted-foreground font-mono mt-0.5 truncate">{snap.id}</p>
                      </div>
                      <div className="text-[11px] text-muted-foreground shrink-0 text-right">
                        <p>{formatBytes(snap.size)}</p>
                        <p>{ageLabel(snap.created_at)}</p>
                      </div>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => copyCommand(restoreCmd, snap.id)}
                            className={`shrink-0 text-xs px-2 py-1 rounded border transition-colors ${
                              isCopied
                                ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                                : "border-border text-muted-foreground hover:text-foreground hover:border-foreground"
                            }`}
                          >
                            {isCopied ? "Copied!" : "Copy restore cmd"}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-sm text-xs font-mono break-all">
                          {restoreCmd}
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  );
                })}
              </div>
            </Card>
          ))}
        </div>
      ))}
    </div>
  );
}

function AppDetailDialog({ row, rate, onClose }: { row: AppRow; rate?: number | null; onClose: () => void }) {
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
                        <EstimatePill cents={m.estimate?.totalCents ?? 0} rate={rate} />
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
                        <EstimatePill cents={v.estimateCents ?? 0} rate={rate} />
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
