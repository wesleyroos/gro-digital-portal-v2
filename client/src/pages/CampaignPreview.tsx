import { useState, useEffect, useRef } from "react";
import { useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Check, X, ImageIcon, Lock, TrendingUp, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Calendar, Heart, MessageCircle, Share2, Bookmark, Users, BarChart2, Instagram, Facebook, Mail } from "lucide-react";

function PlatformBadges({ hasIg, hasFb }: { hasIg: boolean; hasFb: boolean }) {
  if (!hasIg && !hasFb) return null;
  return (
    <div className="flex items-center gap-1">
      {hasIg && <span className="inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold bg-pink-100 text-pink-700">IG</span>}
      {hasFb && <span className="inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-100 text-blue-700">FB</span>}
    </div>
  );
}

function formatPostedDate(postedAt: string | Date | null | undefined, scheduledAt: string | Date | null | undefined) {
  const d = postedAt ? new Date(postedAt) : scheduledAt ? new Date(scheduledAt) : null;
  if (!d) return null;
  return { date: d, isPosted: !!postedAt };
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
  const [submittedPassword, setSubmittedPassword] = useState<string | null>(null);
  const [rejectingPostId, setRejectingPostId] = useState<number | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [selectedPostIdx, setSelectedPostIdx] = useState<number | null>(null);
  const navigablePostsRef = useRef<Array<{ id: number; status: string; imageUrl?: string | null; mediaType?: string | null; videoUrl?: string | null; caption?: string | null; hashtags?: string | null; scheduledAt?: string | number | Date | null; postedAt?: string | number | Date | null; theme?: string | null; instagramPostId?: string | null; facebookPostId?: string | null }>>([]);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    if (selectedPostIdx === null) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft")  setSelectedPostIdx(i => i !== null && i > 0 ? i - 1 : i);
      if (e.key === "ArrowRight") setSelectedPostIdx(i => i !== null && i < navigablePostsRef.current.length - 1 ? i + 1 : i);
      if (e.key === "Escape")     setSelectedPostIdx(null);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [selectedPostIdx]);

  const { data, isLoading, error, refetch } = trpc.campaign.getByShareToken.useQuery(
    { token, password: submittedPassword || undefined },
    { enabled: !!token && submittedPassword !== null, retry: false }
  );

  const { data: perfData } = trpc.campaign.post.getPerformanceByShareToken.useQuery(
    { token, password: submittedPassword || undefined },
    { enabled: !!token && submittedPassword !== null }
  );

  const rowByPostId = new Map((perfData?.rows ?? []).map(r => [r.post.id, r]));

  const approveMutation = trpc.campaign.post.approveByToken.useMutation({
    onSuccess: () => { toast.success("Post approved"); refetch(); },
    onError: () => toast.error("Failed to approve post"),
  });
  const rejectMutation = trpc.campaign.post.rejectByToken.useMutation({
    onSuccess: () => { toast.success("Post rejected"); setRejectingPostId(null); setRejectNote(""); refetch(); },
    onError: () => toast.error("Failed to reject post"),
  });

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
              type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="Enter password" autoFocus
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

  if (submittedPassword === null) return <PasswordGate token={token} onSubmit={pw => setSubmittedPassword(pw)} />;
  if (isLoading) return <div className="min-h-screen bg-slate-950 flex items-center justify-center"><span className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" /></div>;
  if (error?.data?.code === "NOT_FOUND" || !data) return <div className="min-h-screen bg-slate-950 flex items-center justify-center"><p className="text-slate-400 text-sm">This campaign link is no longer active.</p></div>;

  const { campaign, posts } = data;
  const draftPosts    = posts.filter(p => p.status === "draft");
  const upcomingPosts = posts.filter(p => p.status === "approved" || p.status === "scheduled");
  const postedPosts   = posts.filter(p => p.status === "posted");
  const navigablePosts = [...upcomingPosts, ...postedPosts, ...draftPosts];
  navigablePostsRef.current = navigablePosts;
  const selectedPost = selectedPostIdx !== null ? navigablePosts[selectedPostIdx] ?? null : null;
  const goToPrev = () => setSelectedPostIdx(i => i !== null && i > 0 ? i - 1 : i);
  const goToNext = () => setSelectedPostIdx(i => i !== null && i < navigablePosts.length - 1 ? i + 1 : i);

  return (
    <div className="min-h-screen bg-slate-50">

      {/* ── Reject modal ── */}
      {rejectingPostId && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl space-y-4">
            <h3 className="font-semibold text-base">Reject post</h3>
            <p className="text-sm text-muted-foreground">Please explain what you'd like the GRO Digital team to change. <span className="text-red-500 font-medium">Required.</span></p>
            <textarea value={rejectNote} onChange={e => setRejectNote(e.target.value)} placeholder="e.g. Wrong tone, please make it more playful..." rows={3} className={`w-full border rounded-xl px-3 py-2.5 text-sm resize-none outline-none focus:ring-2 focus:ring-red-400 ${!rejectNote.trim() ? "border-slate-200" : "border-slate-300"}`} />
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 rounded-xl" onClick={() => { setRejectingPostId(null); setRejectNote(""); }}>Cancel</Button>
              <Button className="flex-1 bg-red-600 hover:bg-red-700 text-white rounded-xl disabled:opacity-40 disabled:cursor-not-allowed" disabled={rejectMutation.isPending || !rejectNote.trim()}
                onClick={() => rejectMutation.mutate({ token, postId: rejectingPostId, password: submittedPassword, notes: rejectNote })}>
                Reject
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Post detail modal ── */}
      {selectedPost && selectedPostIdx !== null && (() => {
        const hasPrev = selectedPostIdx > 0;
        const hasNext = selectedPostIdx < navigablePosts.length - 1;
        return (
          <div
            className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
            onClick={() => setSelectedPostIdx(null)}
            onTouchStart={e => { touchStartX.current = e.touches[0].clientX; }}
            onTouchEnd={e => {
              if (touchStartX.current === null) return;
              const dx = e.changedTouches[0].clientX - touchStartX.current;
              touchStartX.current = null;
              if (dx > 50) goToPrev();
              else if (dx < -50) goToNext();
            }}
          >
            {/* Prev / Next arrows */}
            {hasPrev && (
              <button className="absolute left-3 top-1/2 -translate-y-1/2 z-10 bg-white/20 hover:bg-white/40 text-white rounded-full p-2 transition-colors" onClick={e => { e.stopPropagation(); goToPrev(); }}>
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}
            {hasNext && (
              <button className="absolute right-3 top-1/2 -translate-y-1/2 z-10 bg-white/20 hover:bg-white/40 text-white rounded-full p-2 transition-colors" onClick={e => { e.stopPropagation(); goToNext(); }}>
                <ChevronRight className="w-5 h-5" />
              </button>
            )}
            <div className="relative max-w-3xl w-full" onClick={e => e.stopPropagation()}>
              {selectedPost.mediaType === "video" && selectedPost.videoUrl
                ? <video src={selectedPost.videoUrl} className="w-full h-auto max-h-[90vh] object-contain rounded-xl" controls preload="metadata" />
                : selectedPost.imageUrl
                ? <img src={selectedPost.imageUrl} alt="" className="w-full h-auto max-h-[90vh] object-contain rounded-xl" />
                : <div className="w-64 h-64 flex items-center justify-center"><ImageIcon className="w-12 h-12 text-white/30" /></div>
              }
              <button className="absolute top-3 right-3 text-white/90 hover:text-white bg-black/40 hover:bg-black/60 rounded-full p-1.5 transition-colors" onClick={() => setSelectedPostIdx(null)}>
                <X className="w-4 h-4" />
              </button>
              <div className="absolute bottom-3 right-3 bg-black/50 rounded-full px-2 py-0.5">
                <p className="text-[10px] text-white/80">{selectedPostIdx + 1} / {navigablePosts.length}</p>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Header ── */}
      <header className="bg-slate-950 text-white">
        <div className="max-w-6xl mx-auto px-6 py-6 flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-violet-400 mb-2">GROdigital</p>
            <h1 className="text-2xl sm:text-3xl font-bold text-white leading-tight">{campaign.name}</h1>
            <p className="text-sm text-slate-400 mt-1 capitalize">{campaign.clientSlug}</p>
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0 pt-1">
            <Badge className="bg-violet-600/30 text-violet-300 border border-violet-500/30 capitalize text-xs">{campaign.status}</Badge>
            {draftPosts.length > 0 && <span className="text-xs text-amber-400 font-medium">{draftPosts.length} post{draftPosts.length !== 1 ? "s" : ""} awaiting approval</span>}
          </div>
        </div>
        {posts.length > 0 && (
          <div className="border-t border-white/10">
            <div className="max-w-6xl mx-auto px-6 py-4 grid grid-cols-4 gap-4">
              {[
                { label: "Total posts",   value: posts.length,         active: false },
                { label: "Need approval", value: draftPosts.length,    active: draftPosts.length > 0, accent: "text-amber-400" },
                { label: "Scheduled",     value: upcomingPosts.length, active: false },
                { label: "Published",     value: postedPosts.length,   active: false, accent: "text-emerald-400" },
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

      {/* ── Main content ── */}
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-10">

        {/* Needs approval */}
        {draftPosts.length > 0 && (
          <section>
            <div className="flex items-center gap-3 mb-5">
              <h2 className="text-base font-semibold text-slate-900">Needs your approval</h2>
              <span className="w-6 h-6 rounded-full bg-amber-500 text-white text-[11px] font-bold flex items-center justify-center leading-none">{draftPosts.length}</span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {draftPosts.map(post => (
                <div key={post.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm flex flex-col cursor-pointer hover:border-violet-300 hover:shadow-md transition-all group" onClick={() => setSelectedPostIdx(navigablePosts.findIndex(p => p.id === post.id))}>
                  <div className="aspect-square bg-slate-100 relative overflow-hidden">
                    {post.mediaType === "video" && post.videoUrl
                      ? <video src={post.videoUrl} className="w-full h-full object-contain" preload="metadata" />
                      : post.imageUrl
                      ? <img src={post.imageUrl} alt="" className="w-full h-full object-contain" />
                      : <div className="w-full h-full flex items-center justify-center"><ImageIcon className="w-8 h-8 text-slate-300" /></div>
                    }
                    {post.scheduledAt && (
                      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent px-3 py-2">
                        <p className="text-[11px] text-white/90 flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(post.scheduledAt).toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short" })}
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="p-4 flex-1">
                    <div className="flex items-center justify-between mb-1">
                      {post.theme && <p className="text-[10px] font-semibold text-violet-600 uppercase tracking-wider">{post.theme}</p>}
                      <PlatformBadges hasIg={data?.campaign.postToInstagram ?? true} hasFb={data?.campaign.postToFacebook ?? false} />
                    </div>
                    <p className="text-sm text-slate-700 leading-relaxed line-clamp-3">{post.caption}</p>
                    {post.hashtags && <p className="text-xs text-violet-500 mt-2 line-clamp-1">{post.hashtags}</p>}
                  </div>
                  <div className="flex border-t border-slate-100">
                    <button className="flex-1 flex items-center justify-center gap-1.5 py-3.5 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors" onClick={e => { e.stopPropagation(); setRejectingPostId(post.id); }}>
                      <X className="w-4 h-4" /> Reject
                    </button>
                    <div className="w-px bg-slate-100" />
                    <button className="flex-1 flex items-center justify-center gap-1.5 py-3.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 transition-colors" disabled={approveMutation.isPending}
                      onClick={e => { e.stopPropagation(); approveMutation.mutate({ token, postId: post.id, password: submittedPassword }); }}>
                      <Check className="w-4 h-4" /> Approve
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Coming up */}
        {upcomingPosts.length > 0 && (
          <section>
            <h2 className="text-base font-semibold text-slate-900 mb-5">Coming up</h2>
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {upcomingPosts.map(post => (
                <div key={post.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm cursor-pointer hover:border-violet-300 hover:shadow-md transition-all group" onClick={() => setSelectedPostIdx(navigablePosts.findIndex(p => p.id === post.id))}>
                  <div className="aspect-square bg-slate-100 relative overflow-hidden">
                    {post.mediaType === "video" && post.videoUrl ? <video src={post.videoUrl} className="w-full h-full object-contain" preload="metadata" />
                      : post.imageUrl ? <img src={post.imageUrl} alt="" className="w-full h-full object-contain" />
                      : <div className="w-full h-full flex items-center justify-center"><ImageIcon className="w-6 h-6 text-slate-300" /></div>}
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

        {/* Published */}
        {postedPosts.length > 0 && (
          <section>
            <h2 className="text-base font-semibold text-slate-900 mb-5">Published</h2>
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {postedPosts.map(post => {
                const row = rowByPostId.get(post.id);
                const ins = row?.insights;
                const dateInfo = formatPostedDate(post.postedAt, post.scheduledAt);
                return (
                  <div key={post.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm cursor-pointer hover:border-violet-300 hover:shadow-md transition-all group" onClick={() => setSelectedPostIdx(navigablePosts.findIndex(p => p.id === post.id))}>
                    <div className="aspect-square bg-slate-100 relative overflow-hidden">
                      {post.mediaType === "video" && post.videoUrl ? <video src={post.videoUrl} className="w-full h-full object-contain" preload="metadata" />
                        : post.imageUrl ? <img src={post.imageUrl} alt="" className="w-full h-full object-contain" />
                        : <div className="w-full h-full flex items-center justify-center"><ImageIcon className="w-6 h-6 text-slate-300" /></div>}
                      {ins && (
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                          <div className="text-center text-white">
                            <p className="text-base font-bold">{ins.reach.toLocaleString()}</p>
                            <p className="text-[10px] text-white/70">reach</p>
                          </div>
                          <div className="text-center text-white">
                            <p className="text-base font-bold">{ins.likes.toLocaleString()}</p>
                            <p className="text-[10px] text-white/70">{post.instagramPostId ? "likes" : "reactions"}</p>
                          </div>
                        </div>
                      )}
                      <div className="absolute top-2 right-2">
                        <Badge className="bg-violet-100 text-violet-700 text-[9px] px-1.5" variant="secondary">posted</Badge>
                      </div>
                    </div>
                    <div className="p-3">
                      <div className="flex items-center justify-between mb-1">
                        {dateInfo && (
                          <p className="text-[11px] text-slate-400">
                            {dateInfo.date.toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}
                          </p>
                        )}
                        <PlatformBadges hasIg={!!post.instagramPostId} hasFb={!!post.facebookPostId} />
                      </div>
                      <p className="text-xs text-slate-700 line-clamp-2 leading-relaxed">{post.caption}</p>
                      {ins && (
                        <p className="text-[10px] text-violet-600 mt-1.5 flex items-center gap-1 font-medium">
                          <BarChart2 className="w-3 h-3" />
                          {ins.reach > 0 ? `${ins.reach.toLocaleString()} reach · ` : ""}{ins.likes.toLocaleString()} {post.instagramPostId ? "likes" : "reactions"}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {draftPosts.length === 0 && upcomingPosts.length === 0 && postedPosts.length === 0 && (
          <div className="text-center py-20 text-slate-400">
            <Calendar className="w-10 h-10 mx-auto mb-4 opacity-30" />
            <p className="text-sm">No posts yet — the GRO Digital team is working on your content calendar.</p>
          </div>
        )}

        {/* Performance — always render; component hides itself if nothing to show */}
        <section>
          <h2 className="text-base font-semibold text-slate-900 mb-5 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-violet-600" /> Performance
          </h2>
          <PerformanceSection campaignId={campaign.id} token={token} password={submittedPassword} />
        </section>
      </div>

      <footer className="border-t border-slate-200 bg-white mt-8">
        <div className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
          <p className="text-[11px] text-slate-400">Powered by <span className="font-semibold text-slate-700">GROdigital</span></p>
          <p className="text-[11px] text-slate-400">grodigital.co.za</p>
        </div>
      </footer>
    </div>
  );
}

function PasswordGate({ token, onSubmit }: { token: string; onSubmit: (pw: string) => void }) {
  const [password, setPassword] = useState("");
  const { isLoading, error } = trpc.campaign.getByShareToken.useQuery({ token }, { retry: false, enabled: !!token });
  useEffect(() => { if (!isLoading && !error) onSubmit(""); }, [isLoading, error]);
  if (isLoading || !error) return <div className="min-h-screen bg-slate-950 flex items-center justify-center"><span className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" /></div>;
  if (error.data?.code !== "UNAUTHORIZED") return <div className="min-h-screen bg-slate-950 flex items-center justify-center"><p className="text-slate-400 text-sm">This campaign link is no longer active.</p></div>;
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-violet-400 mb-4">GROdigital</p>
          <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center mx-auto mb-4"><Lock className="w-5 h-5 text-white" /></div>
          <h1 className="text-xl font-bold text-white">Password protected</h1>
          <p className="text-sm text-slate-400 mt-1">Enter the password to access this campaign.</p>
        </div>
        <form onSubmit={e => { e.preventDefault(); onSubmit(password); }} className="space-y-3">
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter password" autoFocus
            className="w-full bg-white/10 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50" />
          <Button type="submit" className="w-full bg-violet-600 hover:bg-violet-500 text-white h-11 rounded-xl">Access campaign</Button>
        </form>
      </div>
    </div>
  );
}

function PerformanceSection({ campaignId: _campaignId, token, password }: { campaignId: number; token: string; password: string | null }) {
  const [perfSort, setPerfSort] = useState<{ key: string; dir: "desc" | "asc" }>({ key: "bestOverall", dir: "desc" });
  const [perfPlatform, setPerfPlatform] = useState<"all" | "ig" | "fb" | "email">("all");

  const { data: perfData, isLoading } = trpc.campaign.post.getPerformanceByShareToken.useQuery({ token, password: password || undefined }, { enabled: !!token });
  const { data: mailerRows } = trpc.campaign.mailer.getAnalyticsByShareToken.useQuery({ token }, { enabled: !!token });
  const { data: mailchimpData } = trpc.campaign.mailer.getMailchimpReportsByShareToken.useQuery({ token, password: password || undefined }, { enabled: !!token });

  const hasSentResendMailers = (mailerRows ?? []).some(r => r.mailer.status === 'sent');
  const hasMailchimpMailers = (mailchimpData?.campaigns.length ?? 0) > 0;
  const hasMailers = hasSentResendMailers || hasMailchimpMailers;

  // Auto-default to email tab if no social posts but there are mailers
  const effectivePlatform = perfPlatform === "all" && !perfData?.rows.length && hasMailers ? "email" : perfPlatform;

  if (isLoading) return <div className="flex justify-center py-8"><span className="w-5 h-5 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" /></div>;
  if (!perfData?.rows.length && !hasMailers) return null;

  function renderTabs() {
    return ([
      { key: "all",   label: "All platforms" },
      { key: "ig",    label: "Instagram", icon: <Instagram className="w-3 h-3" /> },
      { key: "fb",    label: "Facebook",  icon: <Facebook  className="w-3 h-3" /> },
      ...(hasMailers ? [{ key: "email", label: "Email", icon: <Mail className="w-3 h-3" /> }] : []),
    ] as const).map(opt => (
      <button key={opt.key} onClick={() => setPerfPlatform(opt.key as typeof perfPlatform)}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
          effectivePlatform === opt.key
            ? opt.key === 'ig'    ? 'bg-pink-500 text-white border-pink-500'
            : opt.key === 'fb'    ? 'bg-blue-600 text-white border-blue-600'
            : opt.key === 'email' ? 'bg-emerald-600 text-white border-emerald-600'
            : 'bg-slate-900 text-white border-slate-900'
            : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
        }`}>
        {'icon' in opt && opt.icon}
        {opt.label}
        {opt.key === 'ig' && <span className="opacity-70">{perfData?.rows.filter(r => r.post.instagramPostId).length ?? 0}</span>}
        {opt.key === 'fb' && <span className="opacity-70">{perfData?.rows.filter(r => r.post.facebookPostId).length ?? 0}</span>}
        {opt.key === 'email' && <span className="opacity-70">{hasSentResendMailers ? (mailerRows?.length ?? 0) : (mailchimpData?.campaigns.length ?? 0)}</span>}
      </button>
    ));
  }

  // ── Email tab ──
  if (effectivePlatform === 'email') {
    // Prefer Resend data; fall back to Mailchimp when no Resend rows exist
    if (hasSentResendMailers) {
      const rows = mailerRows ?? [];
      const sentRows = rows.filter(r => r.mailer.status === 'sent');
      const totalSent = sentRows.reduce((s, r) => s + r.sentCount, 0);
      const totalOpens = sentRows.reduce((s, r) => s + r.opens, 0);
      const totalClicks = sentRows.reduce((s, r) => s + r.clicks, 0);
      const avgOpenRate = totalSent > 0 ? ((totalOpens / totalSent) * 100).toFixed(1) : null;
      const avgClickRate = totalSent > 0 ? ((totalClicks / totalSent) * 100).toFixed(1) : null;
      return (
        <div className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">{renderTabs()}</div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[
              { label: 'Sent', value: totalSent > 0 ? totalSent.toLocaleString() : '—', color: 'text-slate-800' },
              { label: 'Opens', value: totalOpens.toLocaleString(), color: 'text-emerald-600' },
              { label: 'Open Rate', value: avgOpenRate ? `${avgOpenRate}%` : '—', color: 'text-emerald-600' },
              { label: 'Clicks', value: totalClicks.toLocaleString(), color: 'text-blue-600' },
              { label: 'Click Rate', value: avgClickRate ? `${avgClickRate}%` : '—', color: 'text-blue-600' },
            ].map(c => (
              <div key={c.label} className="bg-white rounded-2xl border border-slate-200 px-3 py-4 text-center shadow-sm">
                <p className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">{c.label}</p>
                <p className={`text-xl font-bold mt-1 ${c.color}`}>{c.value}</p>
              </div>
            ))}
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-400">Subject</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-400">Status</th>
                  <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-slate-400">Recipients</th>
                  <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-emerald-600">Opens</th>
                  <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-emerald-600">Open Rate</th>
                  <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-blue-600">Clicks</th>
                  <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-blue-600">Click Rate</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => {
                  const isSent = row.mailer.status === 'sent';
                  const openRate = row.sentCount > 0 ? ((row.opens / row.sentCount) * 100).toFixed(1) : null;
                  const clickRate = row.sentCount > 0 ? ((row.clicks / row.sentCount) * 100).toFixed(1) : null;
                  const schedDate = row.mailer.scheduledAt ? new Date(row.mailer.scheduledAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', timeZone: 'Africa/Johannesburg' }) : null;
                  const sentDate = row.mailer.sentAt ? new Date(row.mailer.sentAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Johannesburg' }) : null;
                  return (
                    <tr key={row.mailer.id} className={`border-b border-slate-50 last:border-0 ${isSent ? 'hover:bg-slate-50/60' : 'opacity-50'}`}>
                      <td className="px-4 py-3">
                        <p className="text-xs font-medium text-slate-800">{row.mailer.subject || '(No subject)'}</p>
                        {sentDate && <p className="text-[10px] text-slate-400 mt-0.5">Sent {sentDate}</p>}
                      </td>
                      <td className="px-4 py-3">
                        {isSent ? <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">Sent</span>
                          : row.mailer.status === 'scheduled' ? <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">Scheduled{schedDate ? ` ${schedDate}` : ''}</span>
                          : <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium">Draft</span>}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-xs text-slate-700">{isSent ? (row.sentCount > 0 ? row.sentCount.toLocaleString() : '—') : '—'}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-xs text-emerald-600 font-semibold">{isSent ? row.opens.toLocaleString() : '—'}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-xs text-emerald-600">{isSent ? (openRate ? `${openRate}%` : '—') : '—'}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-xs text-blue-600 font-semibold">{isSent ? row.clicks.toLocaleString() : '—'}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-xs text-blue-600">{isSent ? (clickRate ? `${clickRate}%` : '—') : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      );
    }

    // ── Mailchimp fallback ──
    const mcRows = mailchimpData?.campaigns ?? [];
    const totalSent = mcRows.reduce((s, r) => s + r.emailsSent, 0);
    const totalOpens = mcRows.reduce((s, r) => s + r.opens, 0);
    const totalClicks = mcRows.reduce((s, r) => s + r.clicks, 0);
    const avgOpenRate = totalSent > 0 ? ((totalOpens / totalSent) * 100).toFixed(1) : null;
    const avgClickRate = totalSent > 0 ? ((totalClicks / totalSent) * 100).toFixed(1) : null;
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 flex-wrap">{renderTabs()}</div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            { label: 'Sent', value: totalSent > 0 ? totalSent.toLocaleString() : '—', color: 'text-slate-800' },
            { label: 'Opens', value: totalOpens.toLocaleString(), color: 'text-emerald-600' },
            { label: 'Open Rate', value: avgOpenRate ? `${avgOpenRate}%` : '—', color: 'text-emerald-600' },
            { label: 'Clicks', value: totalClicks.toLocaleString(), color: 'text-blue-600' },
            { label: 'Click Rate', value: avgClickRate ? `${avgClickRate}%` : '—', color: 'text-blue-600' },
          ].map(c => (
            <div key={c.label} className="bg-white rounded-2xl border border-slate-200 px-3 py-4 text-center shadow-sm">
              <p className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">{c.label}</p>
              <p className={`text-xl font-bold mt-1 ${c.color}`}>{c.value}</p>
            </div>
          ))}
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-400">Subject</th>
                <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-slate-400">Sent</th>
                <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-emerald-600">Opens</th>
                <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-emerald-600">Open Rate</th>
                <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-blue-600">Clicks</th>
                <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-blue-600">Click Rate</th>
              </tr>
            </thead>
            <tbody>
              {mcRows.map(row => {
                const sentDate = row.sendTime ? new Date(row.sendTime).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }) : null;
                return (
                  <tr key={row.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                    <td className="px-4 py-3">
                      <p className="text-xs font-medium text-slate-800">{row.subject}</p>
                      {sentDate && <p className="text-[10px] text-slate-400 mt-0.5">Sent {sentDate}</p>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-xs text-slate-700">{row.emailsSent > 0 ? row.emailsSent.toLocaleString() : '—'}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-xs text-emerald-600 font-semibold">{row.opens.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-xs text-emerald-600">{row.openRate > 0 ? `${(row.openRate * 100).toFixed(1)}%` : '—'}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-xs text-blue-600 font-semibold">{row.clicks.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-xs text-blue-600">{row.clickRate > 0 ? `${(row.clickRate * 100).toFixed(1)}%` : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  const isFbView = effectivePlatform === 'fb';

  const METRICS = [
    { key: "reach",             label: isFbView ? "Reach (imp)" : "Reach",     color: "text-violet-600" },
    { key: "likes",             label: isFbView ? "Reactions"   : "Likes",     color: "text-pink-600"   },
    { key: "comments",          label: "Comments",                               color: "text-amber-600"  },
    { key: "shares",            label: "Shares",                                 color: "text-emerald-600"},
    { key: "saved",             label: isFbView ? "—"           : "Saves",     color: "text-indigo-600" },
    { key: "totalInteractions", label: "Interactions",                           color: "text-blue-600"   },
  ];

  if (!perfData?.rows.length) return <div className="flex items-center gap-2 flex-wrap">{renderTabs()}</div>;

  const filteredRows = perfData.rows
    .filter(row => {
      if (effectivePlatform === 'ig') return !!row.post.instagramPostId;
      if (effectivePlatform === 'fb') return !!row.post.facebookPostId;
      return true;
    })
    .map(row => {
      if (effectivePlatform === 'fb') {
        if (row.fbInsights) {
          const fb = row.fbInsights;
          return { ...row, insights: { reach: fb.reach, likes: fb.reactions, comments: fb.clicks, shares: fb.shares, saved: 0, totalInteractions: fb.reactions + fb.shares + fb.clicks } };
        }
        return { ...row, insights: { reach: 0, likes: 0, comments: 0, shares: 0, saved: 0, totalInteractions: 0 } };
      }
      return row;
    });

  if (!filteredRows.length) return null;

  const maxVals = Object.fromEntries(METRICS.map(m => [m.key, Math.max(1, ...filteredRows.map(r => (r.insights[m.key as keyof typeof r.insights] as number | null) ?? 0))]));
  const withScores = filteredRows.map(row => {
    const avg = METRICS.reduce((s, m) => { const val = (row.insights[m.key as keyof typeof row.insights] as number | null) ?? 0; return s + val / maxVals[m.key]; }, 0) / METRICS.length;
    return { ...row, bestOverall: Math.round(avg * 1000) / 10 };
  });
  const sorted = [...withScores].sort((a, b) => {
    const av = perfSort.key === "bestOverall" ? a.bestOverall : (a.insights[perfSort.key as keyof typeof a.insights] as number | null) ?? 0;
    const bv = perfSort.key === "bestOverall" ? b.bestOverall : (b.insights[perfSort.key as keyof typeof b.insights] as number | null) ?? 0;
    return perfSort.dir === "desc" ? bv - av : av - bv;
  });
  const totals = METRICS.map(m => ({ ...m, total: filteredRows.reduce((s, r) => s + ((r.insights[m.key as keyof typeof r.insights] as number | null) ?? 0), 0) }));
  const totalReach = filteredRows.reduce((s, r) => s + r.insights.reach, 0);
  const totalInteractions = filteredRows.reduce((s, r) => s + r.insights.totalInteractions, 0);
  const avgEngRate = totalReach > 0 ? ((totalInteractions / totalReach) * 100).toFixed(1) : null;

  function SortHeader({ metricKey, label }: { metricKey: string; label: string }) {
    const active = perfSort.key === metricKey;
    return (
      <th className={`px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider cursor-pointer select-none whitespace-nowrap ${active ? "text-foreground" : "text-muted-foreground"}`}
        onClick={() => setPerfSort(s => s.key === metricKey ? { key: metricKey, dir: s.dir === "desc" ? "asc" : "desc" } : { key: metricKey, dir: "desc" })}>
        <span className="inline-flex items-center justify-end gap-0.5">
          {label}
          {active ? (perfSort.dir === "desc" ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />) : <ChevronDown className="w-3 h-3 opacity-20" />}
        </span>
      </th>
    );
  }

  return (
    <div className="space-y-4">
      {/* Platform filter */}
      <div className="flex items-center gap-2 flex-wrap">
        {renderTabs()}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        {totals.map(m => (
          <div key={m.key} className="bg-white rounded-2xl border border-slate-200 px-3 py-4 text-center shadow-sm">
            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">{m.label}</p>
            <p className={`text-xl font-bold mt-1 ${m.color}`}>{m.label === '—' ? '—' : m.total.toLocaleString()}</p>
          </div>
        ))}
      </div>
      {avgEngRate && <p className="text-xs text-slate-400 text-center">Avg engagement rate: <span className="font-semibold text-slate-700">{avgEngRate}%</span></p>}

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
                      <div className="min-w-0">
                        <p className="text-[11px] line-clamp-1 text-slate-700 max-w-[120px]">{post.caption ?? "—"}</p>
                        <PlatformBadges hasIg={!!post.instagramPostId} hasFb={!!post.facebookPostId} />
                      </div>
                    </div>
                  </td>
                  <td className={`px-3 py-3 text-right tabular-nums text-[12px] ${perfSort.key === "bestOverall" ? "font-bold text-violet-600" : "text-slate-400"}`}>{row.bestOverall.toFixed(1)}</td>
                  {METRICS.map(m => {
                    const val = (ins[m.key as keyof typeof ins] as number | null) ?? 0;
                    return (
                      <td key={m.key} className={`px-3 py-3 text-right tabular-nums text-[12px] ${perfSort.key === m.key ? `font-bold ${m.color}` : "text-slate-700"}`}>
                        {m.label === '—' ? '—' : val.toLocaleString()}
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
