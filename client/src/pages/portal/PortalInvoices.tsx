import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, ExternalLink } from "lucide-react";
import { format } from "date-fns";

function formatCurrency(value: string | number | null | undefined) {
  if (value == null) return "R0.00";
  const num = typeof value === "string" ? parseFloat(value) : value;
  return `R${num.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-gray-100 text-gray-700 border-gray-200" },
  sent: { label: "Awaiting Payment", className: "bg-amber-50 text-amber-700 border-amber-200" },
  paid: { label: "Paid", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  overdue: { label: "Overdue", className: "bg-red-50 text-red-700 border-red-200" },
};

export default function PortalInvoices() {
  useAuth({ redirectOnUnauthenticated: true, redirectPath: "/login" });

  const { data: invoices = [], isLoading } = trpc.clientPortal.getInvoices.useQuery();

  const outstanding = invoices.filter(i => i.status === "sent" || i.status === "overdue");
  const totalDue = outstanding.reduce((sum, inv) => sum + parseFloat(String(inv.amountDue ?? 0)), 0);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Invoices</h1>
        <p className="text-sm text-muted-foreground mt-1">Your billing history and outstanding payments.</p>
      </div>

      {outstanding.length > 0 && (
        <Card className="shadow-sm border-amber-200 bg-amber-50/30">
          <CardContent className="p-5">
            <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">Outstanding Balance</p>
            <p className="text-3xl font-semibold text-amber-900">{formatCurrency(totalDue)}</p>
            <p className="text-xs text-amber-700 mt-1">{outstanding.length} invoice{outstanding.length !== 1 ? "s" : ""} awaiting payment</p>
          </CardContent>
        </Card>
      )}

      {invoices.length === 0 ? (
        <div className="text-center py-16">
          <FileText className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
          <h2 className="text-lg font-semibold">No invoices yet</h2>
          <p className="text-sm text-muted-foreground mt-1">Your invoices will appear here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {invoices.map(inv => {
            const config = STATUS_CONFIG[inv.status] ?? STATUS_CONFIG.sent;
            return (
              <Card key={inv.id} className="shadow-sm">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{inv.projectName || inv.invoiceNumber}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {inv.invoiceNumber} · {format(new Date(inv.invoiceDate), "d MMM yyyy")}
                      {inv.dueDate ? ` · Due ${format(new Date(inv.dueDate), "d MMM yyyy")}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <p className="text-sm font-semibold">{formatCurrency(inv.amountDue)}</p>
                    <Badge variant="outline" className={`text-[10px] ${config.className}`}>
                      {config.label}
                    </Badge>
                  </div>
                  {inv.paymentUrl && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 shrink-0"
                      onClick={() => window.open(inv.paymentUrl!, "_blank")}
                    >
                      Pay <ExternalLink className="ml-1.5 h-3 w-3" />
                    </Button>
                  )}
                  {inv.shareToken && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0 shrink-0"
                      title="View invoice"
                      onClick={() => window.open(`/i/${inv.shareToken}`, "_blank")}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
