import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Plus, Link2, MoreHorizontal, Trash2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

type Status = "draft" | "sent" | "viewed" | "accepted" | "declined";
type AssignedType = "client" | "lead" | "none";

const STATUS_CONFIG: Record<Status, { label: string; className: string }> = {
  draft:    { label: "Draft",    className: "bg-gray-100 text-gray-600 border-gray-200" },
  sent:     { label: "Sent",     className: "bg-blue-50 text-blue-700 border-blue-200" },
  viewed:   { label: "Viewed",   className: "bg-amber-50 text-amber-700 border-amber-200" },
  accepted: { label: "Accepted", className: "bg-green-50 text-green-700 border-green-200" },
  declined: { label: "Declined", className: "bg-red-50 text-red-700 border-red-200" },
};

function StatusBadge({ status }: { status: Status }) {
  const { label, className } = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${className}`}>
      {label}
    </span>
  );
}

type FormData = {
  title: string;
  assignedType: AssignedType;
  assignedName: string;
  clientSlug: string;
  leadId: string;
  externalEmail: string;
  htmlContent: string;
  status: Status;
};

const emptyForm = (): FormData => ({
  title: "",
  assignedType: "none",
  assignedName: "",
  clientSlug: "",
  leadId: "",
  externalEmail: "",
  htmlContent: "",
  status: "draft",
});

export default function Proposals() {
  const utils = trpc.useUtils();
  const { data: proposals = [], isLoading } = trpc.proposal.list.useQuery();
  const { data: leads = [] } = trpc.lead.list.useQuery();
  const { data: clients = [] } = trpc.invoice.clients.useQuery();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [form, setForm] = useState<FormData>(emptyForm());
  const [saving, setSaving] = useState(false);

  const createMutation = trpc.proposal.create.useMutation({
    onSuccess: () => {
      utils.proposal.list.invalidate();
      setSheetOpen(false);
      setForm(emptyForm());
      toast.success("Proposal created");
    },
    onError: () => toast.error("Failed to create proposal"),
  });

  const updateMutation = trpc.proposal.update.useMutation({
    onSuccess: () => { utils.proposal.list.invalidate(); toast.success("Updated"); },
    onError: () => toast.error("Failed to update"),
  });

  const deleteMutation = trpc.proposal.delete.useMutation({
    onSuccess: () => { utils.proposal.list.invalidate(); toast.success("Deleted"); },
    onError: () => toast.error("Failed to delete"),
  });

  function set(field: keyof FormData, value: string) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  async function handleSubmit() {
    if (!form.title.trim() || !form.htmlContent.trim()) {
      toast.error("Title and HTML content are required");
      return;
    }
    setSaving(true);
    try {
      await createMutation.mutateAsync({
        title: form.title.trim(),
        htmlContent: form.htmlContent.trim(),
        status: form.status,
        assignedType: form.assignedType,
        assignedName: form.assignedName.trim() || null,
        clientSlug: form.assignedType === "client" ? form.clientSlug.trim() || null : null,
        leadId: form.assignedType === "lead" && form.leadId ? parseInt(form.leadId) : null,
        externalEmail: form.assignedType !== "none" ? form.externalEmail.trim() || null : null,
      });
    } finally {
      setSaving(false);
    }
  }

  function copyLink(token: string) {
    const url = `${window.location.origin}/p/${token}`;
    navigator.clipboard.writeText(url).then(() => toast.success("Link copied")).catch(() => toast.error("Failed to copy"));
  }

  function openLink(token: string) {
    window.open(`/p/${token}`, "_blank");
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold tracking-tight">Proposals</h1>
        <Button size="sm" className="gap-1.5" onClick={() => { setForm(emptyForm()); setSheetOpen(true); }}>
          <Plus className="w-4 h-4" />
          New Proposal
        </Button>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : proposals.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
          <p className="text-sm text-muted-foreground">No proposals yet.</p>
          <Button variant="outline" size="sm" onClick={() => { setForm(emptyForm()); setSheetOpen(true); }}>
            Create your first proposal
          </Button>
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40 border-b border-border">
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Title</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Recipient</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Created</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody>
              {proposals.map((p, i) => (
                <tr key={p.id} className={`border-b border-border last:border-0 ${i % 2 === 0 ? "" : "bg-muted/20"}`}>
                  <td className="px-4 py-3 font-medium text-foreground">{p.title}</td>
                  <td className="px-4 py-3 text-muted-foreground">{p.assignedName || "—"}</td>
                  <td className="px-4 py-3">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="hover:opacity-70 transition-opacity">
                          <StatusBadge status={p.status as Status} />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        {(["draft", "sent", "viewed", "accepted", "declined"] as Status[]).map(s => (
                          <DropdownMenuItem
                            key={s}
                            onClick={() => updateMutation.mutate({ id: p.id, status: s })}
                            className={p.status === s ? "font-semibold" : ""}
                          >
                            {STATUS_CONFIG[s].label}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {format(new Date(p.createdAt), "d MMM yyyy")}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        title="Copy share link"
                        onClick={() => copyLink(p.token)}
                      >
                        <Link2 className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        title="Open proposal"
                        onClick={() => openLink(p.token)}
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <MoreHorizontal className="w-3.5 h-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => deleteMutation.mutate({ id: p.id })}
                          >
                            <Trash2 className="w-3.5 h-3.5 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* New Proposal Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader className="px-6 pt-6 pb-4 border-b border-border">
            <SheetTitle>New Proposal</SheetTitle>
          </SheetHeader>

          <div className="px-6 py-5 space-y-5">
            <div className="space-y-1.5">
              <Label className="text-xs">Title</Label>
              <Input
                placeholder="e.g. Digital Transformation — Bison Mining"
                value={form.title}
                onChange={e => set("title", e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Status</Label>
                <Select value={form.status} onValueChange={v => set("status", v)}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="sent">Sent</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Assign to</Label>
                <Select value={form.assignedType} onValueChange={v => set("assignedType", v as AssignedType)}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="client">Client</SelectItem>
                    <SelectItem value="lead">Lead</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {form.assignedType === "client" && (
              <div className="space-y-1.5">
                <Label className="text-xs">Client</Label>
                <Select value={form.clientSlug} onValueChange={v => {
                  set("clientSlug", v);
                  const client = clients.find(c => c.clientSlug === v);
                  if (client) set("assignedName", client.clientName);
                }}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Select a client…" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map(c => (
                      <SelectItem key={c.clientSlug} value={c.clientSlug}>{c.clientName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {form.assignedType === "lead" && (
              <div className="space-y-1.5">
                <Label className="text-xs">Lead</Label>
                <Select value={form.leadId} onValueChange={v => {
                  set("leadId", v);
                  const lead = leads.find(l => String(l.id) === v);
                  if (lead) set("assignedName", lead.name);
                }}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Select a lead…" />
                  </SelectTrigger>
                  <SelectContent>
                    {leads.map(l => (
                      <SelectItem key={l.id} value={String(l.id)}>{l.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {form.assignedType !== "none" && (
              <div className="space-y-1.5">
                <Label className="text-xs">Recipient email (optional)</Label>
                <Input
                  type="email"
                  placeholder="contact@example.com"
                  value={form.externalEmail}
                  onChange={e => set("externalEmail", e.target.value)}
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">HTML Content</Label>
              <p className="text-xs text-muted-foreground">Paste the full HTML generated by Claude Code</p>
              <Textarea
                className="font-mono text-xs resize-none"
                rows={14}
                placeholder="<!DOCTYPE html>…"
                value={form.htmlContent}
                onChange={e => set("htmlContent", e.target.value)}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setSheetOpen(false)}>Cancel</Button>
              <Button onClick={handleSubmit} disabled={saving}>
                {saving ? "Saving…" : "Create Proposal"}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
