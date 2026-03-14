import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ImageIcon, Mail, CheckCircle2, Clock, XCircle } from "lucide-react";
import { useLocation, useParams } from "wouter";
import { format } from "date-fns";
import { useState } from "react";

const POST_STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600 border-gray-200",
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
  scheduled: "bg-blue-50 text-blue-700 border-blue-200",
  posted: "bg-emerald-50 text-emerald-700 border-emerald-200",
  failed: "bg-red-50 text-red-700 border-red-200",
};

type Tab = "posts" | "mailers";

export default function PortalMarketingCampaign() {
  useAuth({ redirectOnUnauthenticated: true, redirectPath: "/login" });
  const [, setLocation] = useLocation();
  const params = useParams<{ id: string }>();
  const campaignId = parseInt(params.id ?? "0", 10);
  const [tab, setTab] = useState<Tab>("posts");

  const { data: campaign, isLoading } = trpc.clientPortal.getCampaign.useQuery({ id: campaignId });
  const { data: posts = [] } = trpc.clientPortal.getCampaignPosts.useQuery({ campaignId }, { enabled: !!campaign });
  const { data: mailers = [] } = trpc.clientPortal.getCampaignMailers.useQuery({ campaignId }, { enabled: !!campaign });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="h-32 bg-muted animate-pulse rounded-xl" />
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground">Campaign not found.</p>
        <Button variant="ghost" className="mt-4" onClick={() => setLocation("/portal/marketing")}>
          <ChevronLeft className="h-4 w-4 mr-1" /> Back to Marketing
        </Button>
      </div>
    );
  }

  const approvedPosts = posts.filter(p => p.status === "approved" || p.status === "posted");
  const pendingPosts = posts.filter(p => p.status === "draft");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => setLocation("/portal/marketing")}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-semibold tracking-tight truncate">{campaign.name}</h1>
          {campaign.startDate && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {format(new Date(campaign.startDate), "d MMM yyyy")}
              {campaign.endDate ? ` – ${format(new Date(campaign.endDate), "d MMM yyyy")}` : ""}
            </p>
          )}
        </div>
        <Badge variant="outline" className={`text-[10px] shrink-0 ${
          campaign.status === "active" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
          campaign.status === "approval" ? "bg-violet-50 text-violet-700 border-violet-200" :
          "bg-gray-100 text-gray-600 border-gray-200"
        }`}>
          {campaign.status}
        </Badge>
      </div>

      {/* Strategy summary */}
      {(campaign.strategy || campaign.targetAudience || campaign.brandVoice) && (
        <Card className="shadow-sm">
          <CardContent className="p-5 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Campaign Overview</p>
            {campaign.strategy && (
              <div>
                <p className="text-xs font-medium mb-1">Strategy</p>
                <p className="text-sm text-muted-foreground leading-relaxed">{campaign.strategy}</p>
              </div>
            )}
            {campaign.targetAudience && (
              <div>
                <p className="text-xs font-medium mb-1">Target Audience</p>
                <p className="text-sm text-muted-foreground leading-relaxed">{campaign.targetAudience}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Tab nav */}
      <div className="flex border-b border-border">
        {(["posts", "mailers"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "posts" ? `Social Posts (${posts.length})` : `Emails (${mailers.length})`}
          </button>
        ))}
      </div>

      {/* Posts tab */}
      {tab === "posts" && (
        <div className="space-y-4">
          {posts.length === 0 ? (
            <div className="text-center py-12">
              <ImageIcon className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No posts yet for this campaign.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {posts.map(post => (
                <Card key={post.id} className="shadow-sm overflow-hidden">
                  {post.imageUrl ? (
                    <div className="aspect-square overflow-hidden bg-muted">
                      <img src={post.imageUrl} alt="Post" className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <div className="aspect-square bg-muted flex items-center justify-center">
                      <ImageIcon className="h-8 w-8 text-muted-foreground/40" />
                    </div>
                  )}
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className={`text-[10px] ${POST_STATUS_COLORS[post.status] ?? ""}`}>
                        {post.status}
                      </Badge>
                      {post.scheduledAt && (
                        <p className="text-[10px] text-muted-foreground">
                          {format(new Date(post.scheduledAt), "d MMM")}
                        </p>
                      )}
                    </div>
                    {post.caption && (
                      <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">{post.caption}</p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Mailers tab */}
      {tab === "mailers" && (
        <div className="space-y-3">
          {mailers.length === 0 ? (
            <div className="text-center py-12">
              <Mail className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No email campaigns yet.</p>
            </div>
          ) : (
            mailers.map(mailer => (
              <Card key={mailer.id} className="shadow-sm">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                    <Mail className="h-4 w-4 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{mailer.subject || "Untitled email"}</p>
                    {mailer.previewText && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{mailer.previewText}</p>
                    )}
                  </div>
                  <Badge variant="outline" className={`text-[10px] shrink-0 ${
                    mailer.status === "sent" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                    mailer.status === "scheduled" ? "bg-blue-50 text-blue-700 border-blue-200" :
                    "bg-gray-100 text-gray-600 border-gray-200"
                  }`}>
                    {mailer.status}
                  </Badge>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}
