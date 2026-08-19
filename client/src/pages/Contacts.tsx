import { trpc } from "@/lib/trpc";
import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, Mail, Phone, MessageCircle, Ban, ShieldCheck, Building2 } from "lucide-react";
import { toast } from "sonner";
import { canMarket, displayName } from "@shared/contacts";

type Basis = "none" | "existing_customer" | "explicit_optin";

const BASIS_LABEL: Record<Basis, string> = {
  none: "No basis",
  existing_customer: "Existing customer",
  explicit_optin: "Opted in",
};

type OrgLink = { organisationId: number; role: string };

type ContactForm = {
  organisations: OrgLink[];
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  consentBasis: Basis;
  notes: string;
};

const emptyForm = (): ContactForm => ({
  organisations: [],
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  consentBasis: "none",
  notes: "",
});

function Tile({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

export default function Contacts() {
  const utils = trpc.useUtils();
  const { data: contacts = [], isLoading, error } = trpc.contact.list.useQuery();
  const { data: organisations = [] } = trpc.organisation.list.useQuery();
  type Row = (typeof contacts)[0];

  const [search, setSearch] = useState("");
  const [orgFilter, setOrgFilter] = useState("all");
  const [view, setView] = useState<"all" | "no-phone" | "no-email" | "marketable">("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [form, setForm] = useState<ContactForm>(emptyForm());
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  const invalidate = () => utils.contact.list.invalidate();
  const fail = (e: { message: string }) => toast.error(e.message);

  const createMutation = trpc.contact.create.useMutation({
    onSuccess: () => { invalidate(); setDialogOpen(false); setForm(emptyForm()); toast.success("Contact added"); },
    onError: fail,
  });
  const updateMutation = trpc.contact.update.useMutation({
    onSuccess: () => { invalidate(); setDialogOpen(false); setEditing(null); setForm(emptyForm()); toast.success("Contact updated"); },
    onError: fail,
  });
  const deleteMutation = trpc.contact.delete.useMutation({
    onSuccess: () => { invalidate(); setDeleteConfirm(null); toast.success("Contact deleted"); },
    onError: fail,
  });
  const waMutation = trpc.contact.setWhatsappOptIn.useMutation({ onSuccess: invalidate, onError: fail });
  const optOutMutation = trpc.contact.setOptOut.useMutation({ onSuccess: invalidate, onError: fail });

  const stats = useMemo(() => {
    const real = contacts.filter((c) => !c.isInternal);
    return {
      total: real.length,
      email: real.filter((c) => canMarket(c, "email")).length,
      sms: real.filter((c) => canMarket(c, "sms")).length,
      whatsapp: real.filter((c) => canMarket(c, "whatsapp")).length,
      noPhone: real.filter((c) => !c.phone).length,
    };
  }, [contacts]);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return contacts.filter((c) => {
      if (orgFilter !== "all" && !c.organisations.some((o) => String(o.id) === orgFilter)) return false;
      if (view === "no-phone" && (c.phone || c.isInternal)) return false;
      if (view === "no-email" && (c.email || c.isInternal)) return false;
      if (view === "marketable" && !canMarket(c, "email")) return false;
      if (!term) return true;
      return [c.firstName, c.lastName, c.email, c.phone, ...c.organisations.map((o) => o.name), ...c.organisations.map((o) => o.role)]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term));
    });
  }, [contacts, search, orgFilter, view]);

  function openNew() {
    setEditing(null);
    setForm(emptyForm());
    setDialogOpen(true);
  }

  function openEdit(c: Row) {
    setEditing(c);
    setForm({
      organisations: c.organisations.map((o) => ({ organisationId: o.id, role: o.role ?? "" })),
      firstName: c.firstName ?? "",
      lastName: c.lastName ?? "",
      email: c.email ?? "",
      phone: c.phone ?? "",
      consentBasis: c.consentBasis as Basis,
      notes: c.notes ?? "",
    });
    setDialogOpen(true);
  }

  function submit() {
    const payload = {
      organisations: form.organisations.map((o) => ({ organisationId: o.organisationId, role: o.role.trim() || null })),
      firstName: form.firstName.trim() || null,
      lastName: form.lastName.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      consentBasis: form.consentBasis,
      notes: form.notes.trim() || null,
    };
    if (editing) updateMutation.mutate({ id: editing.id, ...payload });
    else createMutation.mutate(payload);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Contacts</h1>
          <p className="text-sm text-muted-foreground">
            The master list. One row per person, one number format, a consent basis on each.
          </p>
        </div>
        <Button onClick={openNew}>
          <Plus className="mr-2 h-4 w-4" /> Add contact
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Tile label="People" value={stats.total} hint="excluding our own team" />
        <Tile label="Email" value={stats.email} hint="marketable now" />
        <Tile label="SMS" value={stats.sms} hint="marketable now" />
        <Tile label="WhatsApp" value={stats.whatsapp} hint="opted in for marketing" />
        <Tile label="No cell" value={stats.noPhone} hint="the gap to close" />
      </div>

      <div className="flex flex-wrap gap-2">
        <Input
          placeholder="Search name, email, number, company…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select value={orgFilter} onValueChange={setOrgFilter}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All companies</SelectItem>
            {organisations.map((o) => (
              <SelectItem key={o.id} value={String(o.id)}>{o.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={view} onValueChange={(v) => setView(v as typeof view)}>
          <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Everyone</SelectItem>
            <SelectItem value="no-phone">Missing a cell number</SelectItem>
            <SelectItem value="no-email">Missing an email</SelectItem>
            <SelectItem value="marketable">Marketable on email</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="p-6 text-sm text-muted-foreground">Loading…</p>
          ) : error ? (
            <div className="p-6">
              <p className="text-sm font-medium text-red-600">Could not load contacts.</p>
              <p className="mt-1 text-sm text-muted-foreground">{error.message}</p>
            </div>
          ) : rows.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              Nothing here. {contacts.length === 0 && "Run scripts/backfill-contacts.ts to populate from the existing data."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40">
                  <tr className="text-left">
                    <th className="px-4 py-2.5 font-medium">Person</th>
                    <th className="px-4 py-2.5 font-medium">Company</th>
                    <th className="px-4 py-2.5 font-medium">Email</th>
                    <th className="px-4 py-2.5 font-medium">Cell</th>
                    <th className="px-4 py-2.5 font-medium">Basis</th>
                    <th className="px-4 py-2.5 font-medium">Rails</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((c) => (
                    <tr key={c.id} className="hover:bg-muted/30">
                      <td className="px-4 py-2.5">
                        <span className="font-medium">{displayName(c)}</span>
                        {c.isInternal && (
                          <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-600">
                            internal
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {c.organisations.length === 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <div className="space-y-0.5">
                            {c.organisations.map((o) => (
                              <span key={o.id} className="flex items-center gap-1.5">
                                <Building2 className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                                {o.name}
                                {o.role && <span className="text-xs text-muted-foreground">{o.role}</span>}
                                <span className="text-xs text-muted-foreground">{o.stage}</span>
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {c.email ?? <span className="text-amber-600">missing</span>}
                      </td>
                      <td className="px-4 py-2.5 tabular-nums">
                        {c.phone ?? <span className="text-amber-600">missing</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={c.consentBasis === "none" ? "text-muted-foreground" : ""}>
                          {BASIS_LABEL[c.consentBasis as Basis]}
                        </span>
                        {c.optedOutAt && <p className="text-xs text-red-600">opted out</p>}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="inline-flex items-center gap-2">
                          <Mail className={`h-4 w-4 ${canMarket(c, "email") ? "text-emerald-600" : "text-muted-foreground/30"}`} />
                          <Phone className={`h-4 w-4 ${canMarket(c, "sms") ? "text-emerald-600" : "text-muted-foreground/30"}`} />
                          <button
                            title={c.whatsappOptInAt ? "WhatsApp marketing opt-in recorded" : "No WhatsApp opt-in — marketing templates would risk the number"}
                            onClick={() => waMutation.mutate({ id: c.id, optedIn: !c.whatsappOptInAt })}
                          >
                            <MessageCircle className={`h-4 w-4 ${canMarket(c, "whatsapp") ? "text-emerald-600" : "text-muted-foreground/30"}`} />
                          </button>
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            title={c.optedOutAt ? "Undo opt-out" : "Record an opt-out"}
                            onClick={() => optOutMutation.mutate({ id: c.id, optedOut: !c.optedOutAt })}
                          >
                            {c.optedOutAt ? <ShieldCheck className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => openEdit(c)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => setDeleteConfirm(c.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit contact" : "Add contact"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input placeholder="First name" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
            <Input placeholder="Last name" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
            <Input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <Input placeholder="Cell (082… or +27…)" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <div className="sm:col-span-2 space-y-2">
              <p className="text-sm font-medium">Companies they act for</p>
              {form.organisations.map((link, i) => (
                <div key={i} className="flex gap-2">
                  <Select
                    value={String(link.organisationId)}
                    onValueChange={(v) => {
                      const next = [...form.organisations];
                      next[i] = { ...next[i], organisationId: Number(v) };
                      setForm({ ...form, organisations: next });
                    }}
                  >
                    <SelectTrigger className="flex-1"><SelectValue placeholder="Company" /></SelectTrigger>
                    <SelectContent>
                      {organisations.map((o) => (
                        <SelectItem key={o.id} value={String(o.id)}>{o.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    className="w-40"
                    placeholder="Role there"
                    value={link.role}
                    onChange={(e) => {
                      const next = [...form.organisations];
                      next[i] = { ...next[i], role: e.target.value };
                      setForm({ ...form, organisations: next });
                    }}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setForm({ ...form, organisations: form.organisations.filter((_, j) => j !== i) })}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                disabled={organisations.length === 0}
                onClick={() => setForm({
                  ...form,
                  organisations: [...form.organisations, { organisationId: organisations[0].id, role: "" }],
                })}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" /> Add a company
              </Button>
              <p className="text-xs text-muted-foreground">
                One person, one row, however many companies they act for — so the same admin is never
                sent a campaign twice.
              </p>
            </div>
            <div className="sm:col-span-2">
              <Select value={form.consentBasis} onValueChange={(v) => setForm({ ...form, consentBasis: v as Basis })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No basis — service messages only</SelectItem>
                  <SelectItem value="existing_customer">Existing customer (POPIA s69(3)(a))</SelectItem>
                  <SelectItem value="explicit_optin">Explicitly opted in</SelectItem>
                </SelectContent>
              </Select>
              <p className="mt-1.5 text-xs text-muted-foreground">
                WhatsApp marketing needs its own opt-in on top of this — toggle it on the row.
              </p>
            </div>
            <Textarea
              className="sm:col-span-2"
              placeholder="Notes"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={createMutation.isPending || updateMutation.isPending}>
              {editing ? "Save" : "Add contact"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteConfirm !== null} onOpenChange={(o) => !o && setDeleteConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete this contact?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            This removes the person from the master list. Their consent record goes with them.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirm !== null && deleteMutation.mutate({ id: deleteConfirm })}
            >
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
