import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Plus, FileText, ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useState } from "react";

const STATUS_STYLES: Record<string, string> = {
  draft:   "bg-muted text-muted-foreground",
  sent:    "bg-blue-100 text-blue-700",
  paid:    "bg-emerald-100 text-emerald-700",
  overdue: "bg-red-100 text-red-600",
};

const TYPE_STYLES: Record<string, string> = {
  "once-off": "bg-violet-100 text-violet-700",
  "monthly":  "bg-sky-100 text-sky-700",
  "annual":   "bg-sky-100 text-sky-700",
};

type SortKey = "invoiceNumber" | "clientName" | "invoiceDate" | "totalAmount";
type SortDir = "asc" | "desc";

function fmt(n: string | number) {
  return `R${Number(n).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const STATUSES = ["all", "draft", "sent", "paid", "overdue"] as const;
const TYPES = ["all", "once-off", "monthly", "annual"] as const;

export default function Invoices() {
  const { data: invoices = [], isLoading } = trpc.invoice.list.useQuery();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("invoiceDate");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const filtered = invoices
    .filter(inv => statusFilter === "all" || inv.status === statusFilter)
    .filter(inv => typeFilter === "all" || inv.invoiceType === typeFilter)
    .sort((a, b) => {
      let cmp = 0;
      if (sortKey === "invoiceDate") {
        cmp = new Date(a.invoiceDate ?? 0).getTime() - new Date(b.invoiceDate ?? 0).getTime();
      } else if (sortKey === "totalAmount") {
        cmp = Number(a.totalAmount ?? 0) - Number(b.totalAmount ?? 0);
      } else if (sortKey === "clientName") {
        cmp = (a.clientName ?? "").localeCompare(b.clientName ?? "");
      } else if (sortKey === "invoiceNumber") {
        cmp = (a.invoiceNumber ?? "").localeCompare(b.invoiceNumber ?? "");
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ChevronsUpDown className="w-3 h-3 opacity-40" />;
    return sortDir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />;
  }

  function SortHeader({ col, label, className = "" }: { col: SortKey; label: string; className?: string }) {
    return (
      <button
        onClick={() => toggleSort(col)}
        className={`flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors ${className}`}
      >
        {label}<SortIcon col={col} />
      </button>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Invoices</h1>
          {!isLoading && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {filtered.length} of {invoices.length} invoice{invoices.length !== 1 ? "s" : ""}
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

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4 mb-5">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Status</span>
          <div className="flex items-center gap-1">
            {STATUSES.map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`text-[11px] px-2.5 py-1 rounded-full font-medium capitalize transition-colors ${
                  statusFilter === s
                    ? "bg-foreground text-background"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Type</span>
          <div className="flex items-center gap-1">
            {TYPES.map(t => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={`text-[11px] px-2.5 py-1 rounded-full font-medium capitalize transition-colors ${
                  typeFilter === t
                    ? "bg-foreground text-background"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {t === "all" ? "All" : t === "once-off" ? "Once-off" : t === "monthly" ? "Monthly" : "Annual"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {isLoading ? (
        <Card className="shadow-sm animate-pulse">
          <CardContent className="p-4">
            <div className="space-y-3">
              {[1,2,3,4,5].map(i => <div key={i} className="h-10 bg-muted rounded" />)}
            </div>
          </CardContent>
        </Card>
      ) : filtered.length > 0 ? (
        <div className="rounded-lg border border-border overflow-hidden shadow-sm">
          <div className="grid grid-cols-[1fr_2fr_130px_150px_110px_110px] bg-muted/50 border-b border-border px-4 py-2.5">
            <SortHeader col="invoiceNumber" label="#" />
            <SortHeader col="clientName" label="Client" />
            <SortHeader col="invoiceDate" label="Date" />
            <SortHeader col="totalAmount" label="Amount" className="justify-end" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Status</span>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Type</span>
          </div>
          <div className="divide-y divide-border bg-background">
            {filtered.map((inv) => (
              <Link key={inv.id} href={`/client/${inv.clientSlug}/invoice/${inv.invoiceNumber}`}>
                <div className="grid grid-cols-[1fr_2fr_130px_150px_110px_110px] items-center px-4 py-3 hover:bg-muted/40 transition-colors cursor-pointer group">
                  <span className="text-xs font-mono text-muted-foreground">{inv.invoiceNumber}</span>
                  <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors truncate pr-4">{inv.clientName}</span>
                  <span className="text-xs text-muted-foreground">
                    {inv.invoiceDate ? new Date(inv.invoiceDate).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" }) : "–"}
                  </span>
                  <span className="text-sm font-mono font-semibold text-foreground text-right pr-4">{fmt(inv.totalAmount ?? 0)}</span>
                  <span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize ${STATUS_STYLES[inv.status ?? "draft"]}`}>
                      {inv.status ?? "draft"}
                    </span>
                  </span>
                  <span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${TYPE_STYLES[inv.invoiceType ?? "monthly"]}`}>
                      {inv.invoiceType === "once-off" ? "Once-off" : inv.invoiceType === "annual" ? "Annual" : "Monthly"}
                    </span>
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      ) : (
        <Card className="shadow-sm">
          <CardContent className="p-10 text-center">
            <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              {invoices.length > 0 ? "No invoices match your filters." : "No invoices yet."}
            </p>
            {invoices.length === 0 && (
              <Link href="/invoice/new">
                <Button size="sm" className="mt-4 gap-1.5 text-xs">
                  <Plus className="w-3.5 h-3.5" />
                  Create your first invoice
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
