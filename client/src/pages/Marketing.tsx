import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { Megaphone, Plus, ArrowRight } from "lucide-react";
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

export default function Marketing() {
  const [, setLocation] = useLocation();
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newClientSlug, setNewClientSlug] = useState("");

  const { data: campaigns, refetch } = trpc.campaign.list.useQuery();
  const { data: clients } = trpc.invoice.clients.useQuery();
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {campaigns.map(c => (
            <button
              key={c.id}
              onClick={() => setLocation(`/marketing/${c.id}`)}
              className="text-left rounded-xl border bg-card p-5 hover:border-violet-300 hover:shadow-sm transition-all group"
            >
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{c.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{c.clientSlug}</p>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0 group-hover:text-violet-600 transition-colors mt-0.5" />
              </div>
              <Badge
                variant="outline"
                className={`text-[10px] px-2 py-0.5 font-medium ${STATUS_COLORS[c.status] ?? ""}`}
              >
                {STATUS_LABELS[c.status] ?? c.status}
              </Badge>
              <p className="text-[10px] text-muted-foreground mt-3">
                {new Date(c.createdAt).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" })}
              </p>
            </button>
          ))}
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
    </div>
  );
}
