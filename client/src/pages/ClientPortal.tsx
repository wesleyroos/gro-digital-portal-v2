import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Link, useParams } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  FileText,
  ArrowRight,
  Globe,
  ChevronLeft,
  Repeat,
  CalendarDays,
  AlertCircle,
  Mail,
  Phone,
  User,
  NotebookPen,
  CheckCircle2,
  Check,
  X,
  Circle,
} from "lucide-react";

function formatCurrency(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "R0.00";
  const num = typeof value === "string" ? parseFloat(value) : value;
  return `R${num.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    draft: { label: "Draft", className: "bg-gray-100 text-gray-700 border-gray-200" },
    sent: { label: "Awaiting Payment", className: "bg-amber-50 text-amber-700 border-amber-200" },
    paid: { label: "Paid", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    overdue: { label: "Overdue", className: "bg-red-50 text-red-700 border-red-200" },
  };
  const c = config[status] || config.sent;
  return (
    <Badge variant="outline" className={`${c.className} text-[10px] font-medium px-2 py-0.5`}>
      {c.label}
    </Badge>
  );
}

function TypeIcon({ type }: { type: string }) {
  if (type === "monthly") return <Repeat className="w-5 h-5 text-blue-500" />;
  if (type === "annual") return <CalendarDays className="w-5 h-5 text-purple-500" />;
  return <FileText className="w-5 h-5 text-primary" />;
}

function TypeLabel({ type }: { type: string }) {
  if (type === "monthly")
    return <span className="text-[10px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-medium">Monthly</span>;
  if (type === "annual")
    return <span className="text-[10px] bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full font-medium">Annual</span>;
  return <span className="text-[10px] bg-gray-50 text-gray-600 px-2 py-0.5 rounded-full font-medium">Once-off</span>;
}

export default function ClientPortal() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug || "";

  const utils = trpc.useUtils();
  const { data: me } = trpc.auth.me.useQuery();
  const isAdmin = me?.role === "admin";

  const { data: invoices, isLoading, error } = trpc.invoice.listByClient.useQuery({ clientSlug: slug });
  const { data: profile } = trpc.client.getProfile.useQuery({ clientSlug: slug }, { enabled: isAdmin });
  const { data: allTasks = [] } = trpc.task.list.useQuery(undefined, { enabled: isAdmin });

  const openTasks = allTasks.filter(t => t.status !== 'done' && t.clientSlug === slug);

  const [editingNotes, setEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");

  const updateNotes = trpc.client.updateNotes.useMutation({
    onSuccess: () => {
      utils.client.getProfile.invalidate({ clientSlug: slug });
      setEditingNotes(false);
      toast.success("Notes saved");
    },
  });

  const setTaskDone = trpc.task.setDone.useMutation({
    onSuccess: () => utils.task.list.invalidate(),
  });

  function startEditingNotes() {
    setNotesDraft(profile?.notes || "");
    setEditingNotes(true);
  }

  const clientName = invoices && invoices.length > 0 ? invoices[0].clientName : slug.replace(/-/g, " ");
  const clientContact = invoices?.find(i => i.clientContact)?.clientContact;
  const clientEmail = invoices?.find(i => i.clientEmail)?.clientEmail;
  const clientPhone = invoices?.find(i => i.clientPhone)?.clientPhone;

  const totalPaid = invoices?.filter(i => i.status === "paid").reduce((s, i) => s + (parseFloat(String(i.totalAmount)) || 0), 0) || 0;
  const totalOutstanding = invoices?.filter(i => i.status === "sent" || i.status === "overdue").reduce((s, i) => s + (parseFloat(String(i.amountDue)) || 0), 0) || 0;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center">
            <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
            <h2 className="text-lg font-semibold mb-2">Error Loading Portal</h2>
            <p className="text-sm text-muted-foreground">Could not load invoices. Please try again later.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const onceOff = invoices?.filter((i) => i.invoiceType === "once-off") || [];
  const monthly = invoices?.filter((i) => i.invoiceType === "monthly") || [];
  const annual = invoices?.filter((i) => i.invoiceType === "annual") || [];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <ChevronLeft className="w-4 h-4 text-muted-foreground" />
            <div className="w-9 h-9 bg-primary rounded-lg flex items-center justify-center shadow-sm">
              <span className="text-primary-foreground font-bold text-lg tracking-tighter">G</span>
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground tracking-tight">
                GRO<span className="font-light">digital</span>
              </h1>
              <p className="text-[10px] text-muted-foreground -mt-0.5 tracking-wider uppercase">Client Portal</p>
            </div>
          </Link>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-14 space-y-10">

        {/* Client profile card */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">

          {/* Contact info */}
          <Card className="shadow-sm sm:col-span-2">
            <CardContent className="p-6">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-primary mb-3">Client Profile</p>
              <h2 className="text-2xl font-bold text-foreground tracking-tight mb-4">{clientName}</h2>
              <div className="space-y-2">
                {clientContact && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <User className="w-3.5 h-3.5 shrink-0" />
                    <span>{clientContact}</span>
                  </div>
                )}
                {clientEmail && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Mail className="w-3.5 h-3.5 shrink-0" />
                    <a href={`mailto:${clientEmail}`} className="hover:text-primary transition-colors">{clientEmail}</a>
                  </div>
                )}
                {clientPhone && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Phone className="w-3.5 h-3.5 shrink-0" />
                    <a href={`tel:${clientPhone}`} className="hover:text-primary transition-colors">{clientPhone}</a>
                  </div>
                )}
                {!clientContact && !clientEmail && !clientPhone && (
                  <p className="text-xs text-muted-foreground">No contact details on file.</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Revenue summary */}
          <div className="space-y-3">
            <Card className="shadow-sm border-emerald-200/60 bg-emerald-50/20">
              <CardContent className="p-4">
                <div className="flex items-center gap-1.5 mb-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600">Total Paid</p>
                </div>
                <p className="text-xl font-bold font-mono text-foreground">{formatCurrency(totalPaid)}</p>
              </CardContent>
            </Card>
            {totalOutstanding > 0 && (
              <Card className="shadow-sm border-amber-200/60 bg-amber-50/20">
                <CardContent className="p-4">
                  <div className="flex items-center gap-1.5 mb-1">
                    <AlertCircle className="w-3 h-3 text-amber-500" />
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-500">Outstanding</p>
                  </div>
                  <p className="text-xl font-bold font-mono text-foreground">{formatCurrency(totalOutstanding)}</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Admin: notes + open tasks */}
        {isAdmin && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">

            {/* Notes */}
            <Card className="shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-1.5">
                    <NotebookPen className="w-3.5 h-3.5 text-muted-foreground" />
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Notes</p>
                  </div>
                  {!editingNotes && (
                    <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2 text-muted-foreground" onClick={startEditingNotes}>
                      Edit
                    </Button>
                  )}
                </div>
                {editingNotes ? (
                  <div className="space-y-2">
                    <Textarea
                      className="text-xs resize-none"
                      rows={4}
                      value={notesDraft}
                      onChange={e => setNotesDraft(e.target.value)}
                      placeholder="Add notes about this client..."
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <Button size="sm" className="h-7 text-xs gap-1" onClick={() => updateNotes.mutate({ clientSlug: slug, notes: notesDraft })} disabled={updateNotes.isPending}>
                        <Check className="w-3 h-3" /> Save
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingNotes(false)}>
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
                    {profile?.notes || <span className="italic">No notes yet. Click Edit to add some.</span>}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Open tasks */}
            <Card className="shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center gap-1.5 mb-3">
                  <Circle className="w-3.5 h-3.5 text-muted-foreground" />
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Open Tasks
                    {openTasks.length > 0 && (
                      <span className="ml-2 bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">{openTasks.length}</span>
                    )}
                  </p>
                </div>
                {openTasks.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">No open tasks for this client.</p>
                ) : (
                  <div className="space-y-2">
                    {openTasks.map(task => (
                      <div key={task.id} className="flex items-start gap-2">
                        <button
                          className="mt-0.5 shrink-0 text-muted-foreground hover:text-emerald-600 transition-colors"
                          onClick={() => setTaskDone.mutate({ id: task.id, done: true })}
                        >
                          <Circle className="w-3.5 h-3.5" />
                        </button>
                        <p className="text-xs text-foreground leading-snug">{task.text}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

          </div>
        )}

        {/* Once-off invoices */}
        {onceOff.length > 0 && (
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4 flex items-center gap-2">
              <FileText className="w-3.5 h-3.5" />
              Project Invoices
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {onceOff.map((inv) => (
                <Link key={inv.id} href={`/client/${slug}/invoice/${inv.invoiceNumber}`}>
                  <Card className="shadow-sm hover:shadow-md transition-shadow cursor-pointer group border-primary/20 bg-primary/[0.02]">
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between mb-3">
                        <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                          <TypeIcon type={inv.invoiceType} />
                        </div>
                        <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                      </div>
                      <h4 className="text-sm font-semibold text-foreground mb-0.5">Invoice {inv.invoiceNumber}</h4>
                      <p className="text-xs text-muted-foreground mb-3">{inv.projectName}</p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-lg font-bold font-mono text-primary">{formatCurrency(inv.totalAmount)}</span>
                        <StatusBadge status={inv.status} />
                      </div>
                      {parseFloat(String(inv.amountDue)) !== parseFloat(String(inv.totalAmount)) && (
                        <p className="text-xs text-muted-foreground mt-1.5 font-mono">Due: {formatCurrency(inv.amountDue)}</p>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Monthly subscriptions */}
        {monthly.length > 0 && (
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4 flex items-center gap-2">
              <Repeat className="w-3.5 h-3.5" />
              Monthly Subscriptions
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {monthly.map((inv) => (
                <Link key={inv.id} href={`/client/${slug}/invoice/${inv.invoiceNumber}`}>
                  <Card className="shadow-sm hover:shadow-md transition-shadow cursor-pointer group border-blue-200/50 bg-blue-50/30">
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between mb-3">
                        <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                          <TypeIcon type={inv.invoiceType} />
                        </div>
                        <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-blue-600 transition-colors" />
                      </div>
                      <h4 className="text-sm font-semibold text-foreground mb-0.5">{inv.invoiceNumber}</h4>
                      <p className="text-xs text-muted-foreground mb-3">{inv.projectName}</p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-lg font-bold font-mono text-blue-700">{formatCurrency(inv.totalAmount)}<span className="text-xs font-normal text-muted-foreground">/mo</span></span>
                        <StatusBadge status={inv.status} />
                      </div>
                      {parseFloat(String(inv.amountDue)) !== parseFloat(String(inv.totalAmount)) && (
                        <p className="text-xs text-muted-foreground mt-1.5 font-mono">Due: {formatCurrency(inv.amountDue)}</p>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Annual subscriptions */}
        {annual.length > 0 && (
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4 flex items-center gap-2">
              <CalendarDays className="w-3.5 h-3.5" />
              Annual Subscriptions
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {annual.map((inv) => (
                <Link key={inv.id} href={`/client/${slug}/invoice/${inv.invoiceNumber}`}>
                  <Card className="shadow-sm hover:shadow-md transition-shadow cursor-pointer group border-purple-200/50 bg-purple-50/30">
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between mb-3">
                        <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                          <TypeIcon type={inv.invoiceType} />
                        </div>
                        <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-purple-600 transition-colors" />
                      </div>
                      <h4 className="text-sm font-semibold text-foreground mb-0.5">{inv.invoiceNumber}</h4>
                      <p className="text-xs text-muted-foreground mb-3">{inv.projectName}</p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-lg font-bold font-mono text-purple-700">{formatCurrency(inv.totalAmount)}<span className="text-xs font-normal text-muted-foreground">/yr</span></span>
                        <StatusBadge status={inv.status} />
                      </div>
                      {parseFloat(String(inv.amountDue)) !== parseFloat(String(inv.totalAmount)) && (
                        <p className="text-xs text-muted-foreground mt-1.5 font-mono">Due: {formatCurrency(inv.amountDue)}</p>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>

      <footer className="border-t border-border py-8">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Globe className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">grodigital.co.za</span>
          </div>
          <p className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} Gro Digital (Pty) Ltd. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
