import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Megaphone, FileText, ArrowRight, CheckCircle2, AlertCircle, ReceiptText } from "lucide-react";
import { useLocation } from "wouter";
import { format } from "date-fns";

function formatCurrency(value: string | number | null | undefined) {
  if (value == null) return "R0.00";
  const num = typeof value === "string" ? parseFloat(value) : value;
  return `R${num.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function PortalDashboard() {
  const { user } = useAuth({ redirectOnUnauthenticated: true, redirectPath: "/login" });
  const [, setLocation] = useLocation();

  const { data: profile } = trpc.clientPortal.getProfile.useQuery();
  const { data: campaigns = [] } = trpc.clientPortal.getCampaigns.useQuery();
  const { data: invoices = [] } = trpc.clientPortal.getInvoices.useQuery();

  const activeCampaigns = campaigns.filter(c => c.status === "active" || c.status === "approval");
  const pendingInvoices = invoices.filter(i => i.status === "sent" || i.status === "overdue");
  const totalOutstanding = pendingInvoices.reduce((sum, inv) => sum + parseFloat(String(inv.amountDue ?? 0)), 0);

  const fullName = profile?.name ?? user?.name ?? "";
  const firstName = fullName.split(" ")[0] || "there";

  const today = new Date();

  return (
    <div className="max-w-3xl mx-auto space-y-8 pb-12">

      {/* Header */}
      <div className="flex items-end justify-between pt-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-[#3b8dc6] mb-1">Client Portal</p>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            Hello, {firstName}.
          </h1>
        </div>
        <p className="text-sm text-gray-400 font-medium pb-1">{format(today, "EEEE, d MMMM yyyy")}</p>
      </div>
      <hr className="border-gray-100" />

      {/* KPI strip */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm flex flex-col gap-1 border-l-[3px] border-l-[#3b8dc6]">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Active Campaigns</p>
          <p className="text-2xl font-bold text-gray-900 leading-none">{activeCampaigns.length}</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm flex flex-col gap-1 border-l-[3px] border-l-amber-400">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Outstanding</p>
          <p className="text-2xl font-bold text-gray-900 leading-none">{formatCurrency(totalOutstanding)}</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm flex flex-col gap-1 border-l-[3px] border-l-gray-300">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Total Invoices</p>
          <p className="text-2xl font-bold text-gray-900 leading-none">{invoices.length}</p>
        </div>
      </div>

      {/* Outstanding balance banner */}
      {totalOutstanding > 0 && (
        <div className="flex items-start gap-4 bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="mt-0.5 h-8 w-8 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
            <AlertCircle className="h-4 w-4 text-amber-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-900">You have an outstanding balance of {formatCurrency(totalOutstanding)}</p>
            <p className="text-xs text-amber-700 mt-0.5">
              {pendingInvoices.length} invoice{pendingInvoices.length !== 1 ? "s" : ""} awaiting payment.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="shrink-0 text-xs border-amber-300 text-amber-800 hover:bg-amber-100 hover:border-amber-400 bg-transparent"
            onClick={() => setLocation("/portal/invoices")}
          >
            View invoices <ArrowRight className="ml-1.5 h-3 w-3" />
          </Button>
        </div>
      )}

      {/* Campaigns section */}
      {campaigns.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Megaphone className="h-4 w-4 text-[#3b8dc6]" />
              <h2 className="text-sm font-bold uppercase tracking-widest text-gray-500">Marketing Campaigns</h2>
            </div>
            <Button variant="ghost" size="sm" className="text-xs h-7 text-[#3b8dc6] hover:text-[#3b8dc6] hover:bg-blue-50" onClick={() => setLocation("/portal/marketing")}>
              View all <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="space-y-2">
            {campaigns.slice(0, 3).map(campaign => (
              <div
                key={campaign.id}
                className={`bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm cursor-pointer hover:shadow-md transition-shadow flex border-l-[3px] ${
                  campaign.status === "active" ? "border-l-emerald-500" :
                  campaign.status === "approval" ? "border-l-violet-500" :
                  "border-l-gray-300"
                }`}
                onClick={() => setLocation(`/portal/marketing/${campaign.id}`)}
              >
                <div className="flex items-center gap-4 px-4 py-3.5 flex-1 min-w-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{campaign.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {campaign.startDate ? format(new Date(campaign.startDate), "d MMM yyyy") : "No start date"}
                    </p>
                  </div>
                  <Badge variant="outline" className={`text-[10px] shrink-0 font-semibold px-2 py-0.5 ${
                    campaign.status === "active" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                    campaign.status === "approval" ? "bg-violet-50 text-violet-700 border-violet-200" :
                    "bg-gray-100 text-gray-500 border-gray-200"
                  }`}>
                    {campaign.status === "approval" ? "Pending approval" : campaign.status}
                  </Badge>
                  <ArrowRight className="h-3.5 w-3.5 text-gray-300 shrink-0" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Invoices section */}
      {invoices.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <ReceiptText className="h-4 w-4 text-[#3b8dc6]" />
              <h2 className="text-sm font-bold uppercase tracking-widest text-gray-500">Recent Invoices</h2>
            </div>
            <Button variant="ghost" size="sm" className="text-xs h-7 text-[#3b8dc6] hover:text-[#3b8dc6] hover:bg-blue-50" onClick={() => setLocation("/portal/invoices")}>
              View all <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
            {invoices.slice(0, 4).map((inv, idx) => (
              <div
                key={inv.id}
                className={`flex items-center gap-4 px-4 py-3.5 border-l-[3px] ${
                  inv.status === "overdue" ? "border-l-red-400 bg-red-50/30" :
                  inv.status === "sent" ? "border-l-amber-400" :
                  "border-l-transparent"
                } ${idx !== 0 ? "border-t border-gray-50" : ""}`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{inv.projectName || inv.invoiceNumber}</p>
                  {inv.projectName && (
                    <p className="text-xs text-gray-400 mt-0.5">{inv.invoiceNumber}</p>
                  )}
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
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {campaigns.length === 0 && invoices.length === 0 && (
        <div className="text-center py-20">
          <div className="h-14 w-14 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="h-7 w-7 text-emerald-500" />
          </div>
          <h2 className="text-base font-semibold text-gray-900">You're all set up</h2>
          <p className="text-sm text-gray-400 mt-1 max-w-xs mx-auto">Your campaigns and invoices will appear here once they've been added.</p>
        </div>
      )}

    </div>
  );
}
