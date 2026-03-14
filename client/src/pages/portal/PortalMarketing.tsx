import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Megaphone, ArrowRight } from "lucide-react";
import { useLocation } from "wouter";
import { format } from "date-fns";

const STATUS_LABELS: Record<string, string> = {
  discovery: "Discovery",
  strategy: "Strategy",
  generating: "Generating",
  approval: "Pending Approval",
  active: "Active",
  completed: "Completed",
};

const STATUS_COLORS: Record<string, string> = {
  discovery: "bg-gray-100 text-gray-700 border-gray-200",
  strategy: "bg-blue-50 text-blue-700 border-blue-200",
  generating: "bg-amber-50 text-amber-700 border-amber-200",
  approval: "bg-violet-50 text-violet-700 border-violet-200",
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  completed: "bg-gray-50 text-gray-500 border-gray-200",
};

export default function PortalMarketing() {
  useAuth({ redirectOnUnauthenticated: true, redirectPath: "/login" });
  const [, setLocation] = useLocation();

  const { data: campaigns = [], isLoading } = trpc.clientPortal.getCampaigns.useQuery();

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
        <h1 className="text-2xl font-semibold tracking-tight">Marketing</h1>
        <p className="text-sm text-muted-foreground mt-1">Your active and past campaigns.</p>
      </div>

      {campaigns.length === 0 ? (
        <div className="text-center py-16">
          <Megaphone className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
          <h2 className="text-lg font-semibold">No campaigns yet</h2>
          <p className="text-sm text-muted-foreground mt-1">Your campaigns will appear here once they're created.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.map(campaign => (
            <Card
              key={campaign.id}
              className="shadow-sm cursor-pointer hover:bg-muted/30 transition-colors"
              onClick={() => setLocation(`/portal/marketing/${campaign.id}`)}
            >
              <CardContent className="p-5 flex items-center gap-4">
                <div className="h-10 w-10 rounded-lg bg-violet-50 flex items-center justify-center shrink-0">
                  <Megaphone className="h-5 w-5 text-violet-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{campaign.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {campaign.startDate ? `Started ${format(new Date(campaign.startDate), "d MMM yyyy")}` : "Not started"}
                    {campaign.endDate ? ` · Ends ${format(new Date(campaign.endDate), "d MMM yyyy")}` : ""}
                  </p>
                </div>
                <Badge variant="outline" className={`text-[10px] shrink-0 ${STATUS_COLORS[campaign.status] ?? "bg-gray-100 text-gray-700 border-gray-200"}`}>
                  {STATUS_LABELS[campaign.status] ?? campaign.status}
                </Badge>
                <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
