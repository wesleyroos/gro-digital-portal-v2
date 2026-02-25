import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, Repeat, CalendarDays } from "lucide-react";
import { toast } from "sonner";
import { Link } from "wouter";

type SubType = "monthly" | "annual";
type SubStatus = "active" | "paused" | "cancelled";

type FormData = {
  clientSlug: string;
  clientName: string;
  description: string;
  amount: string;
  type: SubType;
  status: SubStatus;
};

const emptyForm = (): FormData => ({
  clientSlug: "",
  clientName: "",
  description: "",
  amount: "",
  type: "monthly",
  status: "active",
});

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function formatCurrency(value: string | number | null | undefined) {
  if (value === null || value === undefined) return "R0.00";
  const num = typeof value === "string" ? parseFloat(value) : value;
  return `R${num.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const STATUS_CONFIG: Record<SubStatus, { label: string; className: string }> = {
  active: { label: "Active", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  paused: { label: "Paused", className: "bg-amber-50 text-amber-700 border-amber-200" },
  cancelled: { label: "Cancelled", className: "bg-gray-100 text-gray-600 border-gray-200" },
};

export default function Subscriptions() {
  const utils = trpc.useUtils();
  const { data: subs = [], isLoading } = trpc.subscription.list.useQuery();
  const { data: existingClients = [] } = trpc.invoice.clients.useQuery();

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm());
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const create = trpc.subscription.create.useMutation({
    onSuccess: () => { utils.subscription.list.invalidate(); utils.invoice.metrics.invalidate(); toast.success("Subscription added"); setOpen(false); },
  });
  const update = trpc.subscription.update.useMutation({
    onSuccess: () => { utils.subscription.list.invalidate(); utils.invoice.metrics.invalidate(); toast.success("Subscription updated"); setOpen(false); },
  });
  const del = trpc.subscription.delete.useMutation({
    onSuccess: () => { utils.subscription.list.invalidate(); utils.invoice.metrics.invalidate(); toast.success("Subscription deleted"); setDeleteId(null); },
  });

  function openAdd() {
    setForm(emptyForm());
    setEditingId(null);
    setOpen(true);
  }

  function openEdit(sub: (typeof subs)[0]) {
    setForm({
      clientSlug: sub.clientSlug,
      clientName: sub.clientName,
      description: sub.description || "",
      amount: sub.amount,
      type: sub.type,
      status: sub.status,
    });
    setEditingId(sub.id);
    setOpen(true);
  }

  function onSelectClient(slug: string) {
    const client = existingClients.find(c => c.clientSlug === slug);
    if (client) {
      setForm(f => ({ ...f, clientSlug: client.clientSlug, clientName: client.clientName }));
    }
  }

  function handleSubmit() {
    const amount = parseFloat(form.amount);
    if (!form.clientSlug || !form.clientName || isNaN(amount) || amount <= 0) {
      toast.error("Please fill in all required fields");
      return;
    }
    if (editingId !== null) {
      update.mutate({ id: editingId, ...form, amount });
    } else {
      create.mutate({ ...form, amount });
    }
  }

  const activeSubs = subs.filter(s => s.status === "active");
  const mrr = activeSubs.filter(s => s.type === "monthly").reduce((sum, s) => sum + parseFloat(s.amount), 0);
  const annualRecurring = activeSubs.filter(s => s.type === "annual").reduce((sum, s) => sum + parseFloat(s.amount), 0);
  const arr = mrr * 12 + annualRecurring;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Subscriptions</h1>
          <p className="text-sm text-muted-foreground mt-1">Recurring contracts — defines MRR &amp; ARR. Create one per service per client.</p>
        </div>
        <Button onClick={openAdd} size="sm" className="gap-1.5">
          <Plus className="w-4 h-4" />
          Add Subscription
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="shadow-sm">
          <CardContent className="p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">MRR</p>
            <p className="text-2xl font-bold font-mono text-foreground">{formatCurrency(mrr)}</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Annual Recurring</p>
            <p className="text-2xl font-bold font-mono text-foreground">{formatCurrency(annualRecurring)}</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">ARR</p>
            <p className="text-2xl font-bold font-mono text-foreground">{formatCurrency(arr)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card className="shadow-sm">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Loading...</div>
          ) : subs.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No subscriptions yet.</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground px-5 py-3">Client</th>
                  <th className="text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground px-4 py-3 hidden sm:table-cell">Description</th>
                  <th className="text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground px-4 py-3">Type</th>
                  <th className="text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground px-4 py-3">Amount</th>
                  <th className="text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground px-4 py-3">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {subs.map(sub => {
                  const statusCfg = STATUS_CONFIG[sub.status];
                  return (
                    <tr key={sub.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-5 py-3.5">
                        <Link href={`/client/${sub.clientSlug}`} className="font-medium text-sm text-foreground hover:text-primary transition-colors">
                          {sub.clientName}
                        </Link>
                      </td>
                      <td className="px-4 py-3.5 text-sm text-muted-foreground hidden sm:table-cell">{sub.description || "—"}</td>
                      <td className="px-4 py-3.5">
                        {sub.type === "monthly" ? (
                          <span className="inline-flex items-center gap-1 text-[10px] bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full font-medium">
                            <Repeat className="w-2.5 h-2.5" /> Monthly
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded-full font-medium">
                            <CalendarDays className="w-2.5 h-2.5" /> Annual
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono font-semibold text-sm text-foreground">
                        {formatCurrency(sub.amount)}
                        <span className="text-[10px] font-normal text-muted-foreground">/{sub.type === "monthly" ? "mo" : "yr"}</span>
                      </td>
                      <td className="px-4 py-3.5">
                        <Badge variant="outline" className={`text-[10px] px-2 py-0.5 ${statusCfg.className}`}>
                          {statusCfg.label}
                        </Badge>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(sub)}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => setDeleteId(sub.id)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId !== null ? "Edit Subscription" : "Add Subscription"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {editingId === null && (
              <div>
                <p className="text-xs text-muted-foreground mb-1.5">Existing client</p>
                <Select onValueChange={onSelectClient}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Select a client…" />
                  </SelectTrigger>
                  <SelectContent>
                    {existingClients.map(c => (
                      <SelectItem key={c.clientSlug} value={c.clientSlug}>{c.clientName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <p className="text-xs text-muted-foreground mb-1.5">Client Name <span className="text-destructive">*</span></p>
                <Input className="h-9 text-sm" value={form.clientName} onChange={e => setForm(f => ({ ...f, clientName: e.target.value, clientSlug: f.clientSlug || slugify(e.target.value) }))} placeholder="Bison Mining Supplies" />
              </div>
              <div className="col-span-2">
                <p className="text-xs text-muted-foreground mb-1.5">Description</p>
                <Input className="h-9 text-sm" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Hosting & Support" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1.5">Amount <span className="text-destructive">*</span></p>
                <Input className="h-9 text-sm font-mono" type="number" min="0" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="1303.56" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1.5">Billing Cycle</p>
                <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v as SubType }))}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="annual">Annual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <p className="text-xs text-muted-foreground mb-1.5">Status</p>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v as SubStatus }))}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="paused">Paused</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
              <Button size="sm" onClick={handleSubmit} disabled={create.isPending || update.isPending}>
                {editingId !== null ? "Save Changes" : "Add Subscription"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Subscription?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">This will remove the subscription and affect your MRR/ARR figures. This cannot be undone.</p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" size="sm" onClick={() => deleteId !== null && del.mutate({ id: deleteId })} disabled={del.isPending}>
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
