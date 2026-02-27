import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Plus, Link2, MoreHorizontal, Trash2, ExternalLink, Pencil, Eye, MapPin, CheckCircle2, ChevronRight, Clock } from "lucide-react";
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

type Proposal = {
  id: number;
  token: string;
  title: string;
  status: string;
  assignedType: string;
  assignedName?: string | null;
  clientSlug?: string | null;
  leadId?: number | null;
  externalEmail?: string | null;
  htmlContent: string;
  createdAt: Date | string;
  sentAt?: Date | string | null;
  viewedAt?: Date | string | null;
  viewerIp?: string | null;
  viewerLocation?: string | null;
  acceptedAt?: Date | string | null;
  acceptedBy?: string | null;
};

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
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm());
  const [saving, setSaving] = useState(false);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailProposal, setDetailProposal] = useState<Proposal | null>(null);

  const { data: viewLog = [] } = trpc.proposal.getViews.useQuery(
    { id: detailProposal?.id ?? 0 },
    { enabled: !!detailProposal && detailOpen },
  );

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
    onSuccess: () => {
      utils.proposal.list.invalidate();
      if (editingId !== null) { setSheetOpen(false); setEditingId(null); setForm(emptyForm()); }
      // Also refresh detail if open
      if (detailOpen && detailProposal) utils.proposal.getViews.invalidate({ id: detailProposal.id });
      toast.success("Updated");
    },
    onError: () => toast.error("Failed to update"),
  });

  const deleteMutation = trpc.proposal.delete.useMutation({
    onSuccess: () => {
      utils.proposal.list.invalidate();
      setDetailOpen(false);
      toast.success("Deleted");
    },
    onError: () => toast.error("Failed to delete"),
  });

  function set(field: keyof FormData, value: string) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  function openEdit(p: Proposal, e?: React.MouseEvent) {
    e?.stopPropagation();
    setEditingId(p.id);
    setForm({
      title: p.title,
      assignedType: (p.assignedType as AssignedType) ?? "none",
      assignedName: p.assignedName ?? "",
      clientSlug: p.clientSlug ?? "",
      leadId: p.leadId != null ? String(p.leadId) : "",
      externalEmail: p.externalEmail ?? "",
      htmlContent: p.htmlContent,
      status: p.status as Status,
    });
    setSheetOpen(true);
  }

  function openDetail(p: Proposal) {
    setDetailProposal(p);
    setDetailOpen(true);
  }

  async function handleSubmit() {
    if (!form.title.trim() || !form.htmlContent.trim()) {
      toast.error("Title and HTML content are required");
      return;
    }
    setSaving(true);
    try {
      if (editingId !== null) {
        await updateMutation.mutateAsync({
          id: editingId,
          title: form.title.trim(),
          htmlContent: form.htmlContent.trim(),
          status: form.status,
          assignedType: form.assignedType,
          assignedName: form.assignedName.trim() || null,
          clientSlug: form.assignedType === "client" ? form.clientSlug.trim() || null : null,
          leadId: form.leadId ? parseInt(form.leadId) : null,
          externalEmail: form.assignedType !== "none" ? form.externalEmail.trim() || null : null,
        });
      } else {
        await createMutation.mutateAsync({
          title: form.title.trim(),
          htmlContent: form.htmlContent.trim(),
          status: form.status,
          assignedType: form.assignedType,
          assignedName: form.assignedName.trim() || null,
          clientSlug: form.assignedType === "client" ? form.clientSlug.trim() || null : null,
          leadId: form.leadId ? parseInt(form.leadId) : null,
          externalEmail: form.assignedType !== "none" ? form.externalEmail.trim() || null : null,
        });
      }
    } finally {
      setSaving(false);
    }
  }

  function copyLink(token: string, e?: React.MouseEvent) {
    e?.stopPropagation();
    const url = `${window.location.origin}/p/${token}`;
    navigator.clipboard.writeText(url).then(() => toast.success("Link copied")).catch(() => toast.error("Failed to copy"));
  }

  function openLink(token: string, e?: React.MouseEvent) {
    e?.stopPropagation();
    window.open(`/p/${token}`, "_blank");
  }

  // Keep detail proposal in sync when list refreshes
  const syncedDetail = detailProposal
    ? (proposals.find(p => p.id === detailProposal.id) ?? detailProposal)
    : null;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold tracking-tight">Proposals</h1>
        <Button size="sm" className="gap-1.5" onClick={() => { setForm(emptyForm()); setEditingId(null); setSheetOpen(true); }}>
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
                <tr
                  key={p.id}
                  className={`border-b border-border last:border-0 cursor-pointer hover:bg-muted/30 transition-colors ${i % 2 === 0 ? "" : "bg-muted/20"}`}
                  onClick={() => openDetail(p)}
                >
                  <td className="px-4 py-3 font-medium text-foreground">
                    <span className="flex items-center gap-1.5">
                      {p.title}
                      <ChevronRight className="w-3 h-3 text-muted-foreground/50" />
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{p.assignedName || "—"}</td>
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
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
                    {p.viewedAt && p.status !== 'accepted' && (
                      <div className="mt-1 space-y-0.5">
                        <p className="text-[11px] text-muted-foreground">
                          Link opened {format(new Date(p.viewedAt), "d MMM yyyy")}
                        </p>
                        {p.viewerLocation && (
                          <p className="text-[11px] text-muted-foreground/70">📍 {p.viewerLocation}</p>
                        )}
                      </div>
                    )}
                    {p.acceptedAt && p.status === 'accepted' && (
                      <div className="mt-1 space-y-0.5">
                        <p className="text-[11px] text-green-700 font-medium">
                          {format(new Date(p.acceptedAt), "d MMM yyyy")}
                        </p>
                        {p.acceptedBy && (
                          <p className="text-[11px] text-muted-foreground">{p.acceptedBy}</p>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {format(new Date(p.createdAt), "d MMM yyyy")}
                  </td>
                  <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="Copy share link" onClick={e => copyLink(p.token, e)}>
                        <Link2 className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="Open proposal" onClick={e => openLink(p.token, e)}>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <MoreHorizontal className="w-3.5 h-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={e => openEdit(p, e)}>
                            <Pencil className="w-3.5 h-3.5 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={e => { e.stopPropagation(); deleteMutation.mutate({ id: p.id }); }}
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

      {/* Detail sheet */}
      <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
        <SheetContent className="w-full sm:max-w-lg flex flex-col">
          {syncedDetail && (
            <>
              <SheetHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <SheetTitle className="text-base leading-snug">{syncedDetail.title}</SheetTitle>
                    {syncedDetail.assignedName && (
                      <p className="text-xs text-muted-foreground mt-0.5">{syncedDetail.assignedName}</p>
                    )}
                  </div>
                  <div className="shrink-0 flex items-center gap-1.5 mt-0.5">
                    <Button variant="outline" size="sm" className="h-7 w-7 p-0" title="Copy link" onClick={e => copyLink(syncedDetail.token, e)}>
                      <Link2 className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="outline" size="sm" className="h-7 w-7 p-0" title="Open proposal" onClick={e => openLink(syncedDetail.token, e)}>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </SheetHeader>

              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

                {/* Status + dates */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Status</span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="hover:opacity-70 transition-opacity">
                          <StatusBadge status={syncedDetail.status as Status} />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {(["draft", "sent", "viewed", "accepted", "declined"] as Status[]).map(s => (
                          <DropdownMenuItem
                            key={s}
                            onClick={() => updateMutation.mutate({ id: syncedDetail.id, status: s })}
                            className={syncedDetail.status === s ? "font-semibold" : ""}
                          >
                            {STATUS_CONFIG[s].label}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-muted-foreground">Created</span>
                      <p className="font-medium mt-0.5">{format(new Date(syncedDetail.createdAt), "d MMM yyyy")}</p>
                    </div>
                    {syncedDetail.sentAt && (
                      <div>
                        <span className="text-muted-foreground">Sent</span>
                        <p className="font-medium mt-0.5">{format(new Date(syncedDetail.sentAt), "d MMM yyyy")}</p>
                      </div>
                    )}
                    {syncedDetail.externalEmail && (
                      <div className="col-span-2">
                        <span className="text-muted-foreground">Recipient email</span>
                        <p className="font-medium mt-0.5">{syncedDetail.externalEmail}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Accepted section */}
                {syncedDetail.acceptedAt && (
                  <div className="rounded-lg border border-green-200 bg-green-50/50 p-4 space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                      <span className="text-xs font-semibold text-green-700 uppercase tracking-wide">Accepted</span>
                    </div>
                    <p className="text-sm font-medium text-foreground">
                      {format(new Date(syncedDetail.acceptedAt), "d MMM yyyy 'at' HH:mm")}
                    </p>
                    {syncedDetail.acceptedBy && (
                      <p className="text-xs text-muted-foreground">{syncedDetail.acceptedBy}</p>
                    )}
                  </div>
                )}

                {/* View log */}
                <div>
                  <div className="flex items-center gap-1.5 mb-3">
                    <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      View Log
                    </span>
                    {viewLog.length > 0 && (
                      <span className="ml-1 text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full font-medium">
                        {viewLog.length} {viewLog.length === 1 ? "open" : "opens"}
                      </span>
                    )}
                  </div>
                  {viewLog.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">No views recorded yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {viewLog.map((v, i) => (
                        <div key={v.id} className="flex items-start gap-3 py-2.5 border-b border-border last:border-0">
                          <div className="w-6 h-6 bg-muted rounded-full flex items-center justify-center shrink-0 mt-0.5">
                            <span className="text-[10px] font-bold text-muted-foreground">{viewLog.length - i}</span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 text-xs text-foreground font-medium">
                              <Clock className="w-3 h-3 text-muted-foreground shrink-0" />
                              {format(new Date(v.viewedAt), "d MMM yyyy 'at' HH:mm")}
                            </div>
                            {v.viewerLocation && (
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                                <MapPin className="w-3 h-3 shrink-0" />
                                {v.viewerLocation}
                              </div>
                            )}
                            {v.viewerIp && (
                              <p className="text-[11px] text-muted-foreground/60 mt-0.5 font-mono">{v.viewerIp}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>

              {/* Actions footer */}
              <div className="shrink-0 px-6 py-4 border-t border-border flex items-center justify-between gap-2">
                <Button
                  variant="ghost" size="sm"
                  className="text-destructive hover:text-destructive gap-1.5 text-xs"
                  onClick={() => deleteMutation.mutate({ id: syncedDetail.id })}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete
                </Button>
                <Button size="sm" className="gap-1.5" onClick={() => openEdit(syncedDetail)}>
                  <Pencil className="w-3.5 h-3.5" />
                  Edit Proposal
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Create / Edit sheet */}
      <Sheet open={sheetOpen} onOpenChange={v => { setSheetOpen(v); if (!v) { setEditingId(null); setForm(emptyForm()); } }}>
        <SheetContent className="w-full sm:max-w-xl flex flex-col">
          <SheetHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0">
            <SheetTitle>{editingId !== null ? "Edit Proposal" : "New Proposal"}</SheetTitle>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
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

            {form.assignedType !== "lead" && leads.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs">Link to lead <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Select value={form.leadId || "_none"} onValueChange={v => set("leadId", v === "_none" ? "" : v)}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">None</SelectItem>
                    {leads.map(l => (
                      <SelectItem key={l.id} value={String(l.id)}>{l.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">This proposal will appear on the linked lead's card in the CRM.</p>
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

          </div>

          <div className="shrink-0 px-6 py-4 border-t border-border flex justify-end gap-2">
            <Button variant="outline" onClick={() => setSheetOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={saving}>
              {saving ? "Saving…" : editingId !== null ? "Save Changes" : "Create Proposal"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
