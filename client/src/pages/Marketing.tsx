import { useState, useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { Megaphone, Plus, ArrowRight, Trash2, CheckCircle2, XCircle, AlertCircle, ChevronUp, ChevronDown, ChevronsUpDown, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

function ReadinessItem({ label, ok, note, warn }: { label: string; ok: boolean; note?: string; warn?: boolean }) {
  const Icon = ok ? CheckCircle2 : warn ? AlertCircle : XCircle;
  const color = ok ? "text-emerald-600" : warn ? "text-amber-500" : "text-red-500";
  return (
    <div className="flex items-center gap-2">
      <Icon className={`w-3.5 h-3.5 shrink-0 ${color}`} />
      <span className="text-xs text-foreground">{label}</span>
      {note && <span className="text-xs text-muted-foreground ml-auto">{note}</span>}
    </div>
  );
}

const STATUS_LABELS: Record<string, string> = {
  discovery: "Discovery",
  strategy: "Strategy",
  generating: "Generating",
  approval: "Approval",
  active: "Active",
  completed: "Completed",
};

const STATUS_COLORS: Record<string, string> = {
  discovery: "bg-gray-100 text-gray-700 border-gray-200",
  strategy: "bg-blue-50 text-blue-700 border-blue-200",
  generating: "bg-amber-50 text-amber-700 border-amber-200",
  approval: "bg-violet-50 text-violet-700 border-violet-200",
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  completed: "bg-gray-50 text-gray-500 border-gray-200",
};

const ALL_STATUSES = ["discovery", "strategy", "generating", "approval", "active", "completed"] as const;

type SortKey = "name" | "clientSlug" | "status" | "createdAt" | "createdBy" | "firstPostDate";
type SortDir = "asc" | "desc";

export default function Marketing() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const isClient = user?.role === "client";
  const isSuperAdmin = user?.role === "superAdmin";

  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newClientSlug, setNewClientSlug] = useState("");

  // Pre-fill clientSlug for client users once auth loads
  useEffect(() => {
    if (isClient && user?.clientSlug) setNewClientSlug(user.clientSlug);
  }, [isClient, user?.clientSlug]);
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [search, setSearch] = useState("");
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());

  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const { data: campaigns, refetch } = trpc.campaign.list.useQuery();
  const { data: clients } = trpc.invoice.clients.useQuery(undefined, { enabled: !isClient });

  const { data: igStatus } = trpc.instagram.getStatus.useQuery(
    { clientSlug: newClientSlug },
    { enabled: !!newClientSlug }
  );
  const { data: fbStatus } = trpc.facebook.getStatus.useQuery(
    { clientSlug: newClientSlug },
    { enabled: !!newClientSlug }
  );
  const { data: segmentStatus } = trpc.campaign.mailer.getSegmentStatus.useQuery(
    { clientSlug: newClientSlug },
    { enabled: !!newClientSlug }
  );
  const createMutation = trpc.campaign.create.useMutation({
    onSuccess: (data) => {
      refetch();
      setShowNew(false);
      setNewName("");
      if (!isClient) setNewClientSlug("");
      setLocation(isClient ? `/portal/marketing/${data.id}` : `/marketing/${data.id}`);
    },
    onError: () => toast.error("Failed to create campaign"),
  });
  const deleteMutation = trpc.campaign.delete.useMutation({
    onSuccess: () => { refetch(); setConfirmDeleteId(null); toast.success("Campaign deleted"); },
    onError: () => toast.error("Failed to delete campaign"),
  });

  // Handle instagram=connected toast
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("instagram") === "connected") {
      const client = params.get("client");
      toast.success(`Instagram connected${client ? ` for ${client}` : ""}`);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  function generateName() {
    const clientCampaigns = (campaigns ?? []).filter(c => c.clientSlug === newClientSlug);
    const existing = new Set(clientCampaigns.map(c => c.name.toLowerCase()));

    const now = new Date();
    const year = now.getFullYear();
    const quarter = Math.ceil((now.getMonth() + 1) / 4);

    for (let offset = 0; offset < 8; offset++) {
      const q = ((quarter - 1 + offset) % 4) + 1;
      const y = year + Math.floor((quarter - 1 + offset) / 4);
      const candidate = `Q${q} ${y} Instagram Campaign`;
      if (!existing.has(candidate.toLowerCase())) {
        setNewName(candidate);
        return;
      }
    }

    setNewName(`Campaign #${clientCampaigns.length + 1}`);
  }

  function handleCreate() {
    if (!newName.trim() || !newClientSlug) return;
    createMutation.mutate({ clientSlug: newClientSlug, name: newName.trim() });
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function toggleFilter(status: string) {
    setActiveFilters(prev => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }

  const clientNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of clients ?? []) map[c.clientSlug] = c.clientName;
    return map;
  }, [clients]);

  const filtered = useMemo(() => {
    if (!campaigns) return [];
    let list = [...campaigns];

    if (activeFilters.size > 0) {
      list = list.filter(c => activeFilters.has(c.status));
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(c =>
        c.name.toLowerCase().includes(q) ||
        (clientNameMap[c.clientSlug] ?? c.clientSlug).toLowerCase().includes(q)
      );
    }

    return list.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") cmp = a.name.localeCompare(b.name);
      else if (sortKey === "clientSlug") cmp = (clientNameMap[a.clientSlug] ?? a.clientSlug).localeCompare(clientNameMap[b.clientSlug] ?? b.clientSlug);
      else if (sortKey === "status") cmp = a.status.localeCompare(b.status);
      else if (sortKey === "createdAt") cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [campaigns, activeFilters, search, clientNameMap, sortKey, sortDir]);

  const hasFilters = activeFilters.size > 0 || search.trim().length > 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center">
            <Megaphone className="w-5 h-5 text-violet-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight leading-none">Marketing Campaigns</h1>
            <p className="text-sm text-muted-foreground mt-0.5">AI-powered social media content automation</p>
          </div>
        </div>
        <Button onClick={() => setShowNew(true)} size="sm" className="gap-2">
          <Plus className="w-4 h-4" />
          New Campaign
        </Button>
      </div>

      {!campaigns || campaigns.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-violet-500/10 flex items-center justify-center">
            <Megaphone className="w-8 h-8 text-violet-600" />
          </div>
          <div>
            <p className="font-semibold text-foreground">No campaigns yet</p>
            <p className="text-sm text-muted-foreground mt-1">Create a campaign to start automating your client's Instagram content.</p>
          </div>
          <Button onClick={() => setShowNew(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            New Campaign
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Search + filters toolbar */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-48 max-w-72">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search campaigns or clients..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8 h-8 text-sm"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              {ALL_STATUSES.map(status => (
                <button
                  key={status}
                  onClick={() => toggleFilter(status)}
                  className={`h-8 px-3 rounded-md border text-[11px] font-medium transition-colors ${
                    activeFilters.has(status)
                      ? STATUS_COLORS[status]
                      : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                  }`}
                >
                  {STATUS_LABELS[status]}
                </button>
              ))}
              {hasFilters && (
                <button
                  onClick={() => { setActiveFilters(new Set()); setSearch(""); }}
                  className="h-8 px-2.5 rounded-md text-[11px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                >
                  <X className="w-3 h-3" />
                  Clear
                </button>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-border overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 border-b border-border">
                  {([
                    { key: "name", label: "Campaign" },
                    ...(isClient ? [] : [{ key: "clientSlug" as SortKey, label: "Client" }]),
                    { key: "status", label: "Status" },
                    { key: "createdAt", label: "Created" },
                    ...(isSuperAdmin ? [{ key: "createdBy" as SortKey, label: "Set up by" }] : []),
                    { key: "firstPostDate" as SortKey, label: "Date Range" },
                  ] as { key: SortKey; label: string }[]).map(col => (
                    <th key={col.key} className="text-left px-4 py-3">
                      <button
                        onClick={() => toggleSort(col.key)}
                        className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {col.label}
                        {sortKey === col.key ? (
                          sortDir === "asc"
                            ? <ChevronUp className="w-3.5 h-3.5" />
                            : <ChevronDown className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronsUpDown className="w-3.5 h-3.5 opacity-40" />
                        )}
                      </button>
                    </th>
                  ))}
                  {!isClient && <th className="w-16" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-background">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={isClient ? 3 : 5} className="px-4 py-10 text-center text-sm text-muted-foreground">
                      No campaigns match your search or filters.
                    </td>
                  </tr>
                ) : (
                  filtered.map(c => (
                    <tr
                      key={c.id}
                      onClick={() => setLocation(isClient ? `/portal/marketing/${c.id}` : `/marketing/${c.id}`)}
                      className="cursor-pointer hover:bg-muted/40 transition-colors group"
                    >
                      <td className="px-4 py-3 font-medium text-foreground group-hover:text-violet-700 transition-colors">
                        {c.name}
                      </td>
                      {!isClient && (
                        <td className="px-4 py-3 text-muted-foreground">
                          {clientNameMap[c.clientSlug] ?? c.clientSlug}
                        </td>
                      )}
                      <td className="px-4 py-3">
                        <Badge
                          variant="outline"
                          className={`text-[10px] px-2 py-0.5 font-medium ${STATUS_COLORS[c.status] ?? ""}`}
                        >
                          {STATUS_LABELS[c.status] ?? c.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs tabular-nums">
                        {new Date(c.createdAt).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" })}
                      </td>
                      {isSuperAdmin && (
                        <td className="px-4 py-3 text-muted-foreground text-xs">
                          {c.createdBy ?? <span className="opacity-40">—</span>}
                        </td>
                      )}
                      <td className="px-4 py-3 text-muted-foreground text-xs tabular-nums whitespace-nowrap">
                        {c.firstPostDate && c.lastPostDate ? (
                          `${new Date(c.firstPostDate).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" })} – ${new Date(c.lastPostDate).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" })}`
                        ) : <span className="opacity-40">—</span>}
                      </td>
                      {!isClient && (
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={e => { e.stopPropagation(); setConfirmDeleteId(c.id); }}
                              className="p-1 rounded hover:bg-red-50 hover:text-red-600 text-muted-foreground transition-colors opacity-0 group-hover:opacity-100"
                              title="Delete"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                            <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-violet-600 transition-colors" />
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {filtered.length > 0 && (
            <p className="text-[11px] text-muted-foreground text-right">
              {filtered.length} of {campaigns.length} campaign{campaigns.length !== 1 ? "s" : ""}
            </p>
          )}
        </div>
      )}

      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Campaign</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {!isClient && (
              <div className="space-y-1.5">
                <Label>Client</Label>
                <Select value={newClientSlug} onValueChange={setNewClientSlug}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select client..." />
                  </SelectTrigger>
                  <SelectContent>
                    {(clients ?? []).map(c => (
                      <SelectItem key={c.clientSlug} value={c.clientSlug}>
                        {c.clientName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <div className="flex items-baseline gap-2">
                <Label>Campaign Name</Label>
                <button
                  type="button"
                  onClick={generateName}
                  disabled={!newClientSlug}
                  className="text-[11px] underline text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  generate
                </button>
              </div>
              <Input
                placeholder="e.g. Q1 2026 Instagram Campaign"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleCreate(); }}
              />
            </div>
          </div>

          {newClientSlug && (
            <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Client Readiness</p>
              <ReadinessItem
                label="Instagram connected"
                ok={!!igStatus?.connected}
                note={igStatus?.connected ? igStatus.username ?? undefined : "Connect in Settings"}
              />
              <ReadinessItem
                label="Facebook connected"
                ok={!!fbStatus?.connected}
                note={fbStatus?.connected ? fbStatus.pageName ?? undefined : "Connect in Settings"}
              />
              <ReadinessItem
                label="Subscriber list"
                ok={!!segmentStatus?.segmentId}
                note={
                  segmentStatus?.segmentId
                    ? `${segmentStatus.subscriberCount} subscriber${segmentStatus.subscriberCount === 1 ? "" : "s"}`
                    : "Set up in campaign mailer"
                }
                warn={!segmentStatus?.segmentId}
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNew(false)}>Cancel</Button>
            <Button
              onClick={handleCreate}
              disabled={!newName.trim() || !newClientSlug || createMutation.isPending}
            >
              Create Campaign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDeleteId !== null} onOpenChange={open => { if (!open) setConfirmDeleteId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete campaign?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">This will permanently delete the campaign, all its posts, and the chat history. This cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDeleteId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => confirmDeleteId !== null && deleteMutation.mutate({ id: confirmDeleteId })}
              disabled={deleteMutation.isPending}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
