import { trpc } from "@/lib/trpc";
import { useForm, useFieldArray, useWatch } from "react-hook-form";
import { useLocation, Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { ChevronLeft, Plus, Trash2, FileText } from "lucide-react";

type LineItem = {
  description: string;
  frequency: string;
  vat: string;
  unitPrice: number;
  quantity: number;
};

type FormData = {
  invoiceNumber: string;
  existingClient: string;
  clientName: string;
  clientSlug: string;
  clientContact: string;
  clientPhone: string;
  clientEmail: string;
  projectName: string;
  projectSummary: string;
  invoiceType: "once-off" | "monthly" | "annual";
  status: "draft" | "sent" | "paid" | "overdue";
  invoiceDate: string;
  dueDate: string;
  discountPercent: number;
  paymentReference: string;
  paymentUrl: string;
  notes: string;
  items: LineItem[];
};

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function formatCurrency(n: number) {
  return `R${n.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function CreateInvoice() {
  const [, navigate] = useLocation();
  const { data: existingClients } = trpc.invoice.clients.useQuery();

  const {
    register,
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    defaultValues: {
      invoiceNumber: "",
      existingClient: "__new__",
      clientName: "",
      clientSlug: "",
      clientContact: "",
      clientPhone: "",
      clientEmail: "",
      projectName: "",
      projectSummary: "",
      invoiceType: "once-off",
      status: "sent",
      invoiceDate: new Date().toISOString().split("T")[0],
      dueDate: "",
      discountPercent: 0,
      paymentReference: "",
      paymentUrl: "",
      notes: "",
      items: [{ description: "", frequency: "Once Off", vat: "No VAT", unitPrice: 0, quantity: 1 }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "items" });

  const watchedItems = useWatch({ control, name: "items" });
  const discountPercent = useWatch({ control, name: "discountPercent" }) || 0;
  const existingClientVal = useWatch({ control, name: "existingClient" });
  const invoiceType = useWatch({ control, name: "invoiceType" });

  const subtotal = watchedItems.reduce((sum, item) => {
    return sum + (Number(item.unitPrice) || 0) * (Number(item.quantity) || 1);
  }, 0);
  const discountAmount = subtotal * (Number(discountPercent) / 100);
  const totalAmount = subtotal - discountAmount;
  const amountDue = totalAmount;

  const create = trpc.invoice.create.useMutation({
    onSuccess: (data) => {
      toast.success("Invoice created");
      navigate(`/client/${data.clientSlug}/invoice/${data.invoiceNumber}`);
    },
    onError: (e) => toast.error(e.message || "Failed to create invoice"),
  });

  function onSelectExistingClient(slug: string) {
    setValue("existingClient", slug);
    if (slug === "__new__") {
      setValue("clientName", "");
      setValue("clientSlug", "");
      setValue("clientContact", "");
      setValue("clientPhone", "");
      return;
    }
    const client = existingClients?.find((c) => c.clientSlug === slug);
    if (client) {
      setValue("clientName", client.clientName);
      setValue("clientSlug", client.clientSlug);
      setValue("clientContact", client.clientContact || "");
      setValue("clientPhone", "");
    }
  }

  function onSubmit(data: FormData) {
    const clientSlug = data.existingClient !== "__new__" ? data.existingClient : slugify(data.clientName);

    create.mutate({
      invoiceNumber: data.invoiceNumber,
      clientName: data.clientName,
      clientSlug,
      clientContact: data.clientContact || null,
      clientPhone: data.clientPhone || null,
      clientEmail: data.clientEmail || null,
      projectName: data.projectName || null,
      projectSummary: data.projectSummary || null,
      invoiceType: data.invoiceType,
      status: data.status,
      subtotal,
      discountPercent: Number(discountPercent),
      discountAmount,
      totalAmount,
      amountDue,
      paymentTerms: "Due upon receipt",
      paymentReference: data.paymentReference || null,
      paymentUrl: data.paymentUrl || null,
      bankName: "FNB/RMB",
      accountHolder: "Gro Digital",
      accountNumber: "62842244725",
      accountType: "Gold Business Account",
      branchCode: "250655",
      notes: data.notes || null,
      invoiceDate: data.invoiceDate,
      dueDate: data.dueDate || null,
      items: watchedItems.map((item) => ({
        description: item.description,
        frequency: item.frequency || "Once Off",
        vat: item.vat || "No VAT",
        unitPrice: Number(item.unitPrice) || 0,
        quantity: Number(item.quantity) || 1,
        lineTotal: (Number(item.unitPrice) || 0) * (Number(item.quantity) || 1),
      })),
    });
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <ChevronLeft className="w-4 h-4 text-muted-foreground" />
            <div className="w-9 h-9 bg-primary rounded-lg flex items-center justify-center shadow-sm">
              <span className="text-primary-foreground font-bold text-lg tracking-tighter">G</span>
            </div>
            <span className="font-semibold text-sm text-foreground tracking-tight">Gro Digital</span>
          </Link>
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-semibold text-foreground">New Invoice</span>
          </div>
        </div>
      </header>

      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">

          {/* Invoice Details */}
          <Card className="shadow-sm">
            <CardContent className="p-6 space-y-4">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-primary">Invoice Details</h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Invoice Number *</Label>
                  <Input
                    placeholder="e.g. INV-BI069"
                    className="h-9 text-sm"
                    {...register("invoiceNumber", { required: true })}
                  />
                  {errors.invoiceNumber && <p className="text-xs text-destructive">Required</p>}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Invoice Date *</Label>
                  <Input type="date" className="h-9 text-sm" {...register("invoiceDate", { required: true })} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Type</Label>
                  <Select defaultValue="once-off" onValueChange={(v) => setValue("invoiceType", v as any)}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="once-off">Once-off</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="annual">Annual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Status</Label>
                  <Select defaultValue="sent" onValueChange={(v) => setValue("status", v as any)}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="sent">Sent</SelectItem>
                      <SelectItem value="paid">Paid</SelectItem>
                      <SelectItem value="overdue">Overdue</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Due Date</Label>
                  <Input type="date" className="h-9 text-sm" {...register("dueDate")} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Client */}
          <Card className="shadow-sm">
            <CardContent className="p-6 space-y-4">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-primary">Client</h2>
              {existingClients && existingClients.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Select Existing Client</Label>
                  <Select defaultValue="__new__" onValueChange={onSelectExistingClient}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder="New client..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__new__">New client...</SelectItem>
                      {existingClients.map((c) => (
                        <SelectItem key={c.clientSlug} value={c.clientSlug}>
                          {c.clientName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Client Name *</Label>
                  <Input
                    placeholder="e.g. Bison Mining Supplies"
                    className="h-9 text-sm"
                    {...register("clientName", { required: true })}
                    readOnly={existingClientVal !== "__new__"}
                  />
                  {errors.clientName && <p className="text-xs text-destructive">Required</p>}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Contact Person</Label>
                  <Input
                    placeholder="e.g. John Smith"
                    className="h-9 text-sm"
                    {...register("clientContact")}
                    readOnly={existingClientVal !== "__new__"}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Phone</Label>
                  <Input placeholder="+27 71 000 0000" className="h-9 text-sm" {...register("clientPhone")} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Email</Label>
                  <Input placeholder="client@example.com" className="h-9 text-sm" {...register("clientEmail")} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Project */}
          <Card className="shadow-sm">
            <CardContent className="p-6 space-y-4">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-primary">Project (Optional)</h2>
              <div className="space-y-1.5">
                <Label className="text-xs">Project Name</Label>
                <Input placeholder="e.g. bisonsupplies.co.za Monthly Services" className="h-9 text-sm" {...register("projectName")} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Project Summary</Label>
                <Textarea
                  placeholder="Brief description of services rendered..."
                  className="text-sm resize-none"
                  rows={3}
                  {...register("projectSummary")}
                />
              </div>
            </CardContent>
          </Card>

          {/* Line Items */}
          <Card className="shadow-sm">
            <CardContent className="p-6 space-y-4">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-primary">Line Items</h2>

              <div className="space-y-3">
                {/* Header row */}
                <div className="grid grid-cols-[1fr_100px_80px_90px_36px] gap-2 px-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Description</span>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground text-right">Unit Price</span>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground text-center">Qty</span>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground text-right">Total</span>
                  <span />
                </div>

                {fields.map((field, index) => {
                  const price = Number(watchedItems[index]?.unitPrice) || 0;
                  const qty = Number(watchedItems[index]?.quantity) || 1;
                  const lineTotal = price * qty;
                  return (
                    <div key={field.id} className="grid grid-cols-[1fr_100px_80px_90px_36px] gap-2 items-center">
                      <Input
                        placeholder="Description"
                        className="h-9 text-sm"
                        {...register(`items.${index}.description`, { required: true })}
                      />
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        className="h-9 text-sm text-right"
                        {...register(`items.${index}.unitPrice`, { valueAsNumber: true })}
                      />
                      <Input
                        type="number"
                        min="1"
                        placeholder="1"
                        className="h-9 text-sm text-center"
                        {...register(`items.${index}.quantity`, { valueAsNumber: true })}
                      />
                      <div className="h-9 flex items-center justify-end px-2 text-sm font-mono font-medium text-foreground bg-muted/40 rounded-md">
                        {formatCurrency(lineTotal)}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-9 w-9 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => remove(index)}
                        disabled={fields.length === 1}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  );
                })}
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs"
                onClick={() => append({ description: "", frequency: "Once Off", vat: "No VAT", unitPrice: 0, quantity: 1 })}
              >
                <Plus className="w-3.5 h-3.5" />
                Add Line Item
              </Button>
            </CardContent>
          </Card>

          {/* Payment Details */}
          <Card className="shadow-sm">
            <CardContent className="p-6 space-y-4">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-primary">Payment</h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Reference</Label>
                  <Input placeholder="e.g. BISON" className="h-9 text-sm" {...register("paymentReference")} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Discount %</Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    placeholder="0"
                    className="h-9 text-sm"
                    {...register("discountPercent", { valueAsNumber: true })}
                  />
                </div>
              </div>
              {(invoiceType === "monthly" || invoiceType === "annual") && (
                <div className="space-y-1.5">
                  <Label className="text-xs">PayFast Subscription URL (optional)</Label>
                  <Input placeholder="https://www.payfast.co.za/..." className="h-9 text-sm" {...register("paymentUrl")} />
                </div>
              )}
              <div className="space-y-1.5">
                <Label className="text-xs">Notes</Label>
                <Textarea
                  placeholder="Any additional notes for the client..."
                  className="text-sm resize-none"
                  rows={2}
                  {...register("notes")}
                />
              </div>
            </CardContent>
          </Card>

          {/* Totals + Submit */}
          <Card className="shadow-sm border-primary/20 bg-primary/[0.02]">
            <CardContent className="p-6">
              <div className="flex items-end justify-between gap-6">
                <div className="space-y-2 text-sm flex-1 max-w-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span className="font-mono">{formatCurrency(subtotal)}</span>
                  </div>
                  {Number(discountPercent) > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Discount ({discountPercent}%)</span>
                      <span className="font-mono text-emerald-600">-{formatCurrency(discountAmount)}</span>
                    </div>
                  )}
                  <Separator />
                  <div className="flex justify-between font-semibold">
                    <span>Total Due</span>
                    <span className="font-mono text-primary text-lg">{formatCurrency(amountDue)}</span>
                  </div>
                </div>
                <Button
                  type="submit"
                  size="lg"
                  className="gap-2 px-8"
                  disabled={create.isPending}
                >
                  {create.isPending ? "Creating..." : "Create Invoice"}
                </Button>
              </div>
            </CardContent>
          </Card>

        </div>
      </form>
    </div>
  );
}
