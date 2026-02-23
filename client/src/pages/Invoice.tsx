import { trpc } from "@/lib/trpc";
import { Link, useParams } from "wouter";
import { ChevronLeft, Repeat, CalendarDays, ChevronDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useState } from "react";
import {
  FileText,
  Building2,
  CreditCard,
  Landmark,
  Clock,
  CheckCircle2,
  AlertCircle,
  Printer,
  Mail,
  Phone,
  Globe,
  Sparkles,
  ExternalLink,
  Link2,
  Pencil,
  Check,
  X,
  Send,
  Trash2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function formatCurrency(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "R0.00";
  const num = typeof value === "string" ? parseFloat(value) : value;
  return `R${num.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
    draft: {
      label: "Draft",
      className: "bg-gray-100 text-gray-700 border-gray-200",
      icon: <FileText className="w-3 h-3" />,
    },
    sent: {
      label: "Awaiting Payment",
      className: "bg-amber-50 text-amber-700 border-amber-200",
      icon: <Clock className="w-3 h-3" />,
    },
    paid: {
      label: "Paid",
      className: "bg-emerald-50 text-emerald-700 border-emerald-200",
      icon: <CheckCircle2 className="w-3 h-3" />,
    },
    overdue: {
      label: "Overdue",
      className: "bg-red-50 text-red-700 border-red-200",
      icon: <AlertCircle className="w-3 h-3" />,
    },
  };
  const c = config[status] || config.sent;
  return (
    <Badge variant="outline" className={`${c.className} gap-1.5 px-3 py-1 text-xs font-medium`}>
      {c.icon}
      {c.label}
    </Badge>
  );
}

function InvoiceTypeBadge({ type }: { type: string }) {
  if (type === "monthly")
    return (
      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 gap-1.5 px-3 py-1 text-xs font-medium">
        <Repeat className="w-3 h-3" />
        Monthly Recurring
      </Badge>
    );
  if (type === "annual")
    return (
      <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 gap-1.5 px-3 py-1 text-xs font-medium">
        <CalendarDays className="w-3 h-3" />
        Annual Recurring
      </Badge>
    );
  return null;
}

export default function Invoice() {
  const params = useParams<{ invoiceNumber: string; slug?: string }>();
  const invoiceNumber = params.invoiceNumber || "IGL002";
  const clientSlug = params.slug;

  const { data, isLoading, error } = trpc.invoice.getByNumber.useQuery({ invoiceNumber });
  const { data: me } = trpc.auth.me.useQuery();
  const isAdmin = me?.role === "admin";

  const utils = trpc.useUtils();

  const updateStatus = trpc.invoice.updateStatus.useMutation({
    onSuccess: () => {
      utils.invoice.getByNumber.invalidate({ invoiceNumber });
      utils.invoice.metrics.invalidate();
      toast.success("Invoice updated");
    },
    onError: () => toast.error("Failed to update status"),
  });

  const updatePaymentUrl = trpc.invoice.updatePaymentUrl.useMutation({
    onSuccess: () => {
      utils.invoice.getByNumber.invalidate({ invoiceNumber });
      setEditingPayFast(false);
      toast.success("PayFast link saved");
    },
    onError: () => toast.error("Failed to save link"),
  });

  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const deleteInvoice = trpc.invoice.delete.useMutation({
    onSuccess: () => {
      toast.success("Invoice deleted");
      window.location.href = clientSlug ? `/client/${clientSlug}` : "/invoices";
    },
    onError: () => toast.error("Failed to delete invoice"),
  });

  const [editingPayFast, setEditingPayFast] = useState(false);
  const [payFastDraft, setPayFastDraft] = useState("");
  const [payFastTokenDraft, setPayFastTokenDraft] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailDraft, setEmailDraft] = useState("");

  const sendEmail = trpc.invoice.sendEmail.useMutation({
    onSuccess: () => {
      setSendingEmail(false);
      setEmailDraft("");
      toast.success("Invoice sent successfully");
    },
    onError: (e) => toast.error(e.message || "Failed to send email"),
  });

  const backPath = clientSlug ? `/client/${clientSlug}` : "/";

  function copyShareLink(shareToken: string | null | undefined) {
    if (!shareToken) return;
    const url = `${window.location.origin}/i/${shareToken}`;
    navigator.clipboard.writeText(url).then(() => toast.success("Share link copied to clipboard"));
  }

  function startEditingPayFast(currentUrl: string | null | undefined, currentToken: string | null | undefined) {
    setPayFastDraft(currentUrl || "");
    setPayFastTokenDraft(currentToken || "");
    setEditingPayFast(true);
  }

  function savePayFastUrl(invoiceId: number) {
    updatePaymentUrl.mutate({
      invoiceId,
      paymentUrl: payFastDraft.trim() || null,
      paymentToken: payFastTokenDraft.trim() || null,
    });
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Loading invoice...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center">
            <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
            <h2 className="text-lg font-semibold mb-2">Invoice Not Found</h2>
            <p className="text-sm text-muted-foreground">
              The requested invoice could not be loaded. Please try again later.
            </p>
            <Link href={backPath}>
              <Button variant="outline" className="mt-4">
                <ChevronLeft className="w-4 h-4 mr-1" />
                Back
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { invoice, items } = data;
  const isRecurring = invoice.invoiceType === "monthly" || invoice.invoiceType === "annual";

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar with actions */}
      <div className="no-print sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <Link href={backPath} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <ChevronLeft className="w-4 h-4 text-muted-foreground" />
            <div className="w-8 h-8 bg-primary rounded-md flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-sm">G</span>
            </div>
            <span className="font-semibold text-sm text-foreground tracking-tight">Gro Digital</span>
          </Link>
          <div className="flex items-center gap-2">
            {/* Mark as Paid / Sent — kept standalone */}
            {isAdmin && data?.invoice && (
              data.invoice.status === "paid" ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-xs"
                  onClick={() => updateStatus.mutate({ invoiceId: data.invoice.id, status: "sent" })}
                  disabled={updateStatus.isPending}
                >
                  <X className="w-3.5 h-3.5" />
                  Mark as Sent
                </Button>
              ) : (
                <Button
                  size="sm"
                  className="gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={() => updateStatus.mutate({ invoiceId: data.invoice.id, status: "paid" })}
                  disabled={updateStatus.isPending}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Mark as Paid
                </Button>
              )
            )}

            {/* Actions dropdown */}
            {isAdmin && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                    Actions
                    <ChevronDown className="w-3 h-3 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  {data?.invoice.shareToken && (
                    <>
                      <DropdownMenuItem
                        onClick={() => {
                          setEmailDraft(data.invoice.clientEmail || "");
                          setSendingEmail(true);
                        }}
                      >
                        <Send className="w-3.5 h-3.5 mr-2" />
                        Send to Client
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => copyShareLink(data?.invoice.shareToken)}>
                        <Link2 className="w-3.5 h-3.5 mr-2" />
                        Copy Share Link
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  )}
                  <DropdownMenuItem asChild>
                    <Link href={`/invoice/${invoiceNumber}/edit`} className="flex items-center">
                      <Pencil className="w-3.5 h-3.5 mr-2" />
                      Edit Invoice
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => window.print()} className="text-muted-foreground">
                    <Printer className="w-3.5 h-3.5 mr-2" />
                    Print / Save as PDF
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setDeleteConfirm(true)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-2" />
                    Delete Invoice
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* Print button for non-admin (public view) */}
            {!isAdmin && (
              <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => window.print()}>
                <Printer className="w-3.5 h-3.5" />
                Print
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Invoice content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {/* Header */}
        <div className="mb-10">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6">
            {/* Company branding */}
            <div>
              <div className="flex items-center gap-3 mb-1">
                <div className="w-12 h-12 bg-primary rounded-lg flex items-center justify-center shadow-sm">
                  <span className="text-primary-foreground font-bold text-xl tracking-tighter">G</span>
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-foreground tracking-tight">
                    GRO<span className="font-light">digital</span>
                  </h1>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2 ml-0.5">
                Gro Digital (Pty) Ltd
              </p>
              <p className="text-xs text-muted-foreground ml-0.5">
                Darter Studios, Darter Road, Longkloof
              </p>
              <p className="text-xs text-muted-foreground ml-0.5">
                Gardens, Cape Town, 8001
              </p>
            </div>

            {/* Invoice meta */}
            <div className="sm:text-right">
              <h2 className="text-3xl font-light text-foreground tracking-tight mb-3">Invoice</h2>
              <div className="space-y-1.5">
                <div className="flex sm:justify-end items-center gap-2">
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">No.</span>
                  <span className="text-sm font-semibold font-mono text-foreground">{invoice.invoiceNumber}</span>
                </div>
                <div className="flex sm:justify-end items-center gap-2">
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">Date</span>
                  <span className="text-sm text-foreground">{formatDate(invoice.invoiceDate)}</span>
                </div>
                <div className="flex sm:justify-end items-center gap-2">
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">Status</span>
                  <StatusBadge status={invoice.status} />
                </div>
                {isRecurring && (
                  <div className="flex sm:justify-end items-center gap-2 pt-1">
                    <InvoiceTypeBadge type={invoice.invoiceType} />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Client details */}
        <Card className="mb-8 shadow-sm">
          <CardContent className="p-5 sm:p-6">
            <div className="flex items-center gap-2 mb-4">
              <Building2 className="w-4 h-4 text-primary" />
              <h3 className="text-xs font-semibold uppercase tracking-wider text-primary">Bill To</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-base font-semibold text-foreground">{invoice.clientName}</p>
                {invoice.clientContact && (
                  <p className="text-sm text-muted-foreground mt-1">{invoice.clientContact}</p>
                )}
                {invoice.clientPhone && (
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">{invoice.clientPhone}</span>
                  </div>
                )}
              </div>
              <div className="sm:text-right">
                {invoice.projectName && (
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Project</p>
                    <p className="text-sm font-medium text-foreground">{invoice.projectName}</p>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Project summary */}
        {invoice.projectSummary && (
          <Card className="mb-8 shadow-sm border-primary/10 bg-primary/[0.02]">
            <CardContent className="p-5 sm:p-6">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4 text-primary" />
                <h3 className="text-xs font-semibold uppercase tracking-wider text-primary">
                  {isRecurring ? "Service Description" : "Project Summary"}
                </h3>
              </div>
              <p className="text-sm leading-relaxed text-foreground/80">{invoice.projectSummary}</p>
              {!isRecurring && invoice.invoiceNumber === "IGL002" && (
                <div className="mt-4 flex flex-wrap gap-3">
                  <div className="flex items-center gap-2 bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-md text-xs font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    78 products delivered (10 quoted)
                  </div>
                  <div className="flex items-center gap-2 bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-md text-xs font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    7 articles delivered (6 quoted)
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* PayFast payment button for recurring invoices */}
        {isRecurring && (
          <Card className={`mb-8 shadow-sm border-2 ${invoice.invoiceType === "monthly" ? "border-blue-200 bg-blue-50/30" : "border-purple-200 bg-purple-50/30"}`}>
            <CardContent className="p-5 sm:p-6 text-center">
              <div className="flex items-center justify-center gap-2 mb-3">
                <CreditCard className={`w-5 h-5 ${invoice.invoiceType === "monthly" ? "text-blue-600" : "text-purple-600"}`} />
                <h3 className={`text-sm font-semibold ${invoice.invoiceType === "monthly" ? "text-blue-800" : "text-purple-800"}`}>
                  Set Up {invoice.invoiceType === "monthly" ? "Monthly" : "Annual"} Payment
                </h3>
              </div>
              <p className="text-xs text-muted-foreground mb-4 max-w-md mx-auto">
                Click the button below to securely set up your {invoice.invoiceType === "monthly" ? "monthly" : "annual"} recurring payment via PayFast.
                Your card details will be stored securely by PayFast.
              </p>
              {invoice.paymentUrl ? (
                <a href={invoice.paymentUrl} target="_blank" rel="noopener noreferrer">
                  <Button
                    size="lg"
                    className={`gap-2 text-sm font-semibold px-8 ${
                      invoice.invoiceType === "monthly"
                        ? "bg-blue-600 hover:bg-blue-700 text-white"
                        : "bg-purple-600 hover:bg-purple-700 text-white"
                    }`}
                  >
                    <CreditCard className="w-4 h-4" />
                    Pay {formatCurrency(invoice.amountDue)}/{invoice.invoiceType === "monthly" ? "month" : "year"} via PayFast
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Button>
                </a>
              ) : (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 max-w-md mx-auto">
                  <p className="text-xs text-amber-700 font-medium">
                    PayFast payment link will be available shortly. In the meantime, you may pay via EFT using the banking details below.
                  </p>
                </div>
              )}

              {/* Admin: edit PayFast URL */}
              {isAdmin && (
                <div className="mt-5 pt-5 border-t border-border/50">
                  {editingPayFast ? (
                    <div className="space-y-2 max-w-md mx-auto">
                      <div className="flex items-center gap-2">
                        <Input
                          className="text-xs h-8"
                          placeholder="Paste PayFast subscription URL..."
                          value={payFastDraft}
                          onChange={e => setPayFastDraft(e.target.value)}
                          autoFocus
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          className="text-xs h-8 font-mono"
                          placeholder="PayFast subscription token (for webhooks)..."
                          value={payFastTokenDraft}
                          onChange={e => setPayFastTokenDraft(e.target.value)}
                        />
                        <Button
                          size="sm"
                          variant="default"
                          className="h-8 px-3 shrink-0"
                          onClick={() => savePayFastUrl(invoice.id)}
                          disabled={updatePaymentUrl.isPending}
                        >
                          <Check className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 px-3 shrink-0"
                          onClick={() => setEditingPayFast(false)}
                        >
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => startEditingPayFast(invoice.paymentUrl, invoice.paymentToken)}
                    >
                      <Pencil className="w-3 h-3" />
                      {invoice.paymentUrl ? "Edit PayFast link" : "Add PayFast link"}
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Line items table */}
        <Card className="mb-8 shadow-sm overflow-hidden">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground px-5 py-3.5">
                      Description
                    </th>
                    <th className="text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground px-4 py-3.5 hidden sm:table-cell">
                      Frequency
                    </th>
                    <th className="text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground px-4 py-3.5 hidden sm:table-cell">
                      VAT
                    </th>
                    <th className="text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground px-5 py-3.5">
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {items.map((item, i) => (
                    <tr key={item.id} className={i % 2 === 0 ? "bg-background" : "bg-muted/20"}>
                      <td className="px-5 py-3.5 text-sm text-foreground">{item.description}</td>
                      <td className="px-4 py-3.5 text-sm text-center text-muted-foreground hidden sm:table-cell">
                        {item.frequency}
                      </td>
                      <td className="px-4 py-3.5 text-sm text-center text-muted-foreground hidden sm:table-cell">
                        {item.vat}
                      </td>
                      <td className="px-5 py-3.5 text-sm text-right font-mono font-medium text-foreground">
                        {formatCurrency(item.unitPrice)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="border-t border-border bg-muted/30">
              <div className="max-w-xs ml-auto px-5 py-4 space-y-2">
                {!isRecurring && (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span className="font-mono text-foreground">{formatCurrency(invoice.subtotal)}</span>
                    </div>
                    {invoice.discountPercent && parseFloat(String(invoice.discountPercent)) > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">
                          Discount ({invoice.discountPercent}%)
                        </span>
                        <span className="font-mono text-emerald-600">
                          -{formatCurrency(invoice.discountAmount)}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Total Project Value</span>
                      <span className="font-mono font-medium text-foreground">{formatCurrency(invoice.totalAmount)}</span>
                    </div>
                    <Separator className="my-2" />
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Deposit Paid (IGL001)</span>
                      <span className="font-mono text-emerald-600">
                        -{formatCurrency(parseFloat(String(invoice.totalAmount)) - parseFloat(String(invoice.amountDue)))}
                      </span>
                    </div>
                    <Separator className="my-2" />
                  </>
                )}
                <div className="flex justify-between items-center pt-1">
                  <span className="text-base font-semibold text-foreground">
                    {isRecurring ? "Total" : "Amount Due"}
                  </span>
                  <span className="text-xl font-bold font-mono text-primary">
                    {formatCurrency(invoice.amountDue)}
                    {invoice.invoiceType === "monthly" && <span className="text-xs font-normal text-muted-foreground">/mo</span>}
                    {invoice.invoiceType === "annual" && <span className="text-xs font-normal text-muted-foreground">/yr</span>}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Payment details grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Banking details */}
          <Card className="shadow-sm">
            <CardContent className="p-5 sm:p-6">
              <div className="flex items-center gap-2 mb-4">
                <Landmark className="w-4 h-4 text-primary" />
                <h3 className="text-xs font-semibold uppercase tracking-wider text-primary">Banking Details for EFT</h3>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">Bank</span>
                  <span className="text-sm font-medium text-foreground">{invoice.bankName}</span>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">Account Holder</span>
                  <span className="text-sm font-medium text-foreground">{invoice.accountHolder}</span>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">Account Type</span>
                  <span className="text-sm font-medium text-foreground">{invoice.accountType}</span>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">Account No.</span>
                  <span className="text-sm font-semibold font-mono text-foreground">{invoice.accountNumber}</span>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">Branch Code</span>
                  <span className="text-sm font-semibold font-mono text-foreground">{invoice.branchCode}</span>
                </div>
                <Separator />
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">Reference</span>
                  <span className="text-sm font-bold font-mono text-primary bg-primary/5 px-2.5 py-1 rounded">
                    {invoice.paymentReference}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Payment terms */}
          <Card className="shadow-sm">
            <CardContent className="p-5 sm:p-6">
              <div className="flex items-center gap-2 mb-4">
                <CreditCard className="w-4 h-4 text-primary" />
                <h3 className="text-xs font-semibold uppercase tracking-wider text-primary">Payment Terms</h3>
              </div>
              <div className="bg-amber-50 border border-amber-100 rounded-lg p-4 mb-4">
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="w-4 h-4 text-amber-600" />
                  <span className="text-sm font-semibold text-amber-800">{invoice.paymentTerms}</span>
                </div>
                <p className="text-xs text-amber-700 mt-1">
                  Please use the reference <span className="font-mono font-bold">{invoice.paymentReference}</span> when making payment.
                </p>
              </div>

              {invoice.notes && (
                <div className="mt-4">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Notes</p>
                  <p className="text-sm text-foreground/80 leading-relaxed">{invoice.notes}</p>
                </div>
              )}

              <Separator className="my-5" />

              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">Contact Us</p>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-sm text-foreground">hello@grodigital.co.za</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Globe className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-sm text-foreground">grodigital.co.za</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Footer */}
        <div className="text-center py-8 border-t border-border">
          <p className="text-xs text-muted-foreground">
            Thank you for your business. We look forward to a continued successful partnership.
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            Gro Digital (Pty) Ltd &middot; Darter Studios, Darter Road, Longkloof, Gardens, Cape Town, 8001
          </p>
        </div>
      </div>

      {/* Send email dialog */}
      <Dialog open={sendingEmail} onOpenChange={setSendingEmail}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Send Invoice to Client</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            An email with a link to invoice <span className="font-mono font-semibold text-foreground">{invoiceNumber}</span> will be sent to the address below.
          </p>
          <Input
            className="text-sm"
            placeholder="Client email address..."
            value={emailDraft}
            onChange={e => setEmailDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && emailDraft.trim() && data?.invoice)
                sendEmail.mutate({ invoiceId: data.invoice.id, recipientEmail: emailDraft.trim() });
            }}
            autoFocus
          />
          <div className="flex justify-end gap-2 mt-1">
            <Button variant="outline" size="sm" onClick={() => setSendingEmail(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => {
                if (emailDraft.trim() && data?.invoice)
                  sendEmail.mutate({ invoiceId: data.invoice.id, recipientEmail: emailDraft.trim() });
              }}
              disabled={!emailDraft.trim() || sendEmail.isPending}
            >
              <Send className="w-3.5 h-3.5" />
              Send
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteConfirm} onOpenChange={setDeleteConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Invoice</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete invoice <span className="font-mono font-semibold text-foreground">{invoiceNumber}</span>? This action cannot be undone.
          </p>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" size="sm" onClick={() => setDeleteConfirm(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => deleteInvoice.mutate({ invoiceNumber })}
              disabled={deleteInvoice.isPending}
            >
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />
              Delete Invoice
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
