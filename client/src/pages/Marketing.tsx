import { useState, useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { Megaphone, Plus, ArrowRight, Trash2, CheckCircle2, XCircle, AlertCircle, ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
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

type SortKey = "name" | "clientSlug" | "status" | "createdAt";
type SortDir = "asc" | "desc";

export default function Marketing() {
  const [, setLocation] = useLocation();
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newClientSlug, setNewClientSlug] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const { data: campaigns, refetch } = trpc.campaign.list.useQuery();
  const { data: clients } = trpc.invoice.clients.useQuery();

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
      setNewClientSlug("");
      setLocation(`/marketing/${data.id}`);
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

    // Try Q{q} {year}, then cycle forward through the remaining quarters/years
    for (let offset = 0; offset < 8; offset++) {
      const q = ((quarter - 1 + offset) % 4) + 1;
      const y = year + Math.floor((quarter - 1 + offset) / 4);
      const candidate = `Q${q} ${y} Instagram Campaign`;
      if (!existing.has(candidate.toLowerCase())) {
        setNewName(candidate);
        return;
      }
    }

    // Fallback: Campaign #n
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

  const sorted = useMemo(() => {
    if (!campaigns) return [];
    return [...campaigns].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") cmp = a.name.localeCompare(b.name);
      else if (sortKey === "clientSlug") cmp = a.clientSlug.localeCompare(b.clientSlug);
      else if (sortKey === "status") cmp = a.status.localeCompare(b.status);
      else if (sortKey === "createdAt") cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [campaigns, sortKey, sortDir]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center">
            <Megaphone className="w-5 h-5 text-violet-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight leading-none">Marketing Campaigns</h1>
            <p className="text-sm text-muted-foreground mt-0.5">AI-powered Instagram content automation</p>
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
        <div className="rounded-lg border border-border overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                {([
                  { key: "name", label: "Campaign" },
                  { key: "clientSlug", label: "Client" },
                  { key: "status", label: "Status" },
                  { key: "createdAt", label: "Created" },
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
                <th className="w-16" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-background">
              {sorted.map(c => (
                <tr
                  key={c.id}
                  onClick={() => setLocation(`/marketing/${c.id}`)}
                  className="cursor-pointer hover:bg-muted/40 transition-colors group"
                >
                  <td className="px-4 py-3 font-medium text-foreground group-hover:text-violet-700 transition-colors">
                    {c.name}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {clients?.find(cl => cl.clientSlug === c.clientSlug)?.clientName ?? c.clientSlug}
                  </td>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Campaign</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
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
