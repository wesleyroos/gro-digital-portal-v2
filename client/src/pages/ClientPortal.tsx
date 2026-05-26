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
import { Plus, Shuffle, Copy, Send, MoreHorizontal, Pencil, Printer, CreditCard, Loader2, CalendarClock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

function StatusBadge({ status, scheduledSendDate }: { status: string; scheduledSendDate?: string | null }) {
  const config: Record<string, { label: string; className: string }> = {
    draft: { label: "Draft", className: "bg-gray-100 text-gray-700 border-gray-200" },
    sent: { label: "Awaiting Payment", className: "bg-amber-50 text-amber-700 border-amber-200" },
    paid: { label: "Paid", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    overdue: { label: "Overdue", className: "bg-red-50 text-red-700 border-red-200" },
    scheduled: { label: "Scheduled", className: "bg-blue-50 text-blue-700 border-blue-200" },
  };
  const isScheduled = scheduledSendDate && status !== "paid" && new Date(scheduledSendDate) > new Date();
  const c = config[isScheduled ? "scheduled" : status] || config.sent;
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

type AdminTab = "overview" | "social" | "connections" | "billing" | "tasks" | "portalAccess";

export default function ClientPortal() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug || "";

  const utils = trpc.useUtils();
  const { data: me } = trpc.auth.me.useQuery();
  const isAdmin = me?.role === "admin" || me?.role === "superAdmin";

  const { data: invoices, isLoading, error } = trpc.invoice.listByClient.useQuery({ clientSlug: slug });
  const { data: profile, refetch: refetchProfile } = trpc.client.getProfile.useQuery({ clientSlug: slug }, { enabled: isAdmin });
  const { data: clientProposals = [] } = trpc.proposal.listByClient.useQuery({ clientSlug: slug }, { enabled: isAdmin });
  const { data: allTasks = [] } = trpc.task.list.useQuery(undefined, { enabled: isAdmin });
  const { data: igStatus } = trpc.instagram.getStatus.useQuery({ clientSlug: slug }, { enabled: isAdmin });
  const { data: fbStatus } = trpc.facebook.getStatus.useQuery({ clientSlug: slug }, { enabled: isAdmin });
  const { data: liStatus } = trpc.linkedin.getStatus.useQuery({ clientSlug: slug }, { enabled: isAdmin });
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
  const [embedUrl, setEmbedUrl] = useState("");
  const [mailchimpKeyInput, setMailchimpKeyInput] = useState("");

  const setAnalyticsMutation = trpc.client.setAnalytics.useMutation({
    onSuccess: () => {
      refetchProfile();
      toast.success("Analytics configured");
      setEmbedUrl("");
    },
    onError: () => toast.error("Failed to save analytics URL"),
  });

  const clearAnalyticsMutation = trpc.client.clearAnalytics.useMutation({
    onSuccess: () => {
      refetchProfile();
      toast.success("Analytics removed");
    },
    onError: () => toast.error("Failed to remove analytics"),
  });

  const updateProfile = trpc.client.updateProfile.useMutation({
    onSuccess: () => {
      refetchProfile();
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

  const disconnectLi = trpc.linkedin.disconnect.useMutation({
    onSuccess: () => {
      utils.linkedin.getStatus.invalidate({ clientSlug: slug });
      toast.success("LinkedIn disconnected");
    },
    onError: () => toast.error("Failed to disconnect LinkedIn"),
  });

  const setLiPostTargetMutation = trpc.linkedin.setPostTarget.useMutation({
    onSuccess: () => {
      utils.linkedin.getStatus.invalidate({ clientSlug: slug });
      toast.success("LinkedIn post target updated");
    },
    onError: () => toast.error("Failed to update LinkedIn post target"),
  });

  const setMailchimpKeyMutation = trpc.campaign.mailer.setMailchimpApiKey.useMutation({
    onSuccess: () => {
      refetchProfile();
      setMailchimpKeyInput("");
      toast.success("Mailchimp API key saved");
    },
    onError: () => toast.error("Failed to save Mailchimp API key"),
  });

  // ── Billing mandate ──
  const { data: mandate, refetch: refetchMandate } =
    trpc.mandate.get.useQuery({ clientSlug: slug }, { enabled: isAdmin });
  const createMandate = trpc.mandate.create.useMutation({
    onSuccess: () => { refetchMandate(); setMandateFormOpen(false); toast.success("Mandate created — copy the setup link and send it to the client"); },
    onError: () => toast.error("Failed to create mandate"),
  });
  const pauseMandate = trpc.mandate.pause.useMutation({ onSuccess: () => refetchMandate() });
  const resumeMandate = trpc.mandate.resume.useMutation({ onSuccess: () => refetchMandate() });
  const cancelMandate = trpc.mandate.cancel.useMutation({ onSuccess: () => { refetchMandate(); toast.success("Mandate cancelled"); } });
  const sendSetupEmail = trpc.mandate.sendSetupEmail.useMutation({ onSuccess: () => toast.success("Setup email sent"), onError: () => toast.error("Failed to send email") });
  const updateLineItems = trpc.mandate.updateLineItems.useMutation({
    onSuccess: () => { refetchMandate(); setMandateFormOpen(false); toast.success("Mandate updated"); },
    onError: () => toast.error("Failed to update mandate"),
  });
  const [mandateFormOpen, setMandateFormOpen] = useState(false);
  const [mandateEditMode, setMandateEditMode] = useState(false);
  const [mandateLineItems, setMandateLineItems] = useState([{ description: "", amount: "", interval: "monthly" as "monthly" | "annual", nextBillingDate: "" }]);
  const [mandateStartDate, setMandateStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [mandateChargeOnSetup, setMandateChargeOnSetup] = useState(true);

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
                          <StatusBadge status={inv.status} scheduledSendDate={(inv as any).scheduledSendDate} />
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
                          <StatusBadge status={inv.status} scheduledSendDate={(inv as any).scheduledSendDate} />
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
                          <StatusBadge status={inv.status} scheduledSendDate={(inv as any).scheduledSendDate} />
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
        <div className="flex items-center gap-0 border-b border-border mb-8 overflow-x-auto">
          {(["overview", "social", "connections", "billing", "tasks", "portalAccess"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-px relative whitespace-nowrap ${
                tab === t
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "overview" && "Overview"}
              {t === "social" && "Audiences"}
              {t === "connections" && (
                <>
                  Connections
                  {(igStatus?.connected || fbStatus?.connected || liStatus?.connected || profile?.mailchimpApiKey || profile?.analyticsToken) && (
                    <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 align-middle" />
                  )}
                </>
              )}
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

        {/* ── Audiences tab ── */}
        {tab === "social" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

              {/* Social reach summary */}
              {[
                { label: "Instagram", connected: igStatus?.connected, detail: igStatus?.connected ? `@${igStatus.username}` : null, color: "pink" },
                { label: "Facebook", connected: fbStatus?.connected, detail: fbStatus?.connected ? fbStatus.pageName : null, color: "blue" },
                { label: "LinkedIn", connected: liStatus?.connected, detail: liStatus?.connected ? (liStatus.orgName || liStatus.personUrn) : null, color: "sky" },
              ].map(({ label, connected, detail, color }) => (
                <Card key={label} className="shadow-sm">
                  <CardContent className="p-4 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-foreground">{label}</p>
                      {detail && <p className="text-[11px] text-muted-foreground truncate mt-0.5">{detail}</p>}
                    </div>
                    {connected ? (
                      <span className={`shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full border ${color === "pink" ? "bg-pink-50 text-pink-700 border-pink-200" : color === "blue" ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-sky-50 text-sky-700 border-sky-200"}`}>
                        Connected
                      </span>
                    ) : (
                      <button
                        onClick={() => setTab("connections")}
                        className="shrink-0 text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors"
                      >
                        Connect →
                      </button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Email audience */}
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

        {/* ── Connections tab ── */}
        {tab === "connections" && (
          <div className="max-w-2xl space-y-6">

            {/* Single list card */}
            <Card className="shadow-sm">
              <div className="divide-y divide-border">

                {/* Instagram */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className={`w-7 h-7 rounded-md shrink-0 flex items-center justify-center ${igStatus?.connected ? "bg-gradient-to-br from-pink-500 to-purple-600" : "bg-muted"}`}>
                    <AtSign className={`w-3.5 h-3.5 ${igStatus?.connected ? "text-white" : "text-muted-foreground"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium leading-none">Instagram</p>
                    {igStatus?.connected
                      ? <p className="text-xs text-muted-foreground mt-0.5">@{igStatus.username}</p>
                      : <p className="text-xs text-muted-foreground mt-0.5">Not connected</p>}
                  </div>
                  {igStatus?.connected ? (
                    <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive gap-1 shrink-0"
                      onClick={() => disconnectIg.mutate({ clientSlug: slug })} disabled={disconnectIg.isPending}>
                      <X className="w-3 h-3" /> Disconnect
                    </Button>
                  ) : (
                    <a href={`/api/auth/instagram/init/${encodeURIComponent(slug)}`}>
                      <Button variant="outline" size="sm" className="h-7 text-xs gap-1 shrink-0">
                        <Link2 className="w-3 h-3" /> Connect
                      </Button>
                    </a>
                  )}
                </div>

                {/* Facebook */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className={`w-7 h-7 rounded-md shrink-0 flex items-center justify-center ${fbStatus?.connected ? "bg-blue-600" : "bg-muted"}`}>
                    <Share2 className={`w-3.5 h-3.5 ${fbStatus?.connected ? "text-white" : "text-muted-foreground"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium leading-none">Facebook</p>
                    {fbStatus?.connected
                      ? <p className="text-xs text-muted-foreground mt-0.5">{fbStatus.pageName}</p>
                      : <p className="text-xs text-muted-foreground mt-0.5">Not connected</p>}
                  </div>
                  {fbStatus?.connected ? (
                    <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive gap-1 shrink-0"
                      onClick={() => disconnectFb.mutate({ clientSlug: slug })} disabled={disconnectFb.isPending}>
                      <X className="w-3 h-3" /> Disconnect
                    </Button>
                  ) : (
                    <a href={`/api/auth/facebook/init/${encodeURIComponent(slug)}`}>
                      <Button variant="outline" size="sm" className="h-7 text-xs gap-1 shrink-0">
                        <Link2 className="w-3 h-3" /> Connect
                      </Button>
                    </a>
                  )}
                </div>

                {/* LinkedIn */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className={`w-7 h-7 rounded-md shrink-0 flex items-center justify-center ${liStatus?.connected ? "bg-sky-700" : "bg-muted"}`}>
                    <Globe className={`w-3.5 h-3.5 ${liStatus?.connected ? "text-white" : "text-muted-foreground"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium leading-none">LinkedIn</p>
                    {liStatus?.connected
                      ? <p className="text-xs text-muted-foreground mt-0.5">{liStatus.orgName || liStatus.personUrn || "Connected"}</p>
                      : <p className="text-xs text-muted-foreground mt-0.5">Not connected</p>}
                  </div>
                  {liStatus?.connected ? (
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="flex gap-1">
                        {(["personal", "organization"] as const).map(t => (
                          <button key={t} onClick={() => setLiPostTargetMutation.mutate({ clientSlug: slug, target: t })}
                            className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${liStatus.postTarget === t ? "bg-sky-100 text-sky-700 border-sky-300 font-semibold" : "text-muted-foreground border-border hover:bg-muted"}`}>
                            {t === "personal" ? "Personal" : "Org"}
                          </button>
                        ))}
                      </div>
                      <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive gap-1"
                        onClick={() => disconnectLi.mutate({ clientSlug: slug })} disabled={disconnectLi.isPending}>
                        <X className="w-3 h-3" /> Disconnect
                      </Button>
                    </div>
                  ) : (
                    <a href={`/api/auth/linkedin/init/${encodeURIComponent(slug)}`}>
                      <Button variant="outline" size="sm" className="h-7 text-xs gap-1 shrink-0">
                        <Link2 className="w-3 h-3" /> Connect
                      </Button>
                    </a>
                  )}
                </div>

                {/* Mailchimp */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className={`w-7 h-7 rounded-md shrink-0 flex items-center justify-center ${profile?.mailchimpApiKey ? "bg-[#FFE01B]" : "bg-muted"}`}>
                    <Mail className={`w-3.5 h-3.5 ${profile?.mailchimpApiKey ? "text-[#241C15]" : "text-muted-foreground"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium leading-none">Mailchimp</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{profile?.mailchimpApiKey ? "API key configured" : "No API key set"}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Input
                      type="password"
                      className="h-7 text-xs font-mono w-44"
                      placeholder={profile?.mailchimpApiKey ? "Update key…" : "Paste key…"}
                      value={mailchimpKeyInput}
                      onChange={e => setMailchimpKeyInput(e.target.value)}
                    />
                    <Button size="sm" className="h-7 text-xs"
                      disabled={!mailchimpKeyInput.trim() || setMailchimpKeyMutation.isPending}
                      onClick={() => setMailchimpKeyMutation.mutate({ clientSlug: slug, apiKey: mailchimpKeyInput.trim() })}>
                      {setMailchimpKeyMutation.isPending ? "…" : "Save"}
                    </Button>
                  </div>
                </div>

                {/* Plausible Analytics */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className={`w-7 h-7 rounded-md shrink-0 flex items-center justify-center ${profile?.analyticsToken ? "bg-indigo-600" : "bg-muted"}`}>
                    <BarChart2 className={`w-3.5 h-3.5 ${profile?.analyticsToken ? "text-white" : "text-muted-foreground"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium leading-none">Plausible Analytics</p>
                    {profile?.analyticsToken
                      ? <p className="text-xs text-muted-foreground mt-0.5 truncate">{window.location.origin}/analytics/{profile.analyticsToken}</p>
                      : <p className="text-xs text-muted-foreground mt-0.5">No embed configured</p>}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {profile?.analyticsToken && (
                      <>
                        <Button variant="outline" size="sm" className="h-7 w-7 p-0"
                          onClick={() => navigator.clipboard.writeText(`${window.location.origin}/analytics/${profile!.analyticsToken!}`).then(() => toast.success("Link copied"))}>
                          <Link2 className="w-3 h-3" />
                        </Button>
                        <Button variant="outline" size="sm" className="h-7 w-7 p-0"
                          onClick={() => window.open(`/analytics/${profile!.analyticsToken}`, "_blank")}>
                          <ExternalLink className="w-3 h-3" />
                        </Button>
                      </>
                    )}
                    <Input
                      className="h-7 text-xs w-44"
                      placeholder="https://plausible.io/…?embed=true"
                      value={embedUrl}
                      onChange={e => setEmbedUrl(e.target.value)}
                    />
                    {(!profile?.analyticsToken || embedUrl) && (
                      <Button size="sm" className="h-7 text-xs"
                        disabled={!embedUrl.trim() || setAnalyticsMutation.isPending}
                        onClick={() => { if (embedUrl.trim()) setAnalyticsMutation.mutate({ clientSlug: slug, analyticsEmbed: embedUrl.trim() }); }}>
                        {setAnalyticsMutation.isPending ? "…" : profile?.analyticsToken ? "Update" : "Enable"}
                      </Button>
                    )}
                    {profile?.analyticsToken && !embedUrl && (
                      <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive"
                        onClick={() => clearAnalyticsMutation.mutate({ clientSlug: slug })} disabled={clearAnalyticsMutation.isPending}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                </div>

              </div>
            </Card>
          </div>
        )}

        {/* ── Billing tab ── */}
        {tab === "billing" && (
          <div className="space-y-10">

            {/* Recurring Billing (Card on File) */}
            <Card className="shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-muted-foreground" />
                    <p className="text-sm font-semibold">Recurring Billing (Card on File)</p>
                    {mandate && (
                      <Badge variant="outline" className={`text-[10px] px-2 py-0.5 ${
                        mandate.status === "active" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                        mandate.status === "pending_card" ? "bg-amber-50 text-amber-700 border-amber-200" :
                        mandate.status === "failed" ? "bg-red-50 text-red-700 border-red-200" :
                        "bg-gray-100 text-gray-600 border-gray-200"
                      }`}>
                        {mandate.status === "active" ? "Active" :
                         mandate.status === "pending_card" ? "Awaiting card" :
                         mandate.status === "paused" ? "Paused" :
                         mandate.status === "cancelled" ? "Cancelled" : "Failed"}
                      </Badge>
                    )}
                  </div>
                  {!mandate && (
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => {
                      setMandateLineItems([{ description: "", amount: "", interval: "monthly", nextBillingDate: "" }]);
                      setMandateStartDate(new Date().toISOString().slice(0, 10));
                      setMandateChargeOnSetup(true);
                      setMandateFormOpen(true);
                    }}>
                      <Plus className="w-3 h-3 mr-1" /> Set up
                    </Button>
                  )}
                </div>

                {!mandate ? (
                  <p className="text-xs text-muted-foreground">No mandate set up. Click "Set up" to create a recurring billing mandate with Paystack card-on-file.</p>
                ) : mandate.status === "pending_card" ? (
                  <div className="space-y-3">
                    <div className="border rounded-md overflow-hidden text-xs">
                      {mandate.lineItems.map(item => (
                        <div key={item.id} className="flex justify-between px-3 py-2 border-b last:border-0">
                          <span className="text-gray-700">{item.description}</span>
                          <span className="font-medium">{formatCurrency(item.amount)}/{item.interval === "monthly" ? "mo" : "yr"}</span>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        readOnly
                        value={`${window.location.origin}/billing/${mandate.shareToken}`}
                        className="text-xs h-7 font-mono"
                      />
                      <Button size="sm" variant="outline" className="h-7 text-xs shrink-0" onClick={() => {
                        navigator.clipboard.writeText(`${window.location.origin}/billing/${mandate.shareToken}`);
                        toast.success("Link copied");
                      }}>
                        <Copy className="w-3 h-3 mr-1" /> Copy
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs shrink-0" onClick={() => {
                        const email = profile?.email ?? "";
                        if (email) sendSetupEmail.mutate({ mandateId: mandate.id, email });
                        else toast.error("No client email on file");
                      }} disabled={sendSetupEmail.isPending}>
                        {sendSetupEmail.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3 mr-1" />} Send
                      </Button>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2 text-muted-foreground" onClick={() => {
                        setMandateLineItems(mandate.lineItems.map(i => ({ description: i.description, amount: String(i.amount), interval: i.interval as "monthly" | "annual", nextBillingDate: "" })));
                        setMandateStartDate(new Date().toISOString().slice(0, 10));
                        setMandateChargeOnSetup(true);
                        setMandateEditMode(true);
                        setMandateFormOpen(true);
                      }}>Edit line items</Button>
                      <Button size="sm" variant="ghost" className="h-6 text-[10px] text-destructive px-2" onClick={() => {
                        if (confirm("Cancel this mandate?")) cancelMandate.mutate({ mandateId: mandate.id });
                      }}>Cancel mandate</Button>
                    </div>
                  </div>
                ) : mandate.status === "active" ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-xs text-emerald-700">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>{mandate.cardBrand ?? "Card"} ···· {mandate.cardLast4} on file</span>
                    </div>
                    <div className="border rounded-md overflow-hidden text-xs">
                      {mandate.lineItems.map(item => (
                        <div key={item.id} className="flex justify-between items-center px-3 py-2 border-b last:border-0">
                          <div>
                            <p className="text-gray-700">{item.description}</p>
                            <p className="text-muted-foreground text-[10px]">Next: {item.nextBillingDate ? new Date(item.nextBillingDate).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" }) : "—"}</p>
                          </div>
                          <span className="font-medium">{formatCurrency(item.amount)}/{item.interval === "monthly" ? "mo" : "yr"}</span>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => pauseMandate.mutate({ mandateId: mandate.id })} disabled={pauseMandate.isPending}>
                        Pause
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => {
                        setMandateLineItems(mandate.lineItems.map(i => ({ description: i.description, amount: String(i.amount), interval: i.interval as "monthly" | "annual", nextBillingDate: i.nextBillingDate ? new Date(i.nextBillingDate).toISOString().slice(0, 10) : "" })));
                        setMandateStartDate(new Date().toISOString().slice(0, 10));
                        setMandateChargeOnSetup(true);
                        setMandateEditMode(true);
                        setMandateFormOpen(true);
                      }}>Edit</Button>
                      <Button size="sm" variant="ghost" className="h-7 text-[10px] text-destructive px-2" onClick={() => {
                        if (confirm("Cancel this mandate? The client's card will no longer be charged.")) cancelMandate.mutate({ mandateId: mandate.id });
                      }}>Cancel</Button>
                    </div>
                  </div>
                ) : mandate.status === "paused" ? (
                  <div className="space-y-3">
                    <p className="text-xs text-muted-foreground">Billing is paused. No charges will run until resumed.</p>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => resumeMandate.mutate({ mandateId: mandate.id })} disabled={resumeMandate.isPending}>
                        Resume
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-[10px] text-destructive px-2" onClick={() => {
                        if (confirm("Cancel this mandate?")) cancelMandate.mutate({ mandateId: mandate.id });
                      }}>Cancel</Button>
                    </div>
                  </div>
                ) : mandate.status === "failed" ? (
                  <div className="space-y-2">
                    <p className="text-xs text-red-600">A charge failed. Please contact the client to update their card details — create a new mandate to restart billing.</p>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => {
                      setMandateLineItems(mandate.lineItems.map(i => ({ description: i.description, amount: String(i.amount), interval: i.interval as "monthly" | "annual", nextBillingDate: "" })));
                      setMandateStartDate(new Date().toISOString().slice(0, 10));
                      setMandateChargeOnSetup(true);
                      setMandateFormOpen(true);
                    }}>
                      Create new mandate
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">Mandate cancelled. You can create a new one to restart billing.</p>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => {
                      setMandateLineItems(mandate.lineItems.map(i => ({ description: i.description, amount: String(i.amount), interval: i.interval as "monthly" | "annual", nextBillingDate: "" })));
                      setMandateStartDate(new Date().toISOString().slice(0, 10));
                      setMandateChargeOnSetup(true);
                      setMandateFormOpen(true);
                    }}>
                      Create new mandate
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Mandate creation / edit dialog */}
            <Dialog open={mandateFormOpen} onOpenChange={v => { setMandateFormOpen(v); if (!v) setMandateEditMode(false); }}>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle className="text-base">{mandateEditMode ? "Edit mandate" : "Set up recurring billing"}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Line items</Label>
                    {mandateLineItems.map((item, idx) => (
                      <div key={idx} className="flex gap-2 items-start">
                        <Input
                          placeholder="Service description"
                          value={item.description}
                          onChange={e => setMandateLineItems(prev => prev.map((x, i) => i === idx ? { ...x, description: e.target.value } : x))}
                          className="text-xs h-8 flex-1"
                        />
                        <div className="relative">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">R</span>
                          <Input
                            type="number"
                            placeholder="0.00"
                            value={item.amount}
                            onChange={e => setMandateLineItems(prev => prev.map((x, i) => i === idx ? { ...x, amount: e.target.value } : x))}
                            className="text-xs h-8 w-24 pl-6"
                          />
                        </div>
                        <Select value={item.interval} onValueChange={v => setMandateLineItems(prev => prev.map((x, i) => i === idx ? { ...x, interval: v as "monthly" | "annual" } : x))}>
                          <SelectTrigger className="h-8 text-xs w-28">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="monthly">Monthly</SelectItem>
                            <SelectItem value="annual">Annual</SelectItem>
                          </SelectContent>
                        </Select>
                        {mandateLineItems.length > 1 && (
                          <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0 text-muted-foreground" onClick={() => setMandateLineItems(prev => prev.filter((_, i) => i !== idx))}>
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    ))}
                    <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground px-1" onClick={() => setMandateLineItems(prev => [...prev, { description: "", amount: "", interval: "monthly", nextBillingDate: "" }])}>
                      <Plus className="w-3 h-3 mr-1" /> Add line item
                    </Button>
                  </div>
                  {!mandateEditMode && (
                    <div className="space-y-1">
                      <Label className="text-xs font-medium">Billing start date</Label>
                      <Input type="date" value={mandateStartDate} onChange={e => setMandateStartDate(e.target.value)} className="text-xs h-8" />
                    </div>
                  )}
                  {!mandateEditMode && (
                    <>
                      <div className="flex items-center justify-between rounded-md border px-3 py-2">
                        <div>
                          <p className="text-xs font-medium">Migrating existing client</p>
                          <p className="text-[11px] text-muted-foreground">Skip initial charge — card will be tokenised with R1 only</p>
                        </div>
                        <Switch checked={!mandateChargeOnSetup} onCheckedChange={v => setMandateChargeOnSetup(!v)} />
                      </div>
                      {!mandateChargeOnSetup && (
                        <div className="space-y-2">
                          <Label className="text-xs font-medium">Next billing date per line item</Label>
                          {mandateLineItems.map((item, idx) => (
                            <div key={idx} className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground flex-1 truncate">{item.description || `Item ${idx + 1}`}</span>
                              <Input
                                type="date"
                                value={item.nextBillingDate}
                                onChange={e => setMandateLineItems(prev => prev.map((x, i) => i === idx ? { ...x, nextBillingDate: e.target.value } : x))}
                                className="text-xs h-8 w-40"
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                  {mandateEditMode && mandate?.status === "active" && (
                    <div className="space-y-2">
                      <Label className="text-xs font-medium">Next billing date per line item</Label>
                      <p className="text-[11px] text-muted-foreground">Changes take effect from the next billing cycle.</p>
                      {mandateLineItems.map((item, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground flex-1 truncate">{item.description || `Item ${idx + 1}`}</span>
                          <Input
                            type="date"
                            value={item.nextBillingDate}
                            onChange={e => setMandateLineItems(prev => prev.map((x, i) => i === idx ? { ...x, nextBillingDate: e.target.value } : x))}
                            className="text-xs h-8 w-40"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button variant="outline" size="sm" onClick={() => { setMandateFormOpen(false); setMandateEditMode(false); }}>Cancel</Button>
                  <Button size="sm" className="bg-[#2286c2] hover:bg-[#1a6fa0] text-white"
                    disabled={
                      (mandateEditMode ? updateLineItems.isPending : createMandate.isPending) ||
                      mandateLineItems.some(i => !i.description || !i.amount) ||
                      (!mandateChargeOnSetup && !mandateEditMode && mandateLineItems.some(i => !i.nextBillingDate)) ||
                      (mandateEditMode && mandate?.status === "active" && mandateLineItems.some(i => !i.nextBillingDate))
                    }
                    onClick={() => {
                      if (mandateEditMode) {
                        updateLineItems.mutate({
                          mandateId: mandate!.id,
                          lineItems: mandateLineItems.map(i => ({ description: i.description, amount: i.amount, interval: i.interval, nextBillingDate: i.nextBillingDate || new Date().toISOString().slice(0, 10) })),
                        });
                      } else {
                        const emailForMandate = profile?.email || clientEmailFromInvoices || "";
                        if (!emailForMandate) { toast.error("Client has no email on file"); return; }
                        createMandate.mutate({
                          clientSlug: slug,
                          clientName: profile?.name ?? slug,
                          clientEmail: emailForMandate,
                          startDate: mandateStartDate,
                          chargeOnSetup: mandateChargeOnSetup,
                          lineItems: mandateLineItems.map(i => ({ description: i.description, amount: i.amount, interval: i.interval, nextBillingDate: i.nextBillingDate || undefined })),
                        });
                      }
                    }}>
                    {(mandateEditMode ? updateLineItems.isPending : createMandate.isPending) ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                    {mandateEditMode ? "Save changes" : "Create mandate"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Monthly auto-invoice + Scheduled invoices */}
            <div className="grid grid-cols-2 gap-4 items-start">

            {/* Monthly auto-invoice config — deprecated in favour of Scheduled Sends with repeat */}
            {false && (<Card className="shadow-sm">
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
                      <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Recipient emails (comma-separated, blank = use client email)</label>
                      <Input type="text" className="mt-1 h-8 text-xs" value={recurringDraft.recipientEmail}
                        placeholder="one@example.com, two@example.com"
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
            </Card>)}

            {/* Scheduled invoices */}
            <Card className="shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center gap-2 mb-4">
                  <CalendarClock className="w-4 h-4 text-muted-foreground" />
                  <p className="text-sm font-semibold">Scheduled Sends</p>
                </div>
                {(() => {
                  const scheduled = invoices?.filter(i => (i as any).scheduledSendDate) || [];
                  if (scheduled.length === 0) {
                    return <p className="text-xs text-muted-foreground">No invoices scheduled to send.</p>;
                  }
                  return (
                    <div className="space-y-2">
                      {scheduled.map(inv => (
                        <div key={inv.id} className="flex items-center justify-between gap-2 text-xs">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <a href={`/client/${slug}/invoice/${inv.invoiceNumber}`} className="font-mono font-medium text-primary hover:underline">
                                {inv.invoiceNumber}
                              </a>
                              {(inv as any).repeatMonthly ? (
                                <span className="text-[9px] font-semibold uppercase tracking-wider bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">Monthly</span>
                              ) : (
                                <span className="text-[9px] font-semibold uppercase tracking-wider bg-muted text-muted-foreground px-1.5 py-0.5 rounded">Once</span>
                              )}
                            </div>
                            <p className="text-muted-foreground truncate">{inv.clientEmail || "—"}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="font-medium text-foreground">
                              {new Date((inv as any).scheduledSendDate).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}
                            </p>
                            <p className="text-muted-foreground font-mono">R{parseFloat(String(inv.totalAmount)).toFixed(2)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </CardContent>
            </Card>

            </div>{/* end grid */}

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

    </div>
  );
}
