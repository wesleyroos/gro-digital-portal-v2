import { useState, useEffect } from "react";

function generatePassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%&*";
  const all = upper + lower + digits + symbols;
  const arr = Array.from(crypto.getRandomValues(new Uint8Array(12)));
  // Guarantee at least one of each category
  const pwd = [
    upper[arr[0] % upper.length],
    lower[arr[1] % lower.length],
    digits[arr[2] % digits.length],
    symbols[arr[3] % symbols.length],
    ...arr.slice(4).map(b => all[b % all.length]),
  ];
  // Shuffle
  for (let i = pwd.length - 1; i > 0; i--) {
    const j = arr[i] % (i + 1);
    [pwd[i], pwd[j]] = [pwd[j], pwd[i]];
  }
  return pwd.join("");
}
import { trpc } from "@/lib/trpc";
import { Link, useParams } from "wouter";
import { Plus, Shuffle, Copy, Send, MoreHorizontal, Pencil, Printer } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
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
  MapPin,
  NotebookPen,
  CheckCircle2,
  Check,
  X,
  Circle,
  BarChart2,
  Link2,
  ExternalLink,
  Trash2,
  AlertTriangle,
  ScrollText,
  AtSign,
  Share2,
  Users,
  Megaphone,
} from "lucide-react";

function embedUrlWarning(raw: string): string | null {
  if (!raw.trim()) return null;
  const urlToCheck = raw.trim().startsWith("<")
    ? (raw.match(/src="([^"]+)"/) ?? [])[1] ?? raw
    : raw.trim();
  try {
    const parsed = new URL(urlToCheck);
    if (parsed.origin === window.location.origin) {
      return "This URL points to your own app — it should start with plausible.io (or your Plausible instance).";
    }
  } catch {
    // not a valid URL yet
  }
  return null;
}

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

type AdminTab = "overview" | "social" | "billing" | "tasks" | "portalAccess";

