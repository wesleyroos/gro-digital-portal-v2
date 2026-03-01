import { useState } from "react";
import { useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Check, X, ImageIcon, Lock, TrendingUp, ChevronUp, ChevronDown, Calendar } from "lucide-react";

const POST_STATUS_COLORS: Record<string, string> = {
  draft:     "bg-gray-100 text-gray-600",
  approved:  "bg-emerald-100 text-emerald-700",
  rejected:  "bg-red-100 text-red-700",
  scheduled: "bg-blue-100 text-blue-700",
  posted:    "bg-violet-100 text-violet-700",
  failed:    "bg-red-100 text-red-600",
};

export default function CampaignPreview() {
  const [, params] = useRoute("/campaign/preview/:token");
  const token = params?.token ?? "";

  const [password, setPassword] = useState("");
  const [submittedPassword, setSubmittedPassword] = useState<string | undefined>(undefined);
  const [passwordError, setPasswordError] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [rejectingPostId, setRejectingPostId] = useState<number | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [perfSort, setPerfSort] = useState<{ key: string; dir: "desc" | "asc" }>({ key: "bestOverall", dir: "desc" });

  const { data, isLoading, error, refetch } = trpc.campaign.getByShareToken.useQuery(
    { token, password: submittedPassword },
    {
      enabled: !!token && submittedPassword !== undefined,
      retry: false,
    }
  );

  const approveMutation = trpc.campaign.post.approveByToken.useMutation({
    onSuccess: () => { toast.success("Post approved"); refetch(); },
    onError: () => toast.error("Failed to approve post"),
  });
  const rejectMutation = trpc.campaign.post.rejectByToken.useMutation({
    onSuccess: () => { toast.success("Post rejected"); setRejectingPostId(null); setRejectNote(""); refetch(); },
    onError: () => toast.error("Failed to reject post"),
  });

  // Password gate — show form until password submitted
  const needsPassword = error?.data?.code === "UNAUTHORIZED" || (submittedPassword === undefined && !data);

  function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError(false);
    setSubmittedPassword(password);
  }

  // If we got an UNAUTHORIZED after submitting, show error
  if (submittedPassword !== undefined && error?.data?.code === "UNAUTHORIZED") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-6">
            <div className="w-10 h-10 rounded-full bg-violet-100 flex items-center justify-center mx-auto mb-3">
              <Lock className="w-5 h-5 text-violet-600" />
            </div>
            <h1 className="text-lg font-bold">This page is password protected</h1>
            <p className="text-sm text-muted-foreground mt-1">Enter the password to access this campaign.</p>
          </div>
          <form onSubmit={e => { e.preventDefault(); setSubmittedPassword(password); }} className="space-y-3">
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter password"
              autoFocus
              className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-400 border-red-300 bg-red-50"
            />
            <p className="text-xs text-red-600">Incorrect password. Please try again.</p>
            <Button type="submit" className="w-full bg-violet-600 hover:bg-violet-700 text-white">Access campaign</Button>
          </form>
        </div>
      </div>
    );
  }

  if (submittedPassword === undefined) {
    // Check if we need a password at all — try a no-password query first
    return (
      <PasswordGate token={token} onSubmit={pw => setSubmittedPassword(pw)} />
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <span className="w-6 h-6 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error?.data?.code === "NOT_FOUND" || !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-muted-foreground text-sm">This campaign link is no longer active.</p>
      </div>
    );
  }

  const { campaign, posts } = data;
  const draftPosts     = posts.filter(p => p.status === "draft");
  const upcomingPosts  = posts.filter(p => p.status === "approved" || p.status === "scheduled");
  const postedPosts    = posts.filter(p => p.status === "posted");

  // ── Performance calc ──────────────────────────────────────────────────────
  const METRICS = [
    { key: "reach",             label: "Reach",        color: "text-violet-600" },
    { key: "likes",             label: "Likes",        color: "text-pink-600"   },
    { key: "comments",          label: "Comments",     color: "text-amber-600"  },
    { key: "shares",            label: "Shares",       color: "text-emerald-600"},
    { key: "saved",             label: "Saves",        color: "text-indigo-600" },
    { key: "totalInteractions", label: "Interactions", color: "text-blue-600"   },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            className="absolute top-4 right-4 text-white/80 hover:text-white bg-black/40 hover:bg-black/60 rounded-full p-2 transition-colors"
            onClick={() => setLightboxUrl(null)}
          >
            <X className="w-5 h-5" />
          </button>
          <img
            src={lightboxUrl}
            alt="Full size"
            className="max-w-full max-h-full rounded-xl shadow-2xl object-contain"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}

      {/* Reject note modal */}
      {rejectingPostId && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl space-y-4">
            <h3 className="font-semibold text-base">Reject post</h3>
            <p className="text-sm text-muted-foreground">Optional: leave a note for the GRO Digital team explaining what to change.</p>
            <textarea
              value={rejectNote}
              onChange={e => setRejectNote(e.target.value)}
              placeholder="e.g. Wrong tone, please make it more playful..."
              rows={3}
              className="w-full border rounded-lg px-3 py-2 text-sm resize-none outline-none focus:ring-2 focus:ring-red-400"
            />
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { setRejectingPostId(null); setRejectNote(""); }}>Cancel</Button>
              <Button
                className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                disabled={rejectMutation.isPending}
                onClick={() => rejectMutation.mutate({ token, postId: rejectingPostId, password: submittedPassword, notes: rejectNote || undefined })}
              >
                Reject
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-600 mb-0.5">GROdigital</p>
            <h1 className="text-base font-bold leading-tight">{campaign.name}</h1>
            <p className="text-xs text-muted-foreground">{campaign.clientSlug}</p>
          </div>
          <Badge variant="outline" className="capitalize text-xs shrink-0">
            {campaign.status}
          </Badge>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-8">

        {/* ── Needs approval ───────────────────────────────────────────── */}
        {draftPosts.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-sm font-semibold">Needs your approval</h2>
              <span className="w-5 h-5 rounded-full bg-violet-600 text-white text-[10px] font-bold flex items-center justify-center">{draftPosts.length}</span>
            </div>
            <div className="space-y-3">
              {draftPosts.map(post => (
                <div key={post.id} className="bg-white rounded-2xl border overflow-hidden">
                  <div className="flex gap-4 p-4">
                    {/* Image */}
                    <div className="w-24 h-24 rounded-xl overflow-hidden bg-muted shrink-0">
                      {post.imageUrl ? (
                        <img
                          src={post.imageUrl}
                          alt=""
                          className="w-full h-full object-cover cursor-zoom-in"
                          onClick={() => setLightboxUrl(post.imageUrl!)}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <ImageIcon className="w-6 h-6 text-muted-foreground/40" />
                        </div>
                      )}
                    </div>
                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      {post.scheduledAt && (
                        <p className="text-[11px] text-muted-foreground mb-1 flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(post.scheduledAt).toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
                        </p>
                      )}
                      <p className="text-sm leading-relaxed text-foreground">{post.caption}</p>
                      {post.hashtags && (
                        <p className="text-xs text-violet-600 mt-1.5 leading-relaxed">{post.hashtags}</p>
                      )}
                    </div>
                  </div>
                  {/* Actions */}
                  <div className="flex border-t">
                    <button
                      className="flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                      onClick={() => setRejectingPostId(post.id)}
                    >
                      <X className="w-4 h-4" /> Reject
                    </button>
                    <div className="w-px bg-border" />
                    <button
                      className="flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 transition-colors"
                      disabled={approveMutation.isPending}
                      onClick={() => approveMutation.mutate({ token, postId: post.id, password: submittedPassword })}
                    >
                      <Check className="w-4 h-4" /> Approve
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Coming up ─────────────────────────────────────────────────── */}
        {upcomingPosts.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold mb-3">Coming up</h2>
            <div className="space-y-2">
              {upcomingPosts.map(post => (
                <div key={post.id} className="bg-white rounded-2xl border flex gap-3 p-3">
                  <div className="w-14 h-14 rounded-lg overflow-hidden bg-muted shrink-0">
                    {post.imageUrl ? (
                      <img src={post.imageUrl} alt="" className="w-full h-full object-cover cursor-zoom-in" onClick={() => setLightboxUrl(post.imageUrl!)} />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center"><ImageIcon className="w-4 h-4 text-muted-foreground/40" /></div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    {post.scheduledAt && (
                      <p className="text-[11px] text-muted-foreground mb-0.5">
                        {new Date(post.scheduledAt).toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short" })}
                      </p>
                    )}
                    <p className="text-xs text-foreground line-clamp-2">{post.caption}</p>
                  </div>
                  <Badge className={`${POST_STATUS_COLORS[post.status]} self-start text-[10px] shrink-0`} variant="secondary">{post.status}</Badge>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── No posts yet ─────────────────────────────────────────────── */}
        {draftPosts.length === 0 && upcomingPosts.length === 0 && postedPosts.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <Calendar className="w-8 h-8 mx-auto mb-3 opacity-40" />
            <p className="text-sm">No posts yet — the GRO Digital team is working on your content calendar.</p>
          </div>
        )}

        {/* ── Performance ───────────────────────────────────────────────── */}
        {postedPosts.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-violet-600" />
              Performance
            </h2>
            <PerformanceSection token={token} password={submittedPassword} campaignId={campaign.id} />
          </section>
        )}
      </div>

      {/* Footer */}
      <div className="border-t bg-white mt-8">
        <div className="max-w-3xl mx-auto px-4 py-4 text-center">
          <p className="text-[11px] text-muted-foreground">Powered by <span className="font-semibold text-foreground">GROdigital</span> · grodigital.co.za</p>
        </div>
      </div>
    </div>
  );
}

// ── Password gate shown on first load ────────────────────────────────────────
function PasswordGate({ token, onSubmit }: { token: string; onSubmit: (pw: string | undefined) => void }) {
  const [password, setPassword] = useState("");

  // Try without a password first — if it works, no gate needed
  const { isLoading, error } = trpc.campaign.getByShareToken.useQuery(
    { token },
    { retry: false, enabled: !!token }
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <span className="w-6 h-6 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // No password needed — pass through with no password
  if (!error) {
    onSubmit(undefined);
    return null;
  }

  if (error.data?.code !== "UNAUTHORIZED") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-muted-foreground text-sm">This campaign link is no longer active.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="w-10 h-10 rounded-full bg-violet-100 flex items-center justify-center mx-auto mb-3">
            <Lock className="w-5 h-5 text-violet-600" />
          </div>
          <h1 className="text-lg font-bold">This page is password protected</h1>
          <p className="text-sm text-muted-foreground mt-1">Enter the password to access this campaign.</p>
        </div>
        <form onSubmit={e => { e.preventDefault(); onSubmit(password); }} className="space-y-3">
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Enter password"
            autoFocus
            className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-400"
          />
          <Button type="submit" className="w-full bg-violet-600 hover:bg-violet-700 text-white">
            Access campaign
          </Button>
        </form>
      </div>
    </div>
  );
}

// ── Performance section ───────────────────────────────────────────────────────
function PerformanceSection({ token, password, campaignId }: { token: string; password: string | undefined; campaignId: number }) {
  const [perfSort, setPerfSort] = useState<{ key: string; dir: "desc" | "asc" }>({ key: "bestOverall", dir: "desc" });

  const { data: perfData, isLoading } = trpc.campaign.post.getPerformance.useQuery({ campaignId });

  const METRICS = [
    { key: "reach",             label: "Reach",        color: "text-violet-600" },
    { key: "likes",             label: "Likes",        color: "text-pink-600"   },
    { key: "comments",          label: "Comments",     color: "text-amber-600"  },
    { key: "shares",            label: "Shares",       color: "text-emerald-600"},
    { key: "saved",             label: "Saves",        color: "text-indigo-600" },
    { key: "totalInteractions", label: "Interactions", color: "text-blue-600"   },
  ];

  if (isLoading) return <div className="flex justify-center py-8"><span className="w-5 h-5 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" /></div>;
  if (!perfData?.rows.length) return null;

  const maxVals = Object.fromEntries(
    METRICS.map(m => [m.key, Math.max(1, ...perfData.rows.map(r => (r.insights[m.key as keyof typeof r.insights] as number | null) ?? 0))])
  );
  const withScores = perfData.rows.map(row => {
    const avg = METRICS.reduce((s, m) => {
      const val = (row.insights[m.key as keyof typeof row.insights] as number | null) ?? 0;
      return s + val / maxVals[m.key];
    }, 0) / METRICS.length;
    return { ...row, bestOverall: Math.round(avg * 1000) / 10 };
  });
  const sorted = [...withScores].sort((a, b) => {
    const av = perfSort.key === "bestOverall" ? a.bestOverall : (a.insights[perfSort.key as keyof typeof a.insights] as number | null) ?? 0;
    const bv = perfSort.key === "bestOverall" ? b.bestOverall : (b.insights[perfSort.key as keyof typeof b.insights] as number | null) ?? 0;
    return perfSort.dir === "desc" ? bv - av : av - bv;
  });

  const totals = METRICS.map(m => ({ ...m, total: perfData.rows.reduce((s, r) => s + ((r.insights[m.key as keyof typeof r.insights] as number | null) ?? 0), 0) }));
  const totalReach = perfData.rows.reduce((s, r) => s + r.insights.reach, 0);
  const totalInteractions = perfData.rows.reduce((s, r) => s + r.insights.totalInteractions, 0);
  const avgEngRate = totalReach > 0 ? ((totalInteractions / totalReach) * 100).toFixed(1) : null;

  function SortHeader({ metricKey, label }: { metricKey: string; label: string }) {
    const active = perfSort.key === metricKey;
    return (
      <th
        className={`px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-wider cursor-pointer select-none whitespace-nowrap ${active ? "text-foreground" : "text-muted-foreground"}`}
        onClick={() => setPerfSort(s => s.key === metricKey ? { key: metricKey, dir: s.dir === "desc" ? "asc" : "desc" } : { key: metricKey, dir: "desc" })}
      >
        <span className="inline-flex items-center justify-end gap-0.5">
          {label}
          {active ? (perfSort.dir === "desc" ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />) : <ChevronDown className="w-3 h-3 opacity-20" />}
        </span>
      </th>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {totals.map(m => (
          <div key={m.key} className="bg-white rounded-xl border px-3 py-2.5 text-center">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{m.label}</p>
            <p className={`text-lg font-bold mt-0.5 ${m.color}`}>{m.total.toLocaleString()}</p>
          </div>
        ))}
      </div>
      {avgEngRate && (
        <p className="text-xs text-muted-foreground text-center">
          Avg engagement rate: <span className="font-semibold text-foreground">{avgEngRate}%</span>
        </p>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border overflow-hidden overflow-x-auto">
        <table className="w-full text-sm border-collapse min-w-[560px]">
          <thead>
            <tr className="bg-muted/50 border-b">
              <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground w-6">#</th>
              <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Post</th>
              <SortHeader metricKey="bestOverall" label="Overall" />
              {METRICS.map(m => <SortHeader key={m.key} metricKey={m.key} label={m.label} />)}
              <th className="px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Eng.</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, idx) => {
              const { post, insights: ins } = row;
              const engRate = ins.reach > 0 ? ((ins.totalInteractions / ins.reach) * 100).toFixed(1) : null;
              return (
                <tr key={post.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                  <td className="px-2 py-2.5 text-center">
                    <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold ${idx === 0 && sorted.length > 1 ? "bg-violet-600 text-white" : "text-muted-foreground"}`}>{idx + 1}</span>
                  </td>
                  <td className="px-2 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-md overflow-hidden bg-muted shrink-0">
                        {post.imageUrl ? <img src={post.imageUrl} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><ImageIcon className="w-3 h-3 text-muted-foreground/40" /></div>}
                      </div>
                      <p className="text-[11px] line-clamp-1 text-foreground max-w-[120px]">{post.caption ?? "—"}</p>
                    </div>
                  </td>
                  <td className={`px-2 py-2.5 text-right tabular-nums text-[12px] ${perfSort.key === "bestOverall" ? "font-bold text-violet-600" : "text-muted-foreground"}`}>
                    {row.bestOverall.toFixed(1)}
                  </td>
                  {METRICS.map(m => {
                    const val = (ins[m.key as keyof typeof ins] as number | null) ?? 0;
                    return (
                      <td key={m.key} className={`px-2 py-2.5 text-right tabular-nums text-[12px] ${perfSort.key === m.key ? `font-bold ${m.color}` : "text-foreground"}`}>
                        {val.toLocaleString()}
                      </td>
                    );
                  })}
                  <td className="px-2 py-2.5 text-right tabular-nums text-[12px] text-muted-foreground">{engRate ? `${engRate}%` : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
