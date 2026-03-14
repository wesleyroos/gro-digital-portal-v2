import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Megaphone, FileText, ArrowRight, CheckCircle2 } from "lucide-react";
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

  const clientName = profile?.name ?? user?.name ?? "Your Portal";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Welcome back{profile?.name ? `, ${profile.name}` : ""}!</h1>
        <p className="text-sm text-muted-foreground mt-1">Here's a quick overview of your account.</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-violet-50 flex items-center justify-center shrink-0">
                <Megaphone className="h-5 w-5 text-violet-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Active Campaigns</p>
                <p className="text-2xl font-semibold leading-none mt-1">{activeCampaigns.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
                <FileText className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Outstanding Balance</p>
                <p className="text-2xl font-semibold leading-none mt-1">{formatCurrency(totalOutstanding)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent campaigns */}
      {campaigns.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold">Marketing Campaigns</h2>
            <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => setLocation("/portal/marketing")}>
              View all <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="space-y-2">
            {campaigns.slice(0, 3).map(campaign => (
              <Card key={campaign.id} className="shadow-sm cursor-pointer hover:bg-muted/30 transition-colors" onClick={() => setLocation(`/portal/marketing/${campaign.id}`)}>
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{campaign.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{campaign.startDate ? format(new Date(campaign.startDate), "d MMM yyyy") : "No start date"}</p>
                  </div>
                  <Badge variant="outline" className={`text-[10px] shrink-0 ${
                    campaign.status === "active" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                    campaign.status === "approval" ? "bg-violet-50 text-violet-700 border-violet-200" :
                    "bg-gray-100 text-gray-600 border-gray-200"
                  }`}>
                    {campaign.status}
                  </Badge>
                  <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Recent invoices */}
      {invoices.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold">Recent Invoices</h2>
            <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => setLocation("/portal/invoices")}>
              View all <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="space-y-2">
            {invoices.slice(0, 3).map(inv => (
              <Card key={inv.id} className="shadow-sm">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{inv.projectName || inv.invoiceNumber}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{inv.invoiceNumber}</p>
                  </div>
                  <p className="text-sm font-semibold shrink-0">{formatCurrency(inv.amountDue)}</p>
                  <Badge variant="outline" className={`text-[10px] shrink-0 ${
                    inv.status === "paid" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                    inv.status === "overdue" ? "bg-red-50 text-red-700 border-red-200" :
                    inv.status === "sent" ? "bg-amber-50 text-amber-700 border-amber-200" :
                    "bg-gray-100 text-gray-600 border-gray-200"
                  }`}>
                    {inv.status === "sent" ? "Awaiting payment" : inv.status}
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {campaigns.length === 0 && invoices.length === 0 && (
        <div className="text-center py-16">
          <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
          <h2 className="text-lg font-semibold">You're all set up!</h2>
          <p className="text-sm text-muted-foreground mt-1">Your campaigns and invoices will appear here.</p>
        </div>
      )}
    </div>
  );
}
