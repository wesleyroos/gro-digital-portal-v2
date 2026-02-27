import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, User, Phone, Mail, ChevronRight, Repeat, Wrench, ScrollText } from "lucide-react";
import { toast } from "sonner";

type Stage = "prospect" | "proposal" | "negotiation";

const STAGES: { key: Stage; label: string; color: string; bg: string }[] = [
  { key: "prospect", label: "Prospect", color: "text-sky-600", bg: "bg-sky-50 border-sky-200/60" },
  { key: "proposal", label: "Proposal", color: "text-violet-600", bg: "bg-violet-50 border-violet-200/60" },
  { key: "negotiation", label: "Negotiation", color: "text-amber-600", bg: "bg-amber-50 border-amber-200/60" },
];

function fmtShort(n: number) {
  return `R${n.toLocaleString("en-ZA", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

type LeadFormData = {
  name: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  monthlyValue: string;
  onceOffValue: string;
  stage: Stage;
  notes: string;
};

const emptyForm = (): LeadFormData => ({
  name: "",
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  monthlyValue: "",
  onceOffValue: "",
  stage: "prospect",
  notes: "",
});

export default function Leads() {
  const utils = trpc.useUtils();
  const { data: leads = [], isLoading } = trpc.lead.list.useQuery();
  const { data: allProposals = [] } = trpc.proposal.list.useQuery();
  type Lead = (typeof leads)[0];

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [form, setForm] = useState<LeadFormData>(emptyForm());
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  const createMutation = trpc.lead.create.useMutation({
    onSuccess: () => {
      utils.lead.list.invalidate();
      setDialogOpen(false);
      setForm(emptyForm());
      toast.success("Lead added");
    },
    onError: () => toast.error("Failed to add lead"),
  });

  const updateMutation = trpc.lead.update.useMutation({
    onSuccess: () => {
      utils.lead.list.invalidate();
      setDialogOpen(false);
      setEditingLead(null);
      setForm(emptyForm());
      toast.success("Lead updated");
    },
    onError: () => toast.error("Failed to update lead"),
  });

  const deleteMutation = trpc.lead.delete.useMutation({
    onSuccess: () => {
      utils.lead.list.invalidate();
      setDeleteConfirm(null);
      toast.success("Lead removed");
    },
    onError: () => toast.error("Failed to remove lead"),
  });

  const stageMutation = trpc.lead.update.useMutation({
    onSuccess: () => utils.lead.list.invalidate(),
  });

  function openCreate() {
    setEditingLead(null);
    setForm(emptyForm());
    setDialogOpen(true);
  }

  function openEdit(lead: Lead) {
    setEditingLead(lead);
    setForm({
      name: lead.name,
      contactName: lead.contactName ?? "",
      contactEmail: lead.contactEmail ?? "",
      contactPhone: lead.contactPhone ?? "",
      monthlyValue: lead.monthlyValue ?? "",
      onceOffValue: lead.onceOffValue ?? "",
      stage: lead.stage,
      notes: lead.notes ?? "",
    });
    setDialogOpen(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      name: form.name.trim(),
      contactName: form.contactName.trim() || null,
      contactEmail: form.contactEmail.trim() || null,
      contactPhone: form.contactPhone.trim() || null,
      monthlyValue: form.monthlyValue ? parseFloat(form.monthlyValue) : null,
      onceOffValue: form.onceOffValue ? parseFloat(form.onceOffValue) : null,
      stage: form.stage,
      notes: form.notes.trim() || null,
    };
    if (editingLead) {
      updateMutation.mutate({ id: editingLead.id, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  function advanceStage(lead: Lead) {
    const stageOrder: Stage[] = ["prospect", "proposal", "negotiation"];
    const idx = stageOrder.indexOf(lead.stage);
    if (idx < stageOrder.length - 1) {
      stageMutation.mutate({ id: lead.id, stage: stageOrder[idx + 1] });
    }
  }

  const stageMap = Object.fromEntries(
    STAGES.map(s => [s.key, leads.filter(l => l.stage === s.key)])
  ) as Record<Stage, Lead[]>;

  const totalMonthly = leads.reduce((sum, l) => sum + (l.monthlyValue ? parseFloat(l.monthlyValue) : 0), 0);
  const totalOnceOff = leads.reduce((sum, l) => sum + (l.onceOffValue ? parseFloat(l.onceOffValue) : 0), 0);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Leads</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {leads.length} lead{leads.length !== 1 ? "s" : ""}
            {totalMonthly > 0 && <> · <span className="font-mono">{fmtShort(totalMonthly)}/mo</span> recurring pipeline</>}
            {totalOnceOff > 0 && <> · <span className="font-mono">{fmtShort(totalOnceOff)}</span> once-off pipeline</>}
          </p>
        </div>
        <Button size="sm" className="gap-1.5 text-xs" onClick={openCreate}>
          <Plus className="w-3.5 h-3.5" />
          Add Lead
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-3 gap-4">
          {STAGES.map(s => (
            <Card key={s.key} className="shadow-sm animate-pulse">
              <CardContent className="p-4">
                <div className="h-4 bg-muted rounded w-1/2 mb-4" />
                <div className="space-y-2">
                  <div className="h-20 bg-muted rounded" />
                  <div className="h-20 bg-muted rounded" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {STAGES.map((stage) => {
            const stageLeads = stageMap[stage.key];
            const stageMonthly = stageLeads.reduce((sum, l) => sum + (l.monthlyValue ? parseFloat(l.monthlyValue) : 0), 0);
            const stageOnceOff = stageLeads.reduce((sum, l) => sum + (l.onceOffValue ? parseFloat(l.onceOffValue) : 0), 0);
            return (
              <div key={stage.key}>
                <div className="flex items-start justify-between mb-3 min-h-[40px]">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-semibold uppercase tracking-wider ${stage.color}`}>
                      {stage.label}
                    </span>
                    <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
                      {stageLeads.length}
                    </span>
                  </div>
                  <div className="flex flex-col items-end gap-0.5">
                    {stageMonthly > 0 && (
                      <span className={`text-[10px] font-mono ${stage.color}`}>{fmtShort(stageMonthly)}/mo</span>
                    )}
                    {stageOnceOff > 0 && (
                      <span className={`text-[10px] font-mono text-muted-foreground`}>{fmtShort(stageOnceOff)} once-off</span>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  {stageLeads.length === 0 && (
                    <div className="border border-dashed border-muted rounded-lg p-4 text-center">
                      <p className="text-[11px] text-muted-foreground/50">No leads</p>
                    </div>
                  )}
                  {stageLeads.map((lead) => (
                    <Card key={lead.id} className={`shadow-sm border ${stage.bg} group`}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <p className="text-sm font-semibold text-foreground leading-tight">{lead.name}</p>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                            <button
                              onClick={() => openEdit(lead)}
                              className="h-6 w-6 flex items-center justify-center hover:bg-background rounded transition-colors"
                              title="Edit"
                            >
                              <Pencil className="w-3 h-3 text-muted-foreground" />
                            </button>
                            <button
                              onClick={() => setDeleteConfirm(lead.id)}
                              className="h-6 w-6 flex items-center justify-center hover:bg-background rounded transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="w-3 h-3 text-muted-foreground" />
                            </button>
                          </div>
                        </div>

                        {/* Revenue values */}
                        <div className="space-y-0.5 mb-2">
                          {lead.monthlyValue && (
                            <div className="flex items-center gap-1.5">
                              <Repeat className="w-3 h-3 text-muted-foreground shrink-0" />
                              <span className="text-xs font-mono font-semibold text-foreground">
                                {fmtShort(parseFloat(lead.monthlyValue))}<span className="text-muted-foreground font-normal">/mo</span>
                              </span>
                            </div>
                          )}
                          {lead.onceOffValue && (
                            <div className="flex items-center gap-1.5">
                              <Wrench className="w-3 h-3 text-muted-foreground shrink-0" />
                              <span className="text-xs font-mono font-semibold text-foreground">
                                {fmtShort(parseFloat(lead.onceOffValue))}<span className="text-muted-foreground font-normal"> once-off</span>
                              </span>
                            </div>
                          )}
                        </div>

                        {lead.contactName && (
                          <div className="flex items-center gap-1 mb-0.5">
                            <User className="w-3 h-3 text-muted-foreground" />
                            <span className="text-[11px] text-muted-foreground">{lead.contactName}</span>
                          </div>
                        )}
                        {lead.contactEmail && (
                          <div className="flex items-center gap-1 mb-0.5">
                            <Mail className="w-3 h-3 text-muted-foreground" />
                            <span className="text-[11px] text-muted-foreground truncate">{lead.contactEmail}</span>
                          </div>
                        )}
                        {lead.contactPhone && (
                          <div className="flex items-center gap-1 mb-0.5">
                            <Phone className="w-3 h-3 text-muted-foreground" />
                            <span className="text-[11px] text-muted-foreground">{lead.contactPhone}</span>
                          </div>
                        )}

                        {lead.notes && (
                          <p className="text-[11px] text-muted-foreground mt-2 line-clamp-2 italic">{lead.notes}</p>
                        )}

                        {(() => {
                          const linked = allProposals.filter(p => p.leadId === lead.id);
                          if (!linked.length) return null;
                          const statusColor: Record<string, string> = {
                            draft: "bg-gray-100 text-gray-600 border-gray-200",
                            sent: "bg-blue-50 text-blue-700 border-blue-200",
                            viewed: "bg-amber-50 text-amber-700 border-amber-200",
                            accepted: "bg-green-50 text-green-700 border-green-200",
                            declined: "bg-red-50 text-red-700 border-red-200",
                          };
                          return (
                            <div className="mt-3 pt-3 border-t border-border/60">
                              <div className="flex items-center gap-1 mb-1.5">
                                <ScrollText className="w-3 h-3 text-muted-foreground" />
                                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Proposals</span>
                              </div>
                              <div className="flex flex-col gap-1">
                                {linked.map(p => (
                                  <a
                                    key={p.id}
                                    href={`/p/${p.token}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center justify-between gap-2 hover:bg-background/60 rounded px-1.5 py-1 -mx-1.5 transition-colors group"
                                  >
                                    <span className="text-[11px] text-foreground truncate leading-tight group-hover:text-primary transition-colors">
                                      {p.title}
                                    </span>
                                    <span className={`shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${statusColor[p.status] ?? statusColor.draft}`}>
                                      {p.status.charAt(0).toUpperCase() + p.status.slice(1)}
                                    </span>
                                  </a>
                                ))}
                              </div>
                            </div>
                          );
                        })()}

                        {stage.key !== "negotiation" && (
                          <button
                            onClick={() => advanceStage(lead)}
                            className="flex items-center gap-1 mt-3 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <ChevronRight className="w-3 h-3" />
                            <span>Move to {STAGES[STAGES.findIndex(s => s.key === stage.key) + 1]?.label}</span>
                          </button>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) { setEditingLead(null); setForm(emptyForm()); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingLead ? "Edit Lead" : "Add Lead"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Company / Name *</label>
              <Input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Fundi Consulting"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Contact Name</label>
                <Input
                  value={form.contactName}
                  onChange={e => setForm(f => ({ ...f, contactName: e.target.value }))}
                  placeholder="John Smith"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Stage</label>
                <Select value={form.stage} onValueChange={v => setForm(f => ({ ...f, stage: v as Stage }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STAGES.map(s => (
                      <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Email</label>
                <Input
                  type="email"
                  value={form.contactEmail}
                  onChange={e => setForm(f => ({ ...f, contactEmail: e.target.value }))}
                  placeholder="john@company.com"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Phone</label>
                <Input
                  value={form.contactPhone}
                  onChange={e => setForm(f => ({ ...f, contactPhone: e.target.value }))}
                  placeholder="+27 82 000 0000"
                />
              </div>
            </div>

            {/* Revenue fields */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground block">Revenue</label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center gap-1 mb-1">
                    <Repeat className="w-3 h-3 text-muted-foreground" />
                    <span className="text-[11px] text-muted-foreground">Monthly recurring (R/mo)</span>
                  </div>
                  <Input
                    type="number"
                    value={form.monthlyValue}
                    onChange={e => setForm(f => ({ ...f, monthlyValue: e.target.value }))}
                    placeholder="70000"
                    min={0}
                  />
                </div>
                <div>
                  <div className="flex items-center gap-1 mb-1">
                    <Wrench className="w-3 h-3 text-muted-foreground" />
                    <span className="text-[11px] text-muted-foreground">Once-off project fee (R)</span>
                  </div>
                  <Input
                    type="number"
                    value={form.onceOffValue}
                    onChange={e => setForm(f => ({ ...f, onceOffValue: e.target.value }))}
                    placeholder="50000"
                    min={0}
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Notes</label>
              <Textarea
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Any relevant context..."
                rows={3}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {editingLead ? "Save Changes" : "Add Lead"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirm dialog */}
      <Dialog open={deleteConfirm !== null} onOpenChange={(open) => { if (!open) setDeleteConfirm(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove Lead</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Are you sure you want to remove this lead? This cannot be undone.</p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={deleteMutation.isPending}
              onClick={() => deleteConfirm !== null && deleteMutation.mutate({ id: deleteConfirm })}
            >
              Remove
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
