import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Plus, FileText } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const STATUS_STYLES: Record<string, string> = {
  draft:     "bg-muted text-muted-foreground",
  sent:      "bg-blue-100 text-blue-700",
  paid:      "bg-emerald-100 text-emerald-700",
  overdue:   "bg-red-100 text-red-600",
};

function fmt(n: string | number) {
  return `R${Number(n).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function Invoices() {
  const { data: invoices, isLoading } = trpc.invoice.list.useQuery();

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Invoices</h1>
          {invoices && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {invoices.length} invoice{invoices.length !== 1 ? "s" : ""}
            </p>
          )}
        </div>
        <Link href="/invoice/new">
          <Button size="sm" className="gap-1.5 text-xs">
            <Plus className="w-3.5 h-3.5" />
            New Invoice
          </Button>
        </Link>
      </div>

      {isLoading ? (
        <Card className="shadow-sm animate-pulse">
          <CardContent className="p-4">
            <div className="space-y-3">
              {[1,2,3,4,5].map(i => <div key={i} className="h-10 bg-muted rounded" />)}
            </div>
          </CardContent>
        </Card>
      ) : invoices && invoices.length > 0 ? (
        <div className="rounded-lg border border-border overflow-hidden shadow-sm">
          <div className="grid grid-cols-[1fr_2fr_120px_140px_100px_32px] bg-muted/50 border-b border-border px-4 py-2.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">#</span>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Client</span>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Date</span>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground text-right">Amount</span>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Status</span>
            <span />
          </div>
          <div className="divide-y divide-border bg-background">
            {[...invoices].reverse().map((inv) => (
              <Link key={inv.id} href={`/client/${inv.clientSlug}/invoice/${inv.invoiceNumber}`}>
                <div className="grid grid-cols-[1fr_2fr_120px_140px_100px_32px] items-center px-4 py-3 hover:bg-muted/40 transition-colors cursor-pointer group">
                  <span className="text-xs font-mono text-muted-foreground">{inv.invoiceNumber}</span>
                  <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors truncate pr-4">{inv.clientName}</span>
                  <span className="text-xs text-muted-foreground">
                    {inv.invoiceDate ? new Date(inv.invoiceDate).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" }) : "–"}
                  </span>
                  <span className="text-sm font-mono font-semibold text-foreground text-right pr-4">{fmt(inv.totalAmount ?? 0)}</span>
                  <span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize ${STATUS_STYLES[inv.status ?? "draft"] ?? STATUS_STYLES.draft}`}>
                      {inv.status ?? "draft"}
                    </span>
                  </span>
                  <span className="text-[10px] font-mono text-muted-foreground justify-self-end">{inv.invoiceType === "once-off" ? "proj" : "sub"}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      ) : (
        <Card className="shadow-sm">
          <CardContent className="p-10 text-center">
            <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No invoices yet.</p>
            <Link href="/invoice/new">
              <Button size="sm" className="mt-4 gap-1.5 text-xs">
                <Plus className="w-3.5 h-3.5" />
                Create your first invoice
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