export default function ClientPortal() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug || "";

  const utils = trpc.useUtils();
  const { data: me } = trpc.auth.me.useQuery();
  const isAdmin = me?.role === "admin" || me?.role === "superAdmin";

  const { data: invoices, isLoading, error } = trpc.invoice.listByClient.useQuery({ clientSlug: slug });
  const { data: profile } = trpc.client.getProfile.useQuery({ clientSlug: slug }, { enabled: isAdmin });
  const { data: clientProposals = [] } = trpc.proposal.listByClient.useQuery({ clientSlug: slug }, { enabled: isAdmin });
  const { data: allTasks = [] } = trpc.task.list.useQuery(undefined, { enabled: isAdmin });
  const { data: igStatus } = trpc.instagram.getStatus.useQuery({ clientSlug: slug }, { enabled: isAdmin });
  const { data: fbStatus } = trpc.facebook.getStatus.useQuery({ clientSlug: slug }, { enabled: isAdmin });
  const { data: emailStatus } = trpc.campaign.mailer.getSegmentStatus.useQuery({ clientSlug: slug }, { enabled: isAdmin });
  const { data: allCampaigns = [] } = trpc.campaign.list.useQuery(undefined, { enabled: isAdmin });
  const { data: portalUsers = [], refetch: refetchPortalUsers } = trpc.portalUsers.listByClient.useQuery(
    { clientSlug: slug },
    { enabled: isAdmin && me?.role === "superAdmin" }
  );

  const openTasks = allTasks.filter(t => t.status !== "done" && t.clientSlug === slug);
  const clientCampaigns = allCampaigns.filter(c => c.clientSlug === slug);

  const [tab, setTab] = useState<AdminTab>("overview");
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");
  const [editingAddress, setEditingAddress] = useState(false);
  const [addressDraft, setAddressDraft] = useState("");
  const [editingContact, setEditingContact] = useState(false);
  const [contactDraft, setContactDraft] = useState({ name: "", contact: "", email: "", phone: "" });
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [embedUrl, setEmbedUrl] = useState("");

  const setAnalyticsMutation = trpc.client.setAnalytics.useMutation({
    onSuccess: () => {
      utils.client.getProfile.invalidate({ clientSlug: slug });
      toast.success("Analytics configured");
      setEmbedUrl("");
    },
    onError: () => toast.error("Failed to save analytics URL"),
  });

  const clearAnalyticsMutation = trpc.client.clearAnalytics.useMutation({
    onSuccess: () => {
      utils.client.getProfile.invalidate({ clientSlug: slug });
      toast.success("Analytics removed");
    },
    onError: () => toast.error("Failed to remove analytics"),
  });

  const updateProfile = trpc.client.updateProfile.useMutation({
    onSuccess: () => {
      utils.client.getProfile.invalidate({ clientSlug: slug });
    },
  });

  const setTaskDone = trpc.task.setDone.useMutation({
    onSuccess: () => utils.task.list.invalidate(),
  });

  const disconnectIg = trpc.instagram.disconnect.useMutation({
    onSuccess: () => {
      utils.instagram.getStatus.invalidate({ clientSlug: slug });
      toast.success("Instagram disconnected");
    },
    onError: () => toast.error("Failed to disconnect Instagram"),
  });

  const disconnectFb = trpc.facebook.disconnect.useMutation({
    onSuccess: () => {
      utils.facebook.getStatus.invalidate({ clientSlug: slug });
      toast.success("Facebook disconnected");
    },
    onError: () => toast.error("Failed to disconnect Facebook"),
  });

  // ── Recurring invoice config ──
  const { data: recurringConfig, refetch: refetchRecurring } =
    trpc.recurringInvoice.getConfig.useQuery({ clientSlug: slug }, { enabled: isAdmin });
  const { data: nextInvoiceNumber, refetch: refetchNextNumber } =
    trpc.recurringInvoice.getNextNumber.useQuery({ clientSlug: slug }, { enabled: isAdmin && !!recurringConfig });

  const [recurringDraft, setRecurringDraft] = useState({
    enabled: false,
    amount: "",
    description: "Monthly Services",
    recipientEmail: "",
    sendDay: 25,
    paymentTerms: "Due upon receipt",
    notes: "",
  });
  const [editingRecurring, setEditingRecurring] = useState(false);
  const [sendNowConfirmOpen, setSendNowConfirmOpen] = useState(false);

  useEffect(() => {
    if (recurringConfig) {
      setRecurringDraft({
        enabled: recurringConfig.enabled,
        amount: String(parseFloat(String(recurringConfig.amount)) || ""),
        description: recurringConfig.description,
        recipientEmail: recurringConfig.recipientEmail ?? profile?.email ?? "",
        sendDay: recurringConfig.sendDay,
        paymentTerms: recurringConfig.paymentTerms,
        notes: recurringConfig.notes ?? "",
      });
    } else if (profile) {
      setRecurringDraft(d => ({ ...d, recipientEmail: profile.email ?? "" }));
    }
  }, [recurringConfig, profile]);

  const setRecurringConfig = trpc.recurringInvoice.setConfig.useMutation({
    onSuccess: () => {
      refetchRecurring();
      setEditingRecurring(false);
      toast.success("Recurring invoice config saved");
    },
    onError: () => toast.error("Failed to save config"),
  });

  const sendNow = trpc.recurringInvoice.sendNow.useMutation();
  const generateInvoice = trpc.recurringInvoice.generateInvoice.useMutation();

  const [resendInvoice, setResendInvoice] = useState<{ id: number; number: string; email: string } | null>(null);
  const resendEmail = trpc.invoice.sendEmail.useMutation({
    onSuccess: () => {
      setResendInvoice(null);
      toast.success("Invoice resent");
    },
    onError: () => toast.error("Failed to resend"),
  });

  const [deleteInvoiceTarget, setDeleteInvoiceTarget] = useState<{ number: string } | null>(null);
  const deleteInvoice = trpc.invoice.delete.useMutation({
    onSuccess: () => {
      utils.invoice.listByClient.invalidate({ clientSlug: slug });
      setDeleteInvoiceTarget(null);
      toast.success("Invoice deleted");
    },
    onError: () => toast.error("Failed to delete invoice"),
  });

  const updateInvoiceStatus = trpc.invoice.updateStatus.useMutation({
    onSuccess: () => utils.invoice.listByClient.invalidate({ clientSlug: slug }),
    onError: () => toast.error("Failed to update status"),
  });

  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [creatingUser, setCreatingUser] = useState(false);
  const [resetPasswordOpenId, setResetPasswordOpenId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const createPortalUser = trpc.portalUsers.create.useMutation({
    onSuccess: () => {
      refetchPortalUsers();
      setNewUserName("");
      setNewUserEmail("");
      setNewUserPassword("");
      setCreatingUser(false);
      toast.success("Portal user created");
    },
    onError: (e) => toast.error(e.message),
  });

  const deletePortalUser = trpc.portalUsers.delete.useMutation({
    onSuccess: () => {
      refetchPortalUsers();
      toast.success("User removed");
    },
    onError: () => toast.error("Failed to remove user"),
  });

  const resetPortalPassword = trpc.portalUsers.resetPassword.useMutation({
    onSuccess: () => {
      setResetPasswordOpenId(null);
      setNewPassword("");
      toast.success("Password updated");
    },
    onError: () => toast.error("Failed to update password"),
  });

  function startEditingNotes() {
    setNotesDraft(profile?.notes || "");
    setEditingNotes(true);
  }

  function startEditingAddress() {
    setAddressDraft(profile?.address || "");
    setEditingAddress(true);
  }

  const clientNameFromInvoices = invoices && invoices.length > 0 ? invoices[0].clientName : slug.replace(/-/g, " ");
  const clientContactFromInvoices = invoices?.find(i => i.clientContact)?.clientContact;
  const clientEmailFromInvoices = invoices?.find(i => i.clientEmail)?.clientEmail;
  const clientPhoneFromInvoices = invoices?.find(i => i.clientPhone)?.clientPhone;

  function startEditingContact() {
    setContactDraft({
      name: profile?.name || clientNameFromInvoices,
      contact: profile?.contact || clientContactFromInvoices || "",
      email: profile?.email || clientEmailFromInvoices || "",
      phone: profile?.phone || clientPhoneFromInvoices || "",
    });
    setEditingContact(true);
  }

  const clientName = profile?.name || clientNameFromInvoices;
  const clientContact = profile?.contact || clientContactFromInvoices;
  const clientEmail = profile?.email || clientEmailFromInvoices;
  const clientPhone = profile?.phone || clientPhoneFromInvoices;

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

  // ── Non-admin (client) view ──────────────────────────────────────────────────
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background">
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
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
                </div>
              </CardContent>
            </Card>
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

          {onceOff.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4 flex items-center gap-2">
                <FileText className="w-3.5 h-3.5" /> Project Invoices
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {onceOff.map((inv) => (
                  <Link key={inv.id} href={`/invoice/${inv.invoiceNumber}`}>
                    <Card className="shadow-sm hover:shadow-md transition-shadow cursor-pointer group border-primary/20 bg-primary/[0.02]">
                      <CardContent className="p-5">
                        <div className="flex items-start justify-between mb-3">
                          <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center"><TypeIcon type={inv.invoiceType} /></div>
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

          {monthly.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4 flex items-center gap-2">
                <Repeat className="w-3.5 h-3.5" /> Monthly Subscriptions
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {monthly.map((inv) => (
                  <Link key={inv.id} href={`/invoice/${inv.invoiceNumber}`}>
                    <Card className="shadow-sm hover:shadow-md transition-shadow cursor-pointer group border-blue-200/50 bg-blue-50/30">
                      <CardContent className="p-5">
                        <div className="flex items-start justify-between mb-3">
                          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center"><TypeIcon type={inv.invoiceType} /></div>
                          <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-blue-600 transition-colors" />
                        </div>
                        <h4 className="text-sm font-semibold text-foreground mb-0.5">{inv.invoiceNumber}</h4>
                        <p className="text-xs text-muted-foreground mb-3">{inv.projectName}</p>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-lg font-bold font-mono text-blue-700">{formatCurrency(inv.totalAmount)}<span className="text-xs font-normal text-muted-foreground">/mo</span></span>
                          <StatusBadge status={inv.status} />
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {annual.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4 flex items-center gap-2">
                <CalendarDays className="w-3.5 h-3.5" /> Annual Subscriptions
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {annual.map((inv) => (
                  <Link key={inv.id} href={`/invoice/${inv.invoiceNumber}`}>
                    <Card className="shadow-sm hover:shadow-md transition-shadow cursor-pointer group border-purple-200/50 bg-purple-50/30">
                      <CardContent className="p-5">
                        <div className="flex items-start justify-between mb-3">
                          <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center"><TypeIcon type={inv.invoiceType} /></div>
                          <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-purple-600 transition-colors" />
                        </div>
                        <h4 className="text-sm font-semibold text-foreground mb-0.5">{inv.invoiceNumber}</h4>
                        <p className="text-xs text-muted-foreground mb-3">{inv.projectName}</p>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-lg font-bold font-mono text-purple-700">{formatCurrency(inv.totalAmount)}<span className="text-xs font-normal text-muted-foreground">/yr</span></span>
                          <StatusBadge status={inv.status} />
                        </div>
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
            <p className="text-xs text-muted-foreground">&copy; {new Date().getFullYear()} Gro Digital (Pty) Ltd. All rights reserved.</p>
          </div>
        </footer>
      </div>
    );
  }

  // ── Admin view ───────────────────────────────────────────────────────────────
  return (
    <div>
      <div className="space-y-0">

        {/* ── Breadcrumb ── */}
        <div className="flex items-center gap-2 mb-6 text-sm text-muted-foreground">
          <Link href="/clients" className="hover:text-foreground transition-colors">Clients</Link>
          <ChevronLeft className="w-3.5 h-3.5 rotate-180" />
          <span className="text-foreground font-medium">{clientName}</span>
        </div>

        {/* ── Client identity block ── */}
        <div className="py-6 border-b border-border">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              {editingContact ? (
                <div className="space-y-3 max-w-sm">
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-1">Client Name</p>
                    <Input className="h-8 text-sm" value={contactDraft.name} onChange={e => setContactDraft(d => ({ ...d, name: e.target.value }))} />
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-1">Contact Person</p>
                    <Input className="h-8 text-sm" value={contactDraft.contact} onChange={e => setContactDraft(d => ({ ...d, contact: e.target.value }))} placeholder="e.g. Jane Smith" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-[10px] text-muted-foreground mb-1">Email</p>
                      <Input className="h-8 text-sm" type="email" value={contactDraft.email} onChange={e => setContactDraft(d => ({ ...d, email: e.target.value }))} placeholder="jane@example.com" />
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground mb-1">Phone</p>
                      <Input className="h-8 text-sm" value={contactDraft.phone} onChange={e => setContactDraft(d => ({ ...d, phone: e.target.value }))} placeholder="+27 82 000 0000" />
                    </div>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" className="h-7 text-xs gap-1" disabled={updateProfile.isPending} onClick={() => {
                      updateProfile.mutate({
                        clientSlug: slug,
                        name: contactDraft.name || null,
                        contact: contactDraft.contact || null,
                        email: contactDraft.email || null,
                        phone: contactDraft.phone || null,
                        notes: profile?.notes ?? null,
                        address: profile?.address ?? null,
                      });
                      setEditingContact(false);
                      toast.success("Profile saved");
                    }}>
                      <Check className="w-3 h-3" /> Save
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingContact(false)}>
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <h2 className="text-2xl font-bold text-foreground tracking-tight mb-2">{clientName}</h2>
                  <div className="flex items-center gap-4 flex-wrap text-sm text-muted-foreground">
                    {clientContact && (
                      <span className="flex items-center gap-1.5"><User className="w-3.5 h-3.5 shrink-0" />{clientContact}</span>
                    )}
                    {clientEmail && (
                      <a href={`mailto:${clientEmail}`} className="flex items-center gap-1.5 hover:text-primary transition-colors">
                        <Mail className="w-3.5 h-3.5 shrink-0" />{clientEmail}
                      </a>
                    )}
                    {clientPhone && (
                      <a href={`tel:${clientPhone}`} className="flex items-center gap-1.5 hover:text-primary transition-colors">
                        <Phone className="w-3.5 h-3.5 shrink-0" />{clientPhone}
                      </a>
                    )}
                  </div>
                  {/* Revenue stats row */}
                  <div className="flex items-center gap-4 flex-wrap mt-3">
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                      <span className="text-xs text-muted-foreground">Paid:</span>
                      <span className="text-sm font-semibold font-mono text-emerald-700">{formatCurrency(totalPaid)}</span>
                    </div>
                    {totalOutstanding > 0 && (
                      <div className="flex items-center gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                        <span className="text-xs text-muted-foreground">Outstanding:</span>
                        <span className="text-sm font-semibold font-mono text-amber-700">{formatCurrency(totalOutstanding)}</span>
                      </div>
                    )}
                    {openTasks.length > 0 && (
                      <button
                        onClick={() => setTab("tasks")}
                        className="flex items-center gap-1.5 hover:opacity-80 transition-opacity"
                      >
                        <Circle className="w-3.5 h-3.5 text-red-500" />
                        <span className="text-sm font-semibold text-red-600">{openTasks.length} open task{openTasks.length !== 1 ? "s" : ""}</span>
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Action buttons */}
            {!editingContact && (
              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={startEditingContact}>
                  Edit
                </Button>
                <button
                  onClick={() => { setEmbedUrl(""); setAnalyticsOpen(true); }}
                  className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-md border transition-colors h-7 ${
                    profile?.analyticsToken
                      ? "bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100"
                      : "bg-muted/60 text-muted-foreground border-border hover:bg-muted"
                  }`}
                >
                  <BarChart2 className="w-3 h-3" />
                  Analytics
                  {profile?.analyticsToken && (
                    <span className="text-[9px] font-bold bg-indigo-600 text-white px-1.5 py-0.5 rounded-full leading-none">ON</span>
                  )}
                </button>
                <Link href={`/invoice/new?client=${slug}`}>
                  <Button size="sm" className="gap-1.5 text-xs h-7">
                    <Plus className="w-3 h-3" />
                    New Invoice
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* ── Tab navigation ── */}
        <div className="flex items-center gap-0 border-b border-border mb-8">
          {(["overview", "social", "billing", "tasks", "portalAccess"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-px relative ${
                tab === t
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "overview" && "Overview"}
              {t === "social" && "Social & Audiences"}
              {t === "billing" && "Billing"}
              {t === "tasks" && (
                <>
                  Tasks
                  {openTasks.length > 0 && (
                    <span className="ml-1.5 bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-none align-middle">
                      {openTasks.length}
                    </span>
                  )}
                </>
              )}
              {t === "portalAccess" && "Portal Access"}
            </button>
          ))}
        </div>

        {/* ── Overview tab ── */}
        {tab === "overview" && (
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
                      <Button size="sm" className="h-7 text-xs gap-1" onClick={() => { updateProfile.mutate({ clientSlug: slug, notes: notesDraft, address: profile?.address ?? null }); setEditingNotes(false); toast.success("Notes saved"); }} disabled={updateProfile.isPending}>
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

            {/* Billing Address */}
            <Card className="shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Billing Address</p>
                  </div>
                  {!editingAddress && (
                    <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2 text-muted-foreground" onClick={startEditingAddress}>
                      Edit
                    </Button>
                  )}
                </div>
                {editingAddress ? (
                  <div className="space-y-2">
                    <Textarea
                      className="text-xs resize-none"
                      rows={4}
                      value={addressDraft}
                      onChange={e => setAddressDraft(e.target.value)}
                      placeholder={"12 Main Road\nSandton, 2196\nSouth Africa"}
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <Button size="sm" className="h-7 text-xs gap-1" onClick={() => { updateProfile.mutate({ clientSlug: slug, notes: profile?.notes ?? null, address: addressDraft }); setEditingAddress(false); toast.success("Address saved"); }} disabled={updateProfile.isPending}>
                        <Check className="w-3 h-3" /> Save
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingAddress(false)}>
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
                    {profile?.address || <span className="italic">No billing address yet. Click Edit to add one.</span>}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Proposals */}
            {clientProposals.length > 0 && (
              <Card className="shadow-sm">
                <CardContent className="p-5">
                  <div className="flex items-center gap-1.5 mb-3">
                    <ScrollText className="w-3.5 h-3.5 text-muted-foreground" />
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Proposals</p>
                  </div>
                  <div className="space-y-1.5">
                    {clientProposals.map(p => {
                      const statusColor: Record<string, string> = {
                        draft: "bg-gray-100 text-gray-600 border-gray-200",
                        sent: "bg-blue-50 text-blue-700 border-blue-200",
                        viewed: "bg-amber-50 text-amber-700 border-amber-200",
                        accepted: "bg-green-50 text-green-700 border-green-200",
                        declined: "bg-red-50 text-red-700 border-red-200",
                      };
                      return (
                        <a
                          key={p.id}
                          href={`/p/${p.token}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-between gap-2 hover:bg-muted/40 rounded px-2 py-1.5 -mx-2 transition-colors group"
                        >
                          <span className="text-xs text-foreground truncate group-hover:text-primary transition-colors">{p.title}</span>
                          <span className={`shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${statusColor[p.status] ?? statusColor.draft}`}>
                            {p.status.charAt(0).toUpperCase() + p.status.slice(1)}
                          </span>
                        </a>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

          </div>
        )}

        {/* ── Social & Audiences tab ── */}
        {tab === "social" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

              {/* Instagram */}
              <Card className={`shadow-sm ${igStatus?.connected ? "border-pink-200/60 bg-pink-50/10" : ""}`}>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${igStatus?.connected ? "bg-gradient-to-br from-pink-500 to-purple-600" : "bg-muted"}`}>
                        <AtSign className={`w-4 h-4 ${igStatus?.connected ? "text-white" : "text-muted-foreground"}`} />
                      </div>
                      <p className="text-sm font-semibold text-foreground">Instagram</p>
                    </div>
                    {igStatus?.connected && (
                      <span className="text-[10px] font-medium bg-pink-100 text-pink-700 border border-pink-200 px-2 py-0.5 rounded-full">Connected</span>
                    )}
                  </div>
                  {igStatus?.connected ? (
                    <div className="space-y-3">
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Account</p>
                        <p className="text-sm font-medium text-foreground">@{igStatus.username}</p>
                        {igStatus.businessId && (
                          <p className="text-[11px] text-muted-foreground font-mono mt-0.5">ID: {igStatus.businessId}</p>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-destructive hover:text-destructive gap-1.5 w-full justify-start"
                        onClick={() => disconnectIg.mutate({ clientSlug: slug })}
                        disabled={disconnectIg.isPending}
                      >
                        <X className="w-3 h-3" />
                        Disconnect
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-xs text-muted-foreground">Not connected. Connect via a Marketing campaign.</p>
                      <Link href="/marketing">
                        <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5 w-full">
                          <Megaphone className="w-3 h-3" />
                          Go to Marketing
                        </Button>
                      </Link>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Facebook */}
              <Card className={`shadow-sm ${fbStatus?.connected ? "border-blue-200/60 bg-blue-50/10" : ""}`}>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${fbStatus?.connected ? "bg-blue-600" : "bg-muted"}`}>
                        <Share2 className={`w-4 h-4 ${fbStatus?.connected ? "text-white" : "text-muted-foreground"}`} />
                      </div>
                      <p className="text-sm font-semibold text-foreground">Facebook</p>
                    </div>
                    {fbStatus?.connected && (
                      <span className="text-[10px] font-medium bg-blue-100 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full">Connected</span>
                    )}
                  </div>
                  {fbStatus?.connected ? (
                    <div className="space-y-3">
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Page</p>
                        <p className="text-sm font-medium text-foreground">{fbStatus.pageName}</p>
                        {fbStatus.pageId && (
                          <p className="text-[11px] text-muted-foreground font-mono mt-0.5">ID: {fbStatus.pageId}</p>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-destructive hover:text-destructive gap-1.5 w-full justify-start"
                        onClick={() => disconnectFb.mutate({ clientSlug: slug })}
                        disabled={disconnectFb.isPending}
                      >
                        <X className="w-3 h-3" />
                        Disconnect
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-xs text-muted-foreground">Not connected. Connect via a Marketing campaign.</p>
                      <Link href="/marketing">
                        <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5 w-full">
                          <Megaphone className="w-3 h-3" />
                          Go to Marketing
                        </Button>
                      </Link>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Email / Audience */}
              <Card className={`shadow-sm ${emailStatus?.segmentId ? "border-emerald-200/60 bg-emerald-50/10" : ""}`}>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${emailStatus?.segmentId ? "bg-emerald-600" : "bg-muted"}`}>
                        <Users className={`w-4 h-4 ${emailStatus?.segmentId ? "text-white" : "text-muted-foreground"}`} />
                      </div>
                      <p className="text-sm font-semibold text-foreground">Email Audience</p>
                    </div>
                    {emailStatus?.segmentId && (
                      <span className="text-[10px] font-medium bg-emerald-100 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">Active</span>
                    )}
                  </div>
                  {emailStatus?.segmentId ? (
                    <div className="space-y-2">
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Subscribers</p>
                        <p className="text-2xl font-bold font-mono text-foreground">{emailStatus.subscriberCount}</p>
                      </div>
                      <p className="text-[11px] text-muted-foreground font-mono truncate">Segment: {emailStatus.segmentId}</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-xs text-muted-foreground">No email audience set up yet. Add subscribers via a Marketing campaign.</p>
                      <Link href="/marketing">
                        <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5 w-full">
                          <Megaphone className="w-3 h-3" />
                          Go to Marketing
                        </Button>
                      </Link>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Campaigns summary */}
            <Card className="shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-1.5">
                    <Megaphone className="w-3.5 h-3.5 text-muted-foreground" />
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Campaigns</p>
                  </div>
                  <Link href="/marketing">
                    <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2 gap-1 text-muted-foreground">
                      View all <ArrowRight className="w-3 h-3" />
                    </Button>
                  </Link>
                </div>
                {clientCampaigns.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">No campaigns for this client yet.</p>
                ) : (
                  <div className="space-y-1.5">
                    {clientCampaigns.map(c => {
                      const statusColor: Record<string, string> = {
                        draft: "bg-gray-100 text-gray-600 border-gray-200",
                        strategy: "bg-amber-50 text-amber-700 border-amber-200",
                        generating: "bg-blue-50 text-blue-700 border-blue-200",
                        review: "bg-purple-50 text-purple-700 border-purple-200",
                        approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
                        published: "bg-emerald-100 text-emerald-800 border-emerald-300",
                      };
                      return (
                        <Link key={c.id} href={`/marketing/${c.id}`}>
                          <div className="flex items-center justify-between gap-2 hover:bg-muted/40 rounded px-2 py-1.5 -mx-2 transition-colors group cursor-pointer">
                            <span className="text-xs text-foreground truncate group-hover:text-primary transition-colors">{c.name}</span>
                            <span className={`shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${statusColor[c.status] ?? statusColor.draft}`}>
                              {c.status.charAt(0).toUpperCase() + c.status.slice(1)}
                            </span>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── Billing tab ── */}
        {tab === "billing" && (
          <div className="space-y-10">

            {/* Monthly auto-invoice config */}
            <Card className="shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Repeat className="w-4 h-4 text-muted-foreground" />
                    <p className="text-sm font-semibold">Monthly Auto-Invoice</p>
                    {recurringConfig && (
                      <Switch
                        checked={recurringConfig.enabled}
                        onCheckedChange={(v) => setRecurringConfig.mutate({
                          clientSlug: slug,
                          enabled: v,
                          amount: parseFloat(String(recurringConfig.amount)) || 0,
                          description: recurringConfig.description,
                          recipientEmail: recurringConfig.recipientEmail || null,
                          sendDay: recurringConfig.sendDay,
                          paymentTerms: recurringConfig.paymentTerms,
                          notes: recurringConfig.notes || null,
                        }, { onSuccess: refetchRecurring })}
                      />
                    )}
                  </div>
                  {!editingRecurring && (
                    <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2 text-muted-foreground"
                      onClick={() => setEditingRecurring(true)}>
                      {recurringConfig ? "Edit" : "Set up"}
                    </Button>
                  )}
                </div>

                {!editingRecurring && recurringConfig && (
                  <div className="space-y-3">
                    <div className="text-xs text-muted-foreground space-y-1">
                      <p>Amount: <span className="text-foreground font-mono font-medium">R{parseFloat(String(recurringConfig.amount)).toFixed(2)}</span></p>
                      <p>To: <span className="text-foreground">{recurringConfig.recipientEmail || profile?.email || "(not set)"}</span></p>
                      {recurringConfig.lastSentAt && (
                        <p>Last sent: <span className="text-foreground">{new Date(recurringConfig.lastSentAt).toLocaleDateString("en-ZA")}</span></p>
                      )}
                      {recurringConfig.enabled && (() => {
                        const now = new Date();
                        const day = recurringConfig.sendDay;
                        let next = new Date(now.getFullYear(), now.getMonth(), day);
                        if (now.getDate() >= day) next = new Date(now.getFullYear(), now.getMonth() + 1, day);
                        return <>
                          <p>Next invoice: <span className="text-foreground font-medium">{next.toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })}</span></p>
                          {nextInvoiceNumber && <p>Next invoice number: <span className="text-foreground font-medium">{nextInvoiceNumber}</span></p>}
                        </>;
                      })()}
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="h-7 text-xs gap-1 text-muted-foreground"
                        disabled={generateInvoice.isPending}
                        onClick={() => {
                          generateInvoice.mutate({ clientSlug: slug }, {
                            onSuccess: () => {
                              utils.invoice.listByClient.invalidate({ clientSlug: slug });
                              refetchNextNumber();
                              toast.success("Invoice generated — check the billing table below");
                            },
                            onError: (e) => toast.error(e.message || "Generate failed"),
                          });
                        }}>
                        <Printer className="w-3 h-3" /> {generateInvoice.isPending ? "Generating…" : "Generate invoice"}
                      </Button>
                      <Button variant="outline" size="sm" className="h-7 text-xs gap-1 text-blue-600 border-blue-200 hover:bg-blue-50"
                        disabled={sendNow.isPending}
                        onClick={() => setSendNowConfirmOpen(true)}>
                        <Mail className="w-3 h-3" /> {sendNow.isPending ? "Sending…" : "Send now"}
                      </Button>
                    </div>

                    <AlertDialog open={sendNowConfirmOpen} onOpenChange={setSendNowConfirmOpen}>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Send invoice now?</AlertDialogTitle>
                          <AlertDialogDescription className="space-y-1.5">
                            <span className="block">This will create and email the next invoice to:</span>
                            <span className="block font-medium text-foreground">{recurringConfig?.recipientEmail || profile?.email || "the client's email"}</span>
                            <span className="block mt-1">The invoice will be marked as <strong>sent</strong> and will appear in the billing tab.</span>
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => {
                              setSendNowConfirmOpen(false);
                              sendNow.mutate({ clientSlug: slug }, {
                                onSuccess: () => {
                                  refetchRecurring();
                                  refetchNextNumber();
                                  utils.invoice.listByClient.invalidate({ clientSlug: slug });
                                  toast.success("Invoice sent — check the billing table below");
                                },
                                onError: (e) => toast.error(e.message || "Send failed"),
                              });
                            }}>
                            Send invoice
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                )}

                {!editingRecurring && !recurringConfig && (
                  <p className="text-xs text-muted-foreground">Not configured. Click "Set up" to enable monthly auto-invoicing.</p>
                )}

                {editingRecurring && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={recurringDraft.enabled}
                        onCheckedChange={v => setRecurringDraft(d => ({ ...d, enabled: v }))}
                      />
                      <label className="text-xs text-muted-foreground">Enabled</label>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Amount (R)</label>
                        <Input type="number" className="mt-1 h-8 text-xs"
                          value={recurringDraft.amount}
                          onChange={e => setRecurringDraft(d => ({ ...d, amount: e.target.value }))} />
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Send on day</label>
                        <Input type="number" min={1} max={28} className="mt-1 h-8 text-xs"
                          value={recurringDraft.sendDay}
                          onChange={e => setRecurringDraft(d => ({ ...d, sendDay: parseInt(e.target.value) || 25 }))} />
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Line item description</label>
                      <Input className="mt-1 h-8 text-xs" value={recurringDraft.description}
                        onChange={e => setRecurringDraft(d => ({ ...d, description: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Recipient email (blank = use client email)</label>
                      <Input type="email" className="mt-1 h-8 text-xs" value={recurringDraft.recipientEmail}
                        onChange={e => setRecurringDraft(d => ({ ...d, recipientEmail: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Payment terms</label>
                      <Input className="mt-1 h-8 text-xs" value={recurringDraft.paymentTerms}
                        onChange={e => setRecurringDraft(d => ({ ...d, paymentTerms: e.target.value }))} />
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button size="sm" className="h-7 text-xs gap-1"
                        onClick={() => setRecurringConfig.mutate({
                          clientSlug: slug,
                          ...recurringDraft,
                          amount: parseFloat(recurringDraft.amount) || 0,
                          recipientEmail: recurringDraft.recipientEmail || null,
                          notes: recurringDraft.notes || null,
                        })}
                        disabled={setRecurringConfig.isPending}>
                        <Check className="w-3 h-3" /> Save
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs"
                        onClick={() => setEditingRecurring(false)}>
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {invoices?.length === 0 && (
              <div className="text-center py-12">
                <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No invoices yet for this client.</p>
                <Link href={`/invoice/new?client=${slug}`}>
                  <Button size="sm" className="mt-4 gap-1.5 text-xs">
                    <Plus className="w-3 h-3" /> Create first invoice
                  </Button>
                </Link>
              </div>
            )}

            {/* Delete invoice confirm */}
            <AlertDialog open={!!deleteInvoiceTarget} onOpenChange={(o) => { if (!o) setDeleteInvoiceTarget(null); }}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete {deleteInvoiceTarget?.number}?</AlertDialogTitle>
                  <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction className="bg-destructive hover:bg-destructive/90"
                    disabled={deleteInvoice.isPending}
                    onClick={() => deleteInvoiceTarget && deleteInvoice.mutate({ invoiceNumber: deleteInvoiceTarget.number })}>
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {/* Resend invoice modal */}
            <AlertDialog open={!!resendInvoice} onOpenChange={(o) => { if (!o) setResendInvoice(null); }}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Resend invoice {resendInvoice?.number}?</AlertDialogTitle>
                  <AlertDialogDescription className="space-y-3">
                    <span className="block">This will send the invoice email again to:</span>
                    <Input
                      className="h-8 text-sm"
                      value={resendInvoice?.email ?? ""}
                      onChange={e => setResendInvoice(r => r ? { ...r, email: e.target.value } : null)}
                    />
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    disabled={!resendInvoice?.email || resendEmail.isPending}
                    onClick={() => {
                      if (resendInvoice?.email)
                        resendEmail.mutate({ invoiceId: resendInvoice.id, recipientEmail: resendInvoice.email });
                    }}>
                    {resendEmail.isPending ? "Sending…" : "Resend"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {(onceOff.length > 0 || monthly.length > 0 || annual.length > 0) && (
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 border-b border-border">
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">#</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Description</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Date</th>
                      <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground">Amount</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Status</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border bg-background">
                    {[...onceOff, ...monthly, ...annual]
                      .sort((a, b) => new Date(b.invoiceDate).getTime() - new Date(a.invoiceDate).getTime())
                      .map((inv) => (
                        <tr key={inv.id}
                          className="hover:bg-muted/40 transition-colors cursor-pointer group"
                          onClick={() => window.location.href = `/invoice/${inv.invoiceNumber}`}>
                          <td className="px-4 py-3 font-mono text-xs text-muted-foreground whitespace-nowrap">{inv.invoiceNumber}</td>
                          <td className="px-4 py-3 text-sm text-foreground max-w-[200px] truncate">{inv.projectName || "—"}</td>
                          <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                            {new Date(inv.invoiceDate).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-sm font-semibold text-foreground whitespace-nowrap">{formatCurrency(inv.totalAmount)}</td>
                          <td className="px-4 py-3"><StatusBadge status={inv.status} /></td>
                          <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                                  <MoreHorizontal className="w-3.5 h-3.5 text-muted-foreground" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48">
                                <DropdownMenuItem onClick={() => setResendInvoice({ id: inv.id, number: inv.invoiceNumber, email: inv.clientEmail || profile?.email || "" })}>
                                  <Send className="w-3.5 h-3.5 mr-2" /> Send to Client
                                </DropdownMenuItem>
                                <DropdownMenuItem asChild>
                                  <a href={`/invoice/${inv.invoiceNumber}`} target="_blank" rel="noreferrer" className="flex items-center">
                                    <Link2 className="w-3.5 h-3.5 mr-2" /> Open Invoice
                                  </a>
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem asChild>
                                  <a href={`/invoice/${inv.invoiceNumber}/edit`} className="flex items-center">
                                    <Pencil className="w-3.5 h-3.5 mr-2" /> Edit
                                  </a>
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => updateInvoiceStatus.mutate({ invoiceId: inv.id, status: "paid" })} disabled={inv.status === "paid"}>
                                  Mark as Paid
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => updateInvoiceStatus.mutate({ invoiceId: inv.id, status: "sent" })} disabled={inv.status === "sent"}>
                                  Mark as Sent
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => updateInvoiceStatus.mutate({ invoiceId: inv.id, status: "overdue" })} disabled={inv.status === "overdue"}>
                                  Mark as Overdue
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteInvoiceTarget({ number: inv.invoiceNumber })}>
                                  <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── Tasks tab ── */}
        {tab === "tasks" && (
          <div className="space-y-4">
            {openTasks.length === 0 ? (
              <div className="text-center py-12">
                <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No open tasks for this client.</p>
              </div>
            ) : (
              <Card className="shadow-sm">
                <CardContent className="p-5">
                  <div className="flex items-center gap-1.5 mb-4">
                    <Circle className="w-3.5 h-3.5 text-muted-foreground" />
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Open Tasks
                      <span className="ml-2 bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">{openTasks.length}</span>
                    </p>
                  </div>
                  <div className="space-y-2">
                    {openTasks.map(task => (
                      <div key={task.id} className="flex items-start gap-3 py-1.5 border-b border-border/50 last:border-0">
                        <button
                          className="mt-0.5 shrink-0 text-muted-foreground hover:text-emerald-600 transition-colors"
                          onClick={() => setTaskDone.mutate({ id: task.id, done: true })}
                          title="Mark as done"
                        >
                          <Circle className="w-4 h-4" />
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-foreground leading-snug">{task.text}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* ── Portal Access tab ── */}
        {tab === "portalAccess" && (
          <div className="space-y-6">
            <Card className="shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-sm font-medium">Client Portal Users</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Users who can log in and view {clientName}'s portal.</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setCreatingUser(v => !v)}>
                    <Plus className="w-3.5 h-3.5 mr-1.5" />
                    Add user
                  </Button>
                </div>

                {creatingUser && (
                  <div className="mb-4 p-4 border border-border rounded-lg space-y-3 bg-muted/20">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">New user</p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Name</Label>
                        <Input value={newUserName} onChange={e => setNewUserName(e.target.value)} placeholder="James Kieser" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Email</Label>
                        <Input type="email" value={newUserEmail} onChange={e => setNewUserEmail(e.target.value)} placeholder="james@prospr.co.za" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Temporary password</Label>
                        <div className="flex gap-1">
                          <Input type="text" value={newUserPassword} onChange={e => setNewUserPassword(e.target.value)} placeholder="Min 8 characters" className="font-mono text-sm" />
                          <Button type="button" size="icon" variant="outline" className="shrink-0" title="Generate password" onClick={() => setNewUserPassword(generatePassword())}>
                            <Shuffle className="w-3.5 h-3.5" />
                          </Button>
                          <Button type="button" size="icon" variant="outline" className="shrink-0" title="Copy password" disabled={!newUserPassword} onClick={() => navigator.clipboard.writeText(newUserPassword)}>
                            <Copy className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => createPortalUser.mutate({ name: newUserName, email: newUserEmail, password: newUserPassword, clientSlug: slug })}
                        disabled={!newUserName || !newUserEmail || newUserPassword.length < 8 || createPortalUser.isPending}
                      >
                        {createPortalUser.isPending ? "Creating..." : "Create user"}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setCreatingUser(false)}>Cancel</Button>
                    </div>
                  </div>
                )}

                {portalUsers.length === 0 ? (
                  <div className="text-center py-8">
                    <Users className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No portal users yet.</p>
                    <p className="text-xs text-muted-foreground mt-1">Create a user above to give {clientName} access to their portal.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {portalUsers.map(u => (
                      <div key={u.openId} className="flex items-center gap-3 py-2 border-b border-border/50 last:border-0">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{u.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                        </div>
                        <p className="text-xs text-muted-foreground shrink-0 hidden sm:block">
                          Last login: {u.lastSignedIn ? new Date(u.lastSignedIn).toLocaleDateString() : "Never"}
                        </p>
                        {resetPasswordOpenId === u.openId ? (
                          <div className="flex items-center gap-1.5">
                            <Input
                              type="text"
                              placeholder="New password"
                              value={newPassword}
                              onChange={e => setNewPassword(e.target.value)}
                              className="h-8 w-36 text-xs font-mono"
                            />
                            <Button type="button" size="icon" variant="outline" className="h-8 w-8 shrink-0" title="Generate password" onClick={() => setNewPassword(generatePassword())}>
                              <Shuffle className="w-3.5 h-3.5" />
                            </Button>
                            <Button type="button" size="icon" variant="outline" className="h-8 w-8 shrink-0" title="Copy password" disabled={!newPassword} onClick={() => navigator.clipboard.writeText(newPassword)}>
                              <Copy className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              className="h-8"
                              onClick={() => resetPortalPassword.mutate({ openId: u.openId, password: newPassword })}
                              disabled={newPassword.length < 8 || resetPortalPassword.isPending}
                            >
                              Save
                            </Button>
                            <Button size="sm" variant="ghost" className="h-8" onClick={() => { setResetPasswordOpenId(null); setNewPassword(""); }}>
                              <X className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex gap-1">
                            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setResetPasswordOpenId(u.openId)}>
                              Reset password
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                              onClick={() => deletePortalUser.mutate({ openId: u.openId })}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardContent className="p-5">
                <p className="text-sm font-medium mb-1">Portal login URL</p>
                <p className="text-xs text-muted-foreground mb-3">Share this URL with {clientName} — they'll use their email and password to sign in.</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs bg-muted border border-border rounded px-2 py-1.5 text-muted-foreground truncate">
                    {`${window.location.origin}/login`}
                  </code>
                  <Button
                    variant="outline" size="sm" className="h-8 w-8 p-0 shrink-0"
                    onClick={() => navigator.clipboard.writeText(`${window.location.origin}/login`).then(() => toast.success("URL copied")).catch(() => {})}
                  >
                    <Link2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

      </div>

      {/* Analytics management sheet */}
      <Sheet open={analyticsOpen} onOpenChange={(v) => { setAnalyticsOpen(v); if (!v) setEmbedUrl(""); }}>
        <SheetContent className="w-full sm:max-w-md flex flex-col">
          <SheetHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0">
            <SheetTitle className="flex items-center gap-2">
              <BarChart2 className="w-4 h-4" />
              Analytics — {clientName}
            </SheetTitle>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            {profile?.analyticsToken ? (
              <>
                <div className="rounded-lg border border-indigo-200 bg-indigo-50/50 p-4 space-y-3">
                  <p className="text-xs font-semibold text-indigo-700 uppercase tracking-wide">Analytics Active</p>
                  <p className="text-xs text-muted-foreground">Share the link below with your client to give them access to their analytics dashboard.</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs bg-background border border-border rounded px-2 py-1.5 text-muted-foreground truncate">
                      {`${window.location.origin}/analytics/${profile.analyticsToken}`}
                    </code>
                    <Button
                      variant="outline" size="sm" className="h-8 w-8 p-0 shrink-0" title="Copy link"
                      onClick={() => navigator.clipboard.writeText(`${window.location.origin}/analytics/${profile!.analyticsToken!}`).then(() => toast.success("Link copied")).catch(() => toast.error("Failed to copy"))}
                    >
                      <Link2 className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="outline" size="sm" className="h-8 w-8 p-0 shrink-0" title="Open analytics page"
                      onClick={() => window.open(`/analytics/${profile!.analyticsToken}`, "_blank")}
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Update embed URL</Label>
                  <Input
                    placeholder="https://plausible.io/grodigital.co.za?embed=true&theme=light"
                    value={embedUrl}
                    onChange={e => setEmbedUrl(e.target.value)}
                  />
                  {embedUrlWarning(embedUrl) && (
                    <div className="flex items-start gap-1.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2.5 py-2">
                      <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                      {embedUrlWarning(embedUrl)}
                    </div>
                  )}
                  <p className="text-[11px] text-muted-foreground">Paste the Plausible embed URL or the full embed code — either works.</p>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Configure a Plausible analytics dashboard for <strong>{clientName}</strong>. A unique shareable link will be generated.
                </p>
                <div className="space-y-1.5">
                  <Label className="text-xs">Plausible embed URL</Label>
                  <Input
                    placeholder="https://plausible.io/grodigital.co.za?embed=true&theme=light"
                    value={embedUrl}
                    onChange={e => setEmbedUrl(e.target.value)}
                    autoFocus
                  />
                  {embedUrlWarning(embedUrl) && (
                    <div className="flex items-start gap-1.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2.5 py-2">
                      <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                      {embedUrlWarning(embedUrl)}
                    </div>
                  )}
                  <p className="text-[11px] text-muted-foreground">In Plausible, go to your site → Shared links → Create a shared link with embed enabled. Paste the embed URL or the full embed code — either works.</p>
                </div>
              </>
            )}
          </div>

          <div className="shrink-0 px-6 py-4 border-t border-border flex items-center justify-between gap-2">
            {profile?.analyticsToken && (
              <Button
                variant="ghost" size="sm"
                className="text-destructive hover:text-destructive gap-1.5 text-xs"
                onClick={() => clearAnalyticsMutation.mutate({ clientSlug: slug })}
                disabled={clearAnalyticsMutation.isPending}
              >
                <Trash2 className="w-3.5 h-3.5" />
                Remove
              </Button>
            )}
            <div className="flex gap-2 ml-auto">
              <Button variant="outline" size="sm" onClick={() => setAnalyticsOpen(false)}>
                {profile?.analyticsToken && !embedUrl ? "Close" : "Cancel"}
              </Button>
              {(!profile?.analyticsToken || embedUrl) && (
                <Button
                  size="sm"
                  disabled={!embedUrl.trim() || setAnalyticsMutation.isPending}
                  onClick={() => {
                    if (embedUrl.trim()) setAnalyticsMutation.mutate({ clientSlug: slug, analyticsEmbed: embedUrl.trim() });
                  }}
                >
                  {setAnalyticsMutation.isPending ? "Saving…" : profile?.analyticsToken ? "Update" : "Enable Analytics"}
                </Button>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
