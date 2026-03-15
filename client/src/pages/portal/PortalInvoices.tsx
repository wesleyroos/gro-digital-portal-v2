import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, AlertCircle, ExternalLink, ReceiptText } from "lucide-react";
import { format } from "date-fns";

function formatCurrency(value: string | number | null | undefined) {
  if (value == null) return "R0.00";
  const num = typeof value === "string" ? parseFloat(value) : value;
  return `R${num.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function PortalInvoices() {
  useAuth({ redirectOnUnauthenticated: true, redirectPath: "/login" });

  const { data: invoices = [], isLoading } = trpc.clientPortal.getInvoices.useQuery();

  const outstanding = invoices.filter(i => i.status === "sent" || i.status === "overdue");
  const totalDue = outstanding.reduce((sum, inv) => sum + parseFloat(String(inv.amountDue ?? 0)), 0);
  const today = new Date();

  if (isLoading) {
    return (
      <div className="max-w-3xl space-y-4 pb-12">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-8 pb-12">

      {/* Header */}
      <div className="flex items-end justify-between pt-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-[#3b8dc6] mb-1">Billing</p>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Invoices</h1>
        </div>
        <p className="text-sm text-gray-400 font-medium pb-1">{format(today, "EEEE, d MMMM yyyy")}</p>
      </div>
      <hr className="border-gray-100" />

      {/* KPI strip */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm flex flex-col gap-1 border-l-[3px] border-l-gray-300">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Total Invoices</p>
          <p className="text-2xl font-bold text-gray-900 leading-none">{invoices.length}</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm flex flex-col gap-1 border-l-[3px] border-l-amber-400">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Outstanding</p>
          <p className="text-2xl font-bold text-gray-900 leading-none">{formatCurrency(totalDue)}</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm flex flex-col gap-1 border-l-[3px] border-l-emerald-400">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Paid</p>
          <p className="text-2xl font-bold text-gray-900 leading-none">{invoices.filter(i => i.status === "paid").length}</p>
        </div>
      </div>

      {/* Outstanding banner */}
      {totalDue > 0 && (
        <div className="flex items-start gap-4 bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="mt-0.5 h-8 w-8 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
            <AlertCircle className="h-4 w-4 text-amber-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-900">Outstanding balance of {formatCurrency(totalDue)}</p>
            <p className="text-xs text-amber-700 mt-0.5">
              {outstanding.length} invoice{outstanding.length !== 1 ? "s" : ""} awaiting payment.
            </p>
          </div>
        </div>
      )}

      {/* Invoice list */}
      {invoices.length === 0 ? (
        <div className="text-center py-20">
          <div className="h-14 w-14 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
            <FileText className="h-7 w-7 text-muted-foreground/40" />
          </div>
          <h2 className="text-base font-semibold text-gray-900">No invoices yet</h2>
          <p className="text-sm text-gray-400 mt-1 max-w-xs mx-auto">Your invoices will appear here once they've been added.</p>
        </div>
      ) : (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <ReceiptText className="h-4 w-4 text-[#3b8dc6]" />
            <h2 className="text-sm font-bold uppercase tracking-widest text-gray-500">All Invoices</h2>
          </div>
          <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
            {invoices.map((inv, idx) => (
              <div
                key={inv.id}
                className={`flex items-center gap-4 px-4 py-3.5 border-l-[3px] ${
                  inv.status === "overdue" ? "border-l-red-400 bg-red-50/30" :
                  inv.status === "sent" ? "border-l-amber-400" :
                  inv.status === "paid" ? "border-l-emerald-400" :
                  "border-l-transparent"
                } ${idx !== 0 ? "border-t border-gray-50" : ""}`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{inv.projectName || inv.invoiceNumber}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {inv.projectName ? `${inv.invoiceNumber} · ` : ""}
                    {format(new Date(inv.invoiceDate), "d MMM yyyy")}
                    {inv.dueDate ? ` · Due ${format(new Date(inv.dueDate), "d MMM yyyy")}` : ""}
                  </p>
                </div>
                <p className="text-sm font-bold text-gray-800 shrink-0 tabular-nums">{formatCurrency(inv.amountDue)}</p>
                <Badge variant="outline" className={`text-[10px] shrink-0 font-semibold px-2 py-0.5 ${
                  inv.status === "paid" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                  inv.status === "overdue" ? "bg-red-50 text-red-700 border-red-200" :
                  inv.status === "sent" ? "bg-amber-50 text-amber-700 border-amber-200" :
                  "bg-gray-100 text-gray-500 border-gray-200"
                }`}>
                  {inv.status === "sent" ? "Awaiting payment" : inv.status}
                </Badge>
                {inv.paymentUrl && (
                  <Button
                    size="sm"
                    className="h-8 shrink-0 bg-[#3b8dc6] hover:bg-[#3280b8] text-white text-xs"
                    onClick={() => window.open(inv.paymentUrl!, "_blank")}
                  >
                    Pay <ExternalLink className="ml-1.5 h-3 w-3" />
                  </Button>
                )}
                {inv.shareToken && !inv.paymentUrl && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0 shrink-0 text-gray-400 hover:text-gray-600"
                    title="View invoice"
                    onClick={() => window.open(`/i/${inv.shareToken}`, "_blank")}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
