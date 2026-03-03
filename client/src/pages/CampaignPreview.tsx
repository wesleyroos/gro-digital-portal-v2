import { useState, useEffect } from "react";
import { useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Check, X, ImageIcon, Lock, TrendingUp, ChevronUp, ChevronDown, Calendar, Heart, MessageCircle, Share2, Bookmark, Users, BarChart2 } from "lucide-react";

function PlatformBadges({ hasIg, hasFb }: { hasIg: boolean; hasFb: boolean }) {
  if (!hasIg && !hasFb) return null;
  return (
    <div className="flex items-center gap-1">
      {hasIg && <span className="inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold bg-pink-100 text-pink-700">IG</span>}
      {hasFb && <span className="inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-100 text-blue-700">FB</span>}
    </div>
  );
}

const POST_STATUS_COLORS: Record<string, string> = {
  draft:     "bg-amber-100 text-amber-700",
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
  // null = not yet decided (show gate), string = decided (empty = no password, non-empty = password submitted)
  const [submittedPassword, setSubmittedPassword] = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [rejectingPostId, setRejectingPostId] = useState<number | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [selectedPost, setSelectedPost] = useState<{
    id: number; status: string; imageUrl?: string | null;
    mediaType?: string | null; videoUrl?: string | null;
    caption?: string | null; hashtags?: string | null;
    scheduledAt?: string | number | Date | null; theme?: string | null;
    instagramPostId?: string | null; facebookPostId?: string | null;
  } | null>(null);

  const { data, isLoading, error, refetch } = trpc.campaign.getByShareToken.useQuery(
    { token, password: submittedPassword || undefined },
    {
      enabled: !!token && submittedPassword !== null,
      retry: false,
    }
  );

  const { data: perfData } = trpc.campaign.post.getPerformance.useQuery(
    { campaignId: data?.campaign.id ?? 0 },
    { enabled: !!data?.campaign.id }
  );
  const insightsByPostId = new Map(perfData?.rows.map(r => [r.post.id, r.insights]) ?? []);

  const approveMutation = trpc.campaign.post.approveByToken.useMutation({
    onSuccess: () => { toast.success("Post approved"); refetch(); },
    onError: () => toast.error("Failed to approve post"),
  });
  const rejectMutation = trpc.campaign.post.rejectByToken.useMutation({
    onSuccess: () => { toast.success("Post rejected"); setRejectingPostId(null); setRejectNote(""); refetch(); },
    onError: () => toast.error("Failed to reject post"),
  });

  // If we got an UNAUTHORIZED after submitting a password, show wrong-password form
  if (submittedPassword !== null && submittedPassword !== "" && error?.data?.code === "UNAUTHORIZED") {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-violet-400 mb-4">GROdigital</p>
            <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center mx-auto mb-4">
              <Lock className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-bold text-white">Password protected</h1>
            <p className="text-sm text-slate-400 mt-1">Enter the password to access this campaign.</p>
          </div>
          <form onSubmit={e => { e.preventDefault(); setSubmittedPassword(password); }} className="space-y-3">
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter password"
              autoFocus
              className="w-full bg-white/10 border border-red-500/60 rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-red-400/50"
            />
            <p className="text-xs text-red-400">Incorrect password. Please try again.</p>
            <Button type="submit" className="w-full bg-violet-600 hover:bg-violet-500 text-white h-11 rounded-xl">
              Access campaign
            </Button>
          </form>
        </div>
      </div>
    );
  }

  if (submittedPassword === null) {
    return <PasswordGate token={token} onSubmit={pw => setSubmittedPassword(pw)} />;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <span className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error?.data?.code === "NOT_FOUND" || !data) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <p className="text-slate-400 text-sm">This campaign link is no longer active.</p>
      </div>
    );
  }

  const { campaign, posts } = data;
  const draftPosts     = posts.filter(p => p.status === "draft");
  const upcomingPosts  = posts.filter(p => p.status === "approved" || p.status === "scheduled");
  const postedPosts    = posts.filter(p => p.status === "posted");

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ── Lightbox ──────────────────────────────────────────────────────── */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            className="absolute top-4 right-4 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-full p-2 transition-colors"
            onClick={() => setLightboxUrl(null)}
          >
            <X className="w-5 h-5" />
          </button>
          <img
            src={lightboxUrl}
            alt="Full size"
            className="max-w-full max-h-full rounded-2xl shadow-2xl object-contain"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}

      {/* ── Reject note modal ─────────────────────────────────────────────── */}
      {rejectingPostId && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl space-y-4">
            <h3 className="font-semibold text-base">Reject post</h3>
            <p className="text-sm text-muted-foreground">Optional: leave a note for the GRO Digital team explaining what to change.</p>
            <textarea
              value={rejectNote}
              onChange={e => setRejectNote(e.target.value)}
              placeholder="e.g. Wrong tone, please make it more playful..."
              rows={3}
              className="w-full border rounded-xl px-3 py-2.5 text-sm resize-none outline-none focus:ring-2 focus:ring-red-400"
            />
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 rounded-xl" onClick={() => { setRejectingPostId(null); setRejectNote(""); }}>Cancel</Button>
              <Button
                className="flex-1 bg-red-600 hover:bg-red-700 text-white rounded-xl"
                disabled={rejectMutation.isPending}
                onClick={() => rejectMutation.mutate({ token, postId: rejectingPostId, password: submittedPassword, notes: rejectNote || undefined })}
              >
                Reject
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Post detail modal ─────────────────────────────────────────────── */}
      {selectedPost && (
        <div
          className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
          onClick={() => setSelectedPost(null)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            onClick={e => e.stopPropagation()}
          >
            <div className="relative shrink-0">
              {selectedPost.mediaType === "video" && selectedPost.videoUrl ? (
                <video src={selectedPost.videoUrl} className="w-full aspect-square object-cover" controls preload="metadata" />
              ) : selectedPost.imageUrl ? (
                <img src={selectedPost.imageUrl} alt="" className="w-full aspect-square object-cover" />
              ) : (
                <div className="w-full aspect-square bg-muted flex items-center justify-center">
                  <ImageIcon className="w-12 h-12 text-muted-foreground/30" />
                </div>
              )}
              <button
                className="absolute top-3 right-3 text-white/90 hover:text-white bg-black/40 hover:bg-black/60 rounded-full p-1.5 transition-colors"
                onClick={() => setSelectedPost(null)}
              >
                <X className="w-4 h-4" />
              </button>
              <div className="absolute top-3 left-3">
                <Badge className={`${POST_STATUS_COLORS[selectedPost.status]} text-[10px]`} variant="secondary">
                  {selectedPost.status}
                </Badge>
              </div>
            </div>
            <div className="p-4 overflow-y-auto space-y-3">
              {selectedPost.scheduledAt && (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Calendar className="w-3 h-3" />
                  {new Date(selectedPost.scheduledAt).toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                </p>
              )}
              {selectedPost.theme && (
                <p className="text-[10px] font-semibold text-violet-600 uppercase tracking-wider">{selectedPost.theme}</p>
              )}
              {selectedPost.caption && (
                <p className="text-sm leading-relaxed text-foreground">{selectedPost.caption}</p>
              )}
              {selectedPost.hashtags && (
                <p className="text-xs text-violet-500 leading-relaxed">{selectedPost.hashtags}</p>
              )}
              {selectedPost.status === "posted" && insightsByPostId.has(selectedPost.id) && (() => {
                const ins = insightsByPostId.get(selectedPost.id)!;
                const engRate = ins.reach > 0 ? ((ins.totalInteractions / ins.reach) * 100).toFixed(1) : null;
                return (
                  <div className="border-t pt-3 space-y-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                      <BarChart2 className="w-3 h-3" /> Performance
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: "Reach",       value: ins.reach,             icon: Users         },
                        { label: "Likes",        value: ins.likes,             icon: Heart         },
                        { label: "Comments",     value: ins.comments,          icon: MessageCircle },
                        { label: "Shares",       value: ins.shares,            icon: Share2        },
                        { label: "Saves",        value: ins.saved,             icon: Bookmark      },
                        { label: "Interactions", value: ins.totalInteractions, icon: TrendingUp    },
                      ].map(({ label, value, icon: Icon }) => (
                        <div key={label} className="bg-muted rounded-xl px-2 py-2.5 text-center">
                          <Icon className="w-3.5 h-3.5 mx-auto mb-0.5 text-muted-foreground" />
                          <p className="text-sm font-bold leading-none">{value.toLocaleString()}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">{label}</p>
                        </div>
                      ))}
                    </div>
                    {engRate && (
                      <p className="text-[11px] text-muted-foreground text-center">
                        Engagement rate: <span className="font-semibold text-foreground">{engRate}%</span>
                      </p>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <header className="bg-slate-950 text-white">
        <div className="max-w-6xl mx-auto px-6 py-6 flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-violet-400 mb-2">GROdigital</p>
            <h1 className="text-2xl sm:text-3xl font-bold text-white leading-tight">{campaign.name}</h1>
            <p className="text-sm text-slate-400 mt-1 capitalize">{campaign.clientSlug}</p>
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0 pt-1">
            <Badge className="bg-violet-600/30 text-violet-300 border border-violet-500/30 capitalize text-xs">
              {campaign.status}
            </Badge>
            {draftPosts.length > 0 && (
              <span className="text-xs text-amber-400 font-medium">
                {draftPosts.length} post{draftPosts.length !== 1 ? "s" : ""} awaiting approval
              </span>
            )}
          </div>
        </div>

        {/* Stats strip */}
        {posts.length > 0 && (
          <div className="border-t border-white/10">
            <div className="max-w-6xl mx-auto px-6 py-4 grid grid-cols-4 gap-4">
              {[
                { label: "Total posts",       value: posts.length,         active: false },
                { label: "Need approval",     value: draftPosts.length,    active: draftPosts.length > 0, accent: "text-amber-400" },
                { label: "Scheduled",         value: upcomingPosts.length, active: false },
                { label: "Published",         value: postedPosts.length,   active: false, accent: "text-emerald-400" },
              ].map(stat => (
                <div key={stat.label} className="text-center sm:text-left">
                  <p className={`text-xl sm:text-2xl font-bold ${stat.active && stat.accent ? stat.accent : "text-white"}`}>{stat.value}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </header>

      {/* ── Main content ──────────────────────────────────────────────────── */}
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-10">

        {/* ── Needs approval ──────────────────────────────────────────────── */}
        {draftPosts.length > 0 && (
          <section>
            <div className="flex items-center gap-3 mb-5">
              <h2 className="text-base font-semibold text-slate-900">Needs your approval</h2>
              <span className="w-6 h-6 rounded-full bg-amber-500 text-white text-[11px] font-bold flex items-center justify-center leading-none">{draftPosts.length}</span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {draftPosts.map(post => (
                <div key={post.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm flex flex-col">
                  {/* Media */}
                  <div className="aspect-square bg-slate-100 relative overflow-hidden">
                    {post.mediaType === "video" && post.videoUrl ? (
                      <video src={post.videoUrl} className="w-full h-full object-cover" controls preload="metadata" />
                    ) : post.imageUrl ? (
                      <img
                        src={post.imageUrl}
                        alt=""
                        className="w-full h-full object-cover cursor-zoom-in"
                        onClick={() => setLightboxUrl(post.imageUrl!)}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ImageIcon className="w-8 h-8 text-slate-300" />
                      </div>
                    )}
                    {post.scheduledAt && (
                      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent px-3 py-2">
                        <p className="text-[11px] text-white/90 flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(post.scheduledAt).toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short" })}
                        </p>
                      </div>
                    )}
                  </div>
                  {/* Content */}
                  <div className="p-4 flex-1">
                    <div className="flex items-center justify-between mb-1">
                      {post.theme && (
                        <p className="text-[10px] font-semibold text-violet-600 uppercase tracking-wider">{post.theme}</p>
                      )}
                      <PlatformBadges hasIg={data?.campaign.postToInstagram ?? true} hasFb={data?.campaign.postToFacebook ?? false} />
                    </div>
                    <p className="text-sm text-slate-700 leading-relaxed line-clamp-3">{post.caption}</p>
                    {post.hashtags && (
                      <p className="text-xs text-violet-500 mt-2 line-clamp-1">{post.hashtags}</p>
                    )}
                  </div>
                  {/* Actions */}
                  <div className="flex border-t border-slate-100">
                    <button
                      className="flex-1 flex items-center justify-center gap-1.5 py-3.5 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                      onClick={() => setRejectingPostId(post.id)}
                    >
                      <X className="w-4 h-4" /> Reject
                    </button>
                    <div className="w-px bg-slate-100" />
                    <button
                      className="flex-1 flex items-center justify-center gap-1.5 py-3.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 transition-colors"
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

        {/* ── Coming up ───────────────────────────────────────────────────── */}
        {upcomingPosts.length > 0 && (
          <section>
            <h2 className="text-base font-semibold text-slate-900 mb-5">Coming up</h2>
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {upcomingPosts.map(post => (
                <div
                  key={post.id}
                  className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm cursor-pointer hover:border-violet-300 hover:shadow-md transition-all group"
                  onClick={() => setSelectedPost(post)}
                >
                  <div className="aspect-square bg-slate-100 relative overflow-hidden">
                    {post.mediaType === "video" && post.videoUrl ? (
                      <video src={post.videoUrl} className="w-full h-full object-cover" preload="metadata" />
                    ) : post.imageUrl ? (
                      <img src={post.imageUrl} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ImageIcon className="w-6 h-6 text-slate-300" />
                      </div>
                    )}
                    <div className="absolute top-2 right-2">
                      <Badge className={`${POST_STATUS_COLORS[post.status]} text-[9px] px-1.5`} variant="secondary">{post.status}</Badge>
                    </div>
                  </div>
                  <div className="p-3">
                    <div className="flex items-center justify-between mb-1">
                      {post.scheduledAt && (
                        <p className="text-[11px] text-slate-400 flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(post.scheduledAt).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}
                        </p>
                      )}
                      <PlatformBadges hasIg={data?.campaign.postToInstagram ?? true} hasFb={data?.campaign.postToFacebook ?? false} />
                    </div>
                    <p className="text-xs text-slate-700 line-clamp-2 leading-relaxed">{post.caption}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Published ───────────────────────────────────────────────────── */}
        {postedPosts.length > 0 && (
          <section>
            <h2 className="text-base font-semibold text-slate-900 mb-5">Published</h2>
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {postedPosts.map(post => {
                const ins = insightsByPostId.get(post.id);
                return (
                  <div
                    key={post.id}
                    className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm cursor-pointer hover:border-violet-300 hover:shadow-md transition-all group"
                    onClick={() => setSelectedPost(post)}
                  >
                    <div className="aspect-square bg-slate-100 relative overflow-hidden">
                      {post.mediaType === "video" && post.videoUrl ? (
                        <video src={post.videoUrl} className="w-full h-full object-cover" preload="metadata" />
                      ) : post.imageUrl ? (
                        <img src={post.imageUrl} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <ImageIcon className="w-6 h-6 text-slate-300" />
                        </div>
                      )}
                      {/* Stats overlay on hover */}
                      {ins && (
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                          <div className="text-center text-white">
                            <p className="text-base font-bold">{ins.reach.toLocaleString()}</p>
                            <p className="text-[10px] text-white/70">reach</p>
                          </div>
                          <div className="text-center text-white">
                            <p className="text-base font-bold">{ins.likes.toLocaleString()}</p>
                            <p className="text-[10px] text-white/70">likes</p>
                          </div>
                        </div>
                      )}
                      <div className="absolute top-2 right-2">
                        <Badge className="bg-violet-100 text-violet-700 text-[9px] px-1.5" variant="secondary">posted</Badge>
                      </div>
                    </div>
                    <div className="p-3">
                      <div className="flex items-center justify-between mb-1">
                        {post.scheduledAt && (
                          <p className="text-[11px] text-slate-400">{new Date(post.scheduledAt).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}</p>
                        )}
                        <PlatformBadges hasIg={!!post.instagramPostId} hasFb={!!post.facebookPostId} />
                      </div>
                      <p className="text-xs text-slate-700 line-clamp-2 leading-relaxed">{post.caption}</p>
                      {ins && (
                        <p className="text-[10px] text-violet-600 mt-1.5 flex items-center gap-1 font-medium">
                          <BarChart2 className="w-3 h-3" />
                          {ins.reach.toLocaleString()} reach · {ins.likes.toLocaleString()} likes
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ── No posts yet ────────────────────────────────────────────────── */}
        {draftPosts.length === 0 && upcomingPosts.length === 0 && postedPosts.length === 0 && (
          <div className="text-center py-20 text-slate-400">
            <Calendar className="w-10 h-10 mx-auto mb-4 opacity-30" />
            <p className="text-sm">No posts yet — the GRO Digital team is working on your content calendar.</p>
          </div>
        )}

        {/* ── Performance ─────────────────────────────────────────────────── */}
        {postedPosts.length > 0 && (
          <section>
            <h2 className="text-base font-semibold text-slate-900 mb-5 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-violet-600" />
              Performance
            </h2>
            <PerformanceSection token={token} password={submittedPassword} campaignId={campaign.id} />
          </section>
        )}
      </div>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer className="border-t border-slate-200 bg-white mt-8">
        <div className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
          <p className="text-[11px] text-slate-400">Powered by <span className="font-semibold text-slate-700">GROdigital</span></p>
          <p className="text-[11px] text-slate-400">grodigital.co.za</p>
        </div>
      </footer>
    </div>
  );
}

// ── Password gate shown on first load ────────────────────────────────────────
function PasswordGate({ token, onSubmit }: { token: string; onSubmit: (pw: string) => void }) {
  const [password, setPassword] = useState("");

  const { isLoading, error } = trpc.campaign.getByShareToken.useQuery(
    { token },
    { retry: false, enabled: !!token }
  );

  useEffect(() => {
    if (!isLoading && !error) {
      onSubmit("");
    }
  }, [isLoading, error]);

  if (isLoading || !error) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <span className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error.data?.code !== "UNAUTHORIZED") {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <p className="text-slate-400 text-sm">This campaign link is no longer active.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-violet-400 mb-4">GROdigital</p>
          <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center mx-auto mb-4">
            <Lock className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-xl font-bold text-white">Password protected</h1>
          <p className="text-sm text-slate-400 mt-1">Enter the password to access this campaign.</p>
        </div>
        <form onSubmit={e => { e.preventDefault(); onSubmit(password); }} className="space-y-3">
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Enter password"
            autoFocus
            className="w-full bg-white/10 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50"
          />
          <Button type="submit" className="w-full bg-violet-600 hover:bg-violet-500 text-white h-11 rounded-xl">
            Access campaign
          </Button>
        </form>
      </div>
    </div>
  );
}

// ── Performance section ───────────────────────────────────────────────────────
function PerformanceSection({ token, password, campaignId }: { token: string; password: string | null | undefined; campaignId: number }) {
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
        className={`px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider cursor-pointer select-none whitespace-nowrap ${active ? "text-foreground" : "text-muted-foreground"}`}
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
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        {totals.map(m => (
          <div key={m.key} className="bg-white rounded-2xl border border-slate-200 px-3 py-4 text-center shadow-sm">
            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">{m.label}</p>
            <p className={`text-xl font-bold mt-1 ${m.color}`}>{m.total.toLocaleString()}</p>
          </div>
        ))}
      </div>
      {avgEngRate && (
        <p className="text-xs text-slate-400 text-center">
          Avg engagement rate: <span className="font-semibold text-slate-700">{avgEngRate}%</span>
        </p>
      )}

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden overflow-x-auto shadow-sm">
        <table className="w-full text-sm border-collapse min-w-[560px]">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-400 w-6">#</th>
              <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-400">Post</th>
              <SortHeader metricKey="bestOverall" label="Overall" />
              {METRICS.map(m => <SortHeader key={m.key} metricKey={m.key} label={m.label} />)}
              <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-slate-400">Eng.</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, idx) => {
              const { post, insights: ins } = row;
              const engRate = ins.reach > 0 ? ((ins.totalInteractions / ins.reach) * 100).toFixed(1) : null;
              return (
                <tr key={post.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60 transition-colors">
                  <td className="px-3 py-3 text-center">
                    <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold ${idx === 0 && sorted.length > 1 ? "bg-violet-600 text-white" : "text-slate-400"}`}>{idx + 1}</span>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg overflow-hidden bg-slate-100 shrink-0">
                        {post.imageUrl ? <img src={post.imageUrl} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><ImageIcon className="w-3 h-3 text-slate-300" /></div>}
                      </div>
                      <p className="text-[11px] line-clamp-1 text-slate-700 max-w-[120px]">{post.caption ?? "—"}</p>
                    </div>
                  </td>
                  <td className={`px-3 py-3 text-right tabular-nums text-[12px] ${perfSort.key === "bestOverall" ? "font-bold text-violet-600" : "text-slate-400"}`}>
                    {row.bestOverall.toFixed(1)}
                  </td>
                  {METRICS.map(m => {
                    const val = (ins[m.key as keyof typeof ins] as number | null) ?? 0;
                    return (
                      <td key={m.key} className={`px-3 py-3 text-right tabular-nums text-[12px] ${perfSort.key === m.key ? `font-bold ${m.color}` : "text-slate-700"}`}>
                        {val.toLocaleString()}
                      </td>
                    );
                  })}
                  <td className="px-3 py-3 text-right tabular-nums text-[12px] text-slate-400">{engRate ? `${engRate}%` : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
