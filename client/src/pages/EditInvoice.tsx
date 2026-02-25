import { useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useForm, useFieldArray, useWatch } from "react-hook-form";
import { useLocation, useParams, Link } from "wouter";
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
  clientName: string;
  clientSlug: string;
  clientContact: string;
  clientPhone: string;
  clientEmail: string;
  clientAddress: string;
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

function formatCurrency(n: number) {
  return `R${n.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function toDateInput(val: Date | string | null | undefined): string {
  if (!val) return "";
  const d = typeof val === "string" ? new Date(val) : val;
  return d.toISOString().split("T")[0];
}

export default function EditInvoice() {
  const params = useParams<{ invoiceNumber: string }>();
  const invoiceNumber = params.invoiceNumber || "";
  const [, navigate] = useLocation();

  const { data, isLoading } = trpc.invoice.getByNumber.useQuery({ invoiceNumber });

  const {
    register,
    control,
    handleSubmit,
    setValue,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    defaultValues: {
      clientName: "",
      clientSlug: "",
      clientContact: "",
      clientPhone: "",
      clientEmail: "",
      clientAddress: "",
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
  const invoiceType = useWatch({ control, name: "invoiceType" });

  // Pre-fill form once data loads
  useEffect(() => {
    if (!data) return;
    const { invoice, items } = data;
    reset({
      clientName: invoice.clientName,
      clientSlug: invoice.clientSlug,
      clientContact: invoice.clientContact || "",
      clientPhone: invoice.clientPhone || "",
      clientEmail: invoice.clientEmail || "",
      clientAddress: invoice.clientAddress || "",
      projectName: invoice.projectName || "",
      projectSummary: invoice.projectSummary || "",
      invoiceType: invoice.invoiceType as FormData["invoiceType"],
      status: invoice.status as FormData["status"],
      invoiceDate: toDateInput(invoice.invoiceDate),
      dueDate: toDateInput(invoice.dueDate),
      discountPercent: parseFloat(String(invoice.discountPercent)) || 0,
      paymentReference: invoice.paymentReference || "",
      paymentUrl: invoice.paymentUrl || "",
      notes: invoice.notes || "",
      items: items.map(i => ({
        description: i.description,
        frequency: i.frequency || "Once Off",
        vat: i.vat || "No VAT",
        unitPrice: parseFloat(String(i.unitPrice)) || 0,
        quantity: i.quantity || 1,
      })),
    });
  }, [data, reset]);

  const subtotal = watchedItems.reduce((sum, item) => {
    return sum + (Number(item.unitPrice) || 0) * (Number(item.quantity) || 1);
  }, 0);
  const discountAmount = subtotal * (Number(discountPercent) / 100);
  const totalAmount = subtotal - discountAmount;
  const amountDue = data?.invoice.status === "paid" ? 0 : totalAmount;

  const update = trpc.invoice.update.useMutation({
    onSuccess: () => {
      toast.success("Invoice updated");
      navigate(`/client/${data?.invoice.clientSlug}/invoice/${invoiceNumber}`);
    },
    onError: (e) => toast.error(e.message || "Failed to update invoice"),
  });

  function onSubmit(formData: FormData) {
    update.mutate({
      invoiceNumber,
      clientName: formData.clientName,
      clientSlug: formData.clientSlug,
      clientContact: formData.clientContact || null,
      clientPhone: formData.clientPhone || null,
      clientEmail: formData.clientEmail || null,
      projectName: formData.projectName || null,
      projectSummary: formData.projectSummary || null,
      invoiceType: formData.invoiceType,
      status: formData.status,
      subtotal,
      discountPercent: Number(discountPercent),
      discountAmount,
      totalAmount,
      amountDue,
      paymentTerms: "Due upon receipt",
      paymentReference: formData.paymentReference || null,
      paymentUrl: formData.paymentUrl || null,
      bankName: "FNB/RMB",
      accountHolder: "Gro Digital",
      accountNumber: "62842244725",
      accountType: "Gold Business Account",
      branchCode: "250655",
      notes: formData.notes || null,
      clientAddress: formData.clientAddress || null,
      invoiceDate: formData.invoiceDate,
      dueDate: formData.dueDate || null,
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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Invoice not found.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link
            href={`/client/${data.invoice.clientSlug}/invoice/${invoiceNumber}`}
            className="flex items-center gap-3 hover:opacity-80 transition-opacity"
          >
            <ChevronLeft className="w-4 h-4 text-muted-foreground" />
            <div className="w-9 h-9 bg-primary rounded-lg flex items-center justify-center shadow-sm">
              <span className="text-primary-foreground font-bold text-lg tracking-tighter">G</span>
            </div>
            <span className="font-semibold text-sm text-foreground tracking-tight">Gro Digital</span>
          </Link>
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-semibold text-foreground">Edit {invoiceNumber}</span>
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
                  <Label className="text-xs">Invoice Number</Label>
                  <Input value={invoiceNumber} readOnly className="h-9 text-sm bg-muted/40" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Invoice Date *</Label>
                  <Input type="date" className="h-9 text-sm" {...register("invoiceDate", { required: true })} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Type</Label>
                  <Select
                    value={invoiceType}
                    onValueChange={(v) => setValue("invoiceType", v as FormData["invoiceType"])}
                  >
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="once-off">Once-off</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="annual">Annual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Status</Label>
                  <Select
                    value={data.invoice.status}
                    onValueChange={(v) => setValue("status", v as FormData["status"])}
                  >
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
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
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Client Name *</Label>
                  <Input className="h-9 text-sm" {...register("clientName", { required: true })} />
                  {errors.clientName && <p className="text-xs text-destructive">Required</p>}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Contact Person</Label>
                  <Input className="h-9 text-sm" {...register("clientContact")} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Phone</Label>
                  <Input className="h-9 text-sm" {...register("clientPhone")} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Email</Label>
                  <Input className="h-9 text-sm" {...register("clientEmail")} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Billing Address</Label>
                <Textarea
                  className="text-sm resize-none"
                  rows={3}
                  {...register("clientAddress")}
                />
              </div>
            </CardContent>
          </Card>

          {/* Project */}
          <Card className="shadow-sm">
            <CardContent className="p-6 space-y-4">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-primary">Project (Optional)</h2>
              <div className="space-y-1.5">
                <Label className="text-xs">Project Name</Label>
                <Input className="h-9 text-sm" {...register("projectName")} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Project Summary</Label>
                <Textarea className="text-sm resize-none" rows={3} {...register("projectSummary")} />
              </div>
            </CardContent>
          </Card>

          {/* Line Items */}
          <Card className="shadow-sm">
            <CardContent className="p-6 space-y-4">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-primary">Line Items</h2>
              <div className="space-y-3">
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
                  return (
                    <div key={field.id} className="grid grid-cols-[1fr_100px_80px_90px_36px] gap-2 items-center">
                      <Input
                        placeholder="Description"
                        className="h-9 text-sm"
                        {...register(`items.${index}.description`, { required: true })}
                      />
                      <Input
                        type="number" step="0.01" min="0"
                        className="h-9 text-sm text-right"
                        {...register(`items.${index}.unitPrice`, { valueAsNumber: true })}
                      />
                      <Input
                        type="number" min="1"
                        className="h-9 text-sm text-center"
                        {...register(`items.${index}.quantity`, { valueAsNumber: true })}
                      />
                      <div className="h-9 flex items-center justify-end px-2 text-sm font-mono font-medium text-foreground bg-muted/40 rounded-md">
                        {formatCurrency(price * qty)}
                      </div>
                      <Button
                        type="button" variant="ghost" size="sm"
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
                type="button" variant="outline" size="sm" className="gap-1.5 text-xs"
                onClick={() => append({ description: "", frequency: "Once Off", vat: "No VAT", unitPrice: 0, quantity: 1 })}
              >
                <Plus className="w-3.5 h-3.5" />
                Add Line Item
              </Button>
            </CardContent>
          </Card>

          {/* Payment */}
          <Card className="shadow-sm">
            <CardContent className="p-6 space-y-4">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-primary">Payment</h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Reference</Label>
                  <Input className="h-9 text-sm" {...register("paymentReference")} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Discount %</Label>
                  <Input type="number" min="0" max="100" step="0.01" className="h-9 text-sm"
                    {...register("discountPercent", { valueAsNumber: true })} />
                </div>
              </div>
              {(invoiceType === "monthly" || invoiceType === "annual") && (
                <div className="space-y-1.5">
                  <Label className="text-xs">PayFast Subscription URL (optional)</Label>
                  <Input className="h-9 text-sm" {...register("paymentUrl")} />
                </div>
              )}
              <div className="space-y-1.5">
                <Label className="text-xs">Notes</Label>
                <Textarea className="text-sm resize-none" rows={2} {...register("notes")} />
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
                    <span>Total</span>
                    <span className="font-mono text-primary text-lg">{formatCurrency(totalAmount)}</span>
                  </div>
                </div>
                <Button type="submit" size="lg" className="gap-2 px-8" disabled={update.isPending}>
                  {update.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </CardContent>
          </Card>

        </div>
      </form>
    </div>
  );
}
