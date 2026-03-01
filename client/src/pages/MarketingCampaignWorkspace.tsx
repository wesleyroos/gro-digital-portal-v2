import React, { useState, useRef, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Send, Bot, ImageIcon, Check, X, RefreshCw, ArrowLeft, Sparkles, CalendarDays, LayoutGrid, MessageSquare, Zap, Trash2, Download, Upload, Pencil, BarChart2, Heart, MessageCircle, Share2, Bookmark, UserCheck, Users, TrendingUp, ChevronUp, ChevronDown, Link, Copy, Lock, Eye, EyeOff } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import ReactMarkdown from "react-markdown";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";

type Message = { role: "user" | "assistant" | "tool"; content: string };

const STATUS_COLORS: Record<string, string> = {
  discovery: "bg-gray-100 text-gray-700 border-gray-200",
  strategy: "bg-blue-50 text-blue-700 border-blue-200",
  generating: "bg-amber-50 text-amber-700 border-amber-200",
  approval: "bg-violet-50 text-violet-700 border-violet-200",
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  completed: "bg-gray-50 text-gray-500 border-gray-200",
};

const POST_STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
  scheduled: "bg-blue-100 text-blue-700",
  posted: "bg-violet-100 text-violet-700",
  failed: "bg-red-100 text-red-600",
};

const POST_CALENDAR_COLORS: Record<string, string> = {
  posted: "#7c3aed",
  approved: "#8b5cf6",
  scheduled: "#6366f1",
  draft: "#9ca3af",
  rejected: "#ef4444",
  failed: "#ef4444",
};

export default function MarketingCampaignWorkspace() {
  const [, params] = useRoute("/marketing/:id");
  const [, setLocation] = useLocation();
  const campaignId = parseInt(params?.id ?? "0", 10);

  const { data, refetch, isLoading } = trpc.campaign.get.useQuery(
    { id: campaignId },
    { enabled: !!campaignId, refetchInterval: 5000 }
  );
  const campaign = data?.campaign;
  const posts = data?.posts ?? [];
  const messages = (data?.messages ?? []).filter(m => m.role === "user" || m.role === "assistant") as Message[];

  const { data: igStatus } = trpc.instagram.getStatus.useQuery(
    { clientSlug: campaign?.clientSlug ?? "" },
    { enabled: !!campaign?.clientSlug }
  );

  const [input, setInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [calendarGenerating, setCalendarGenerating] = useState(false);
  const [generatingPostIds, setGeneratingPostIds] = useState<Set<number>>(new Set());
  const [editingPostId, setEditingPostId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState({ caption: "", hashtags: "", imagePrompt: "" });
  const [localMessages, setLocalMessages] = useState<Message[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [analyticsPostId, setAnalyticsPostId] = useState<number | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [perfSort, setPerfSort] = useState<{ key: string; dir: "desc" | "asc" }>({ key: "bestOverall", dir: "desc" });
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [sharePasswordInput, setSharePasswordInput] = useState("");
  const [sharePasswordSaved, setSharePasswordSaved] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const analyticsPost = posts.find(p => p.id === analyticsPostId);
  const { data: insights, isLoading: insightsLoading, error: insightsError } = trpc.campaign.post.getInsights.useQuery(
    { postId: analyticsPostId ?? 0 },
    { enabled: !!analyticsPostId }
  );

  const { data: perfData, isLoading: perfLoading } = trpc.campaign.post.getPerformance.useQuery(
    { campaignId },
    { enabled: !!campaignId }
  );

  async function generateCalendar() {
    if (calendarGenerating) return;
    setCalendarGenerating(true);
    try {
      const res = await fetch(`/api/agent/campaign/${campaignId}/generate-calendar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error();
      const d = await res.json() as { count: number };
      toast.success(`${d.count} posts created — check the Content tab`);
      refetch();
    } catch {
      toast.error("Calendar generation failed. Please try again.");
    } finally {
      setCalendarGenerating(false);
    }
  }

  useEffect(() => {
    if (!historyLoaded && messages.length > 0) {
      setLocalMessages(messages);
      setHistoryLoaded(true);
    }
  }, [messages, historyLoaded]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [localMessages, chatLoading]);

  const approveMutation = trpc.campaign.post.approve.useMutation({
    onSuccess: () => refetch(),
    onError: () => toast.error("Failed to approve post"),
  });
  const rejectMutation = trpc.campaign.post.reject.useMutation({
    onSuccess: () => refetch(),
    onError: () => toast.error("Failed to reject post"),
  });
  const generateImageMutation = trpc.campaign.post.generateImage.useMutation({
    onMutate: ({ postId }) => setGeneratingPostIds(s => new Set(s).add(postId)),
    onSuccess: (_data, { postId }) => { setGeneratingPostIds(s => { const n = new Set(s); n.delete(postId); return n; }); toast.success("Image generated"); refetch(); },
    onError: (_e, { postId }) => { setGeneratingPostIds(s => { const n = new Set(s); n.delete(postId); return n; }); toast.error("Image generation failed"); },
  });
  const regenerateImageMutation = trpc.campaign.post.regenerateImage.useMutation({
    onMutate: ({ postId }) => setGeneratingPostIds(s => new Set(s).add(postId)),
    onSuccess: (_data, { postId }) => { setGeneratingPostIds(s => { const n = new Set(s); n.delete(postId); return n; }); toast.success("Image regenerated"); refetch(); },
    onError: (_e, { postId }) => { setGeneratingPostIds(s => { const n = new Set(s); n.delete(postId); return n; }); toast.error("Image regeneration failed"); },
  });
  const publishNowMutation = trpc.campaign.post.publishNow.useMutation({
    onSuccess: () => { toast.success("Posted to Instagram!"); refetch(); },
    onError: (e) => toast.error(`Post failed: ${e.message}`),
  });
  const approveAllMutation = trpc.campaign.post.approveAll.useMutation({
    onSuccess: () => { toast.success("All draft posts approved"); refetch(); },
    onError: () => toast.error("Failed to approve all"),
  });
  const updateStatusMutation = trpc.campaign.updateStatus.useMutation({
    onSuccess: () => { toast.success("Campaign activated"); refetch(); },
    onError: () => toast.error("Failed to activate campaign"),
  });
  const saveStrategyMutation = trpc.campaign.saveStrategy.useMutation({
    onSuccess: () => { toast.success("Strategy saved — you can now generate the calendar"); refetch(); },
    onError: () => toast.error("Failed to save strategy"),
  });
  const deleteMutation = trpc.campaign.delete.useMutation({
    onSuccess: () => { toast.success("Campaign deleted"); setLocation("/marketing"); },
    onError: () => toast.error("Failed to delete campaign"),
  });
  const generateShareLinkMutation = trpc.campaign.generateShareLink.useMutation({
    onSuccess: () => refetch(),
    onError: () => toast.error("Failed to generate link"),
  });
  const setSharePasswordMutation = trpc.campaign.setSharePassword.useMutation({
    onSuccess: () => { setSharePasswordSaved(true); refetch(); setTimeout(() => setSharePasswordSaved(false), 2000); },
    onError: () => toast.error("Failed to set password"),
  });
  const revokeShareLinkMutation = trpc.campaign.revokeShareLink.useMutation({
    onSuccess: () => { refetch(); setSharePasswordInput(""); },
    onError: () => toast.error("Failed to revoke link"),
  });
  const updateContentMutation = trpc.campaign.post.updateContent.useMutation({
    onSuccess: () => { toast.success("Post updated"); setEditingPostId(null); refetch(); },
    onError: () => toast.error("Failed to save changes"),
  });
  const uploadImageMutation = trpc.campaign.post.uploadImage.useMutation({
    onSuccess: () => { toast.success("Image uploaded"); refetch(); },
    onError: () => toast.error("Upload failed"),
  });
  const setImageModelMutation = trpc.campaign.setImageModel.useMutation({
    onSuccess: () => { toast.success("Image model updated"); refetch(); },
    onError: () => toast.error("Failed to update model"),
  });
  const setImageStyleMutation = trpc.campaign.setImageStyle.useMutation({
    onSuccess: () => { toast.success("Image style updated"); refetch(); },
    onError: () => toast.error("Failed to update style"),
  });
  const setImageAspectRatioMutation = trpc.campaign.setImageAspectRatio.useMutation({
    onSuccess: () => { toast.success("Aspect ratio updated"); refetch(); },
    onError: () => toast.error("Failed to update aspect ratio"),
  });
  const suggestPromptMutation = trpc.campaign.post.suggestImagePrompt.useMutation({
    onSuccess: ({ prompt }) => setEditDraft(d => ({ ...d, imagePrompt: prompt })),
    onError: () => toast.error("Failed to suggest prompt"),
  });

  async function downloadImage(url: string, postId: number) {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `post-${postId}.png`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      toast.error("Download failed");
    }
  }

  function handleFileUpload(postId: number, file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(",")[1];
      uploadImageMutation.mutate({ postId, base64, mimeType: file.type });
    };
    reader.readAsDataURL(file);
  }

  async function sendMessage(text?: string) {
    const msg = (text ?? input).trim();
    if (!msg || chatLoading) return;
    setInput("");
    if (textareaRef.current) { textareaRef.current.style.height = "auto"; }
    const newMsg: Message = { role: "user", content: msg };
    setLocalMessages(prev => [...prev, newMsg]);
    setChatLoading(true);
    try {
      const res = await fetch(`/api/agent/campaign/${campaignId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg }),
      });
      if (!res.ok) throw new Error();
      const d = await res.json() as { reply: string };
      setLocalMessages(prev => [...prev, { role: "assistant", content: d.reply }]);
      refetch();
    } catch {
      setLocalMessages(prev => [...prev, { role: "assistant", content: "Sorry, I'm having trouble connecting. Try again in a moment." }]);
    } finally {
      setChatLoading(false);
    }
  }

  function startDiscovery() {
    sendMessage("Hi! Let's get started on this campaign.");
  }

  const allPostsApproved = posts.length > 0 && posts.every(p => p.status === "approved" || p.status === "posted" || p.status === "scheduled");
  const hasDraftPosts = posts.some(p => p.status === "draft");

  const calendarEvents = posts
    .filter(p => p.scheduledAt)
    .map(p => ({
      title: p.theme ?? p.caption?.slice(0, 30) ?? "Post",
      date: new Date(p.scheduledAt!).toISOString().slice(0, 10),
      backgroundColor: POST_CALENDAR_COLORS[p.status] ?? "#9ca3af",
      borderColor: POST_CALENDAR_COLORS[p.status] ?? "#9ca3af",
      extendedProps: { postId: p.id, status: p.status },
    }));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="w-5 h-5 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="text-center py-20 text-muted-foreground">Campaign not found.</div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5 shrink-0">
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setLocation("/marketing")}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg font-bold tracking-tight leading-none">{campaign.name}</h1>
            <Badge variant="outline" className={`text-[10px] px-2 py-0.5 font-medium ${STATUS_COLORS[campaign.status] ?? ""}`}>
              {campaign.status}
            </Badge>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-xs text-muted-foreground">{campaign.clientSlug}</p>
            {igStatus?.connected ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                IG @{igStatus.username}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                Instagram not connected
              </span>
            )}
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className={`h-8 px-2.5 gap-1.5 text-xs font-medium ${campaign.shareToken ? "text-violet-600 hover:text-violet-700 hover:bg-violet-50" : "text-muted-foreground hover:text-foreground"}`}
          onClick={() => setShowShareDialog(true)}
        >
          <Link className="w-3.5 h-3.5" />
          {campaign.shareToken ? "Shared" : "Share"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 text-muted-foreground hover:text-red-600 hover:bg-red-50"
          onClick={() => setShowDeleteConfirm(true)}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="chat" className="flex-1 flex flex-col min-h-0">
        <TabsList className="shrink-0 mb-4">
          <TabsTrigger value="chat" className="gap-1.5">
            <MessageSquare className="w-3.5 h-3.5" />
            Chat / Strategy
          </TabsTrigger>
          <TabsTrigger value="content" className="gap-1.5">
            <LayoutGrid className="w-3.5 h-3.5" />
            Content
            {posts.length > 0 && <span className="ml-1 text-[10px] bg-muted rounded-full px-1.5">{posts.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="calendar" className="gap-1.5">
            <CalendarDays className="w-3.5 h-3.5" />
            Calendar
          </TabsTrigger>
          <TabsTrigger value="performance" className="gap-1.5">
            <TrendingUp className="w-3.5 h-3.5" />
            Performance
          </TabsTrigger>
        </TabsList>

        {/* ── Chat / Strategy Tab ───────────────────────────────────────── */}
        <TabsContent value="chat" className="flex-1 flex flex-col min-h-0 mt-0">
          {/* Generate calendar banner — shown whenever posts haven't been created yet */}
          {posts.length === 0 && localMessages.length > 0 && (
            <div className="shrink-0 mb-3 flex items-center justify-between gap-3 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3">
              <p className="text-sm text-violet-800">
                {campaign.status === "approval" || campaign.status === "active"
                  ? "Posts are ready — switch to the Content tab."
                  : calendarGenerating
                  ? "Generating your content calendar…"
                  : campaign.strategy
                  ? "Strategy is ready. Generate the content calendar when you're happy."
                  : "When the strategy chat is done, mark it as ready to unlock the calendar."}
              </p>
              <div className="flex items-center gap-2 shrink-0">
                {!campaign.strategy && !calendarGenerating && (campaign.status === "discovery" || campaign.status === "strategy") && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-violet-300 text-violet-700 hover:bg-violet-100 gap-1.5"
                    onClick={() => {
                      const lastAssistant = [...localMessages].reverse().find(m => m.role === "assistant");
                      const strategyText = lastAssistant?.content ?? localMessages.map(m => `${m.role}: ${m.content}`).join("\n\n");
                      saveStrategyMutation.mutate({ id: campaignId, strategy: strategyText });
                    }}
                    disabled={saveStrategyMutation.isPending}
                  >
                    {saveStrategyMutation.isPending ? (
                      <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Check className="w-3.5 h-3.5" />
                    )}
                    Strategy Ready
                  </Button>
                )}
                {(campaign.status === "discovery" || campaign.status === "strategy") && (
                  <Button
                    size="sm"
                    className="bg-violet-600 hover:bg-violet-700 text-white gap-1.5 disabled:opacity-40"
                    onClick={generateCalendar}
                    disabled={calendarGenerating || chatLoading || !campaign.strategy}
                    title={!campaign.strategy ? "Mark strategy as ready first" : undefined}
                  >
                    {calendarGenerating ? (
                      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5" />
                    )}
                    {calendarGenerating ? "Generating…" : "Generate Calendar"}
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Strategy summary card — only shown once strategy is saved */}
          {campaign.strategy && (
            <div className="shrink-0 mb-4 rounded-xl border bg-violet-50 border-violet-200 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-violet-600 mb-1.5">Strategy</p>
              <p className="text-sm text-foreground whitespace-pre-wrap line-clamp-4">{campaign.strategy}</p>
            </div>
          )}

          {/* Chat area */}
          <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pr-1 pb-4">
            {localMessages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center gap-5 py-8">
                <div className="w-16 h-16 rounded-2xl bg-violet-500/10 flex items-center justify-center">
                  <Bot className="w-8 h-8 text-violet-600" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">Campaign Agent</p>
                  <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                    I'll guide you through strategy discovery, content planning, and launch.
                  </p>
                </div>
                <Button
                  onClick={startDiscovery}
                  className="bg-violet-600 hover:bg-violet-700 text-white gap-2"
                >
                  <Sparkles className="w-4 h-4" />
                  Start Discovery
                </Button>
              </div>
            ) : (
              localMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  {msg.role === "assistant" && (
                    <div className="w-7 h-7 rounded-full bg-violet-500/10 flex items-center justify-center shrink-0 mt-0.5 mr-2">
                      <Bot className="w-3.5 h-3.5 text-violet-600" />
                    </div>
                  )}
                  <div
                    className={`max-w-[75%] min-w-0 px-4 py-3 rounded-2xl text-sm leading-relaxed break-words ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground rounded-br-sm whitespace-pre-wrap"
                        : "bg-card border border-border text-foreground rounded-bl-sm shadow-sm"
                    }`}
                  >
                    {msg.role === "user" ? msg.content : (
                      <ReactMarkdown className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0 prose-headings:my-2">
                        {msg.content}
                      </ReactMarkdown>
                    )}
                  </div>
                </div>
              ))
            )}
            {chatLoading && (
              <div className="flex justify-start">
                <div className="w-7 h-7 rounded-full bg-violet-500/10 flex items-center justify-center shrink-0 mt-0.5 mr-2">
                  <Bot className="w-3.5 h-3.5 text-violet-600" />
                </div>
                <div className="bg-card border border-border rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:0ms]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:150ms]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Chat input */}
          <div className="shrink-0 pt-4 border-t border-border">
            <div className="flex items-end gap-2">
              <textarea
                ref={textareaRef}
                className="flex-1 min-h-[40px] max-h-[160px] resize-none overflow-y-auto text-sm rounded-2xl bg-muted border-0 px-4 py-2.5 focus:outline-none focus:ring-1 focus:ring-violet-400 leading-relaxed"
                placeholder="Message the campaign agent..."
                value={input}
                rows={1}
                onChange={e => {
                  setInput(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
                }}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                disabled={chatLoading}
              />
              <Button
                size="sm"
                className="h-10 w-10 p-0 rounded-full shrink-0 bg-violet-600 hover:bg-violet-700 mb-0"
                onClick={() => sendMessage()}
                disabled={!input.trim() || chatLoading}
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* ── Content Tab ──────────────────────────────────────────────── */}
        <TabsContent value="content" className="flex-1 overflow-y-auto mt-0">
          {posts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
              <LayoutGrid className="w-8 h-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">No posts yet. The content calendar will appear here once generated by the agent.</p>
            </div>
          ) : (
            <>
              {/* Bulk action bar */}
              <div className="flex items-center gap-2 mb-4 flex-wrap">
                {hasDraftPosts && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => approveAllMutation.mutate({ campaignId })}
                    disabled={approveAllMutation.isPending}
                    className="gap-1.5"
                  >
                    <Check className="w-3.5 h-3.5" />
                    Approve All Drafts
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const draftsWithImages = posts.filter(p => p.status === "draft" && !p.imageUrl);
                    if (draftsWithImages.length === 0) { toast.info("No posts need images"); return; }
                    draftsWithImages.forEach(p => generateImageMutation.mutate({ postId: p.id }));
                    toast.info(`Generating images for ${draftsWithImages.length} posts...`);
                  }}
                  className="gap-1.5"
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  Generate All Images
                </Button>
                {/* Image style + model + aspect ratio selectors */}
                <div className="flex items-center gap-3 ml-auto flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-muted-foreground font-medium">Ratio:</span>
                    <select
                      value={campaign.imageAspectRatio ?? "1:1"}
                      onChange={e => setImageAspectRatioMutation.mutate({ id: campaignId, imageAspectRatio: e.target.value as "1:1" | "4:5" | "9:16" | "16:9" })}
                      disabled={setImageAspectRatioMutation.isPending}
                      className="text-xs h-7 rounded-md border border-input bg-background px-2 pr-6 cursor-pointer focus:outline-none focus:ring-1 focus:ring-violet-400 appearance-auto"
                    >
                      <option value="1:1">1:1 Square</option>
                      <option value="4:5">4:5 Portrait</option>
                      <option value="9:16">9:16 Story</option>
                      <option value="16:9">16:9 Landscape</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-muted-foreground font-medium">Style:</span>
                    <select
                      value={campaign.imageStyle ?? ""}
                      onChange={e => setImageStyleMutation.mutate({ id: campaignId, imageStyle: e.target.value })}
                      disabled={setImageStyleMutation.isPending}
                      className="text-xs h-7 rounded-md border border-input bg-background px-2 pr-6 cursor-pointer focus:outline-none focus:ring-1 focus:ring-violet-400 appearance-auto"
                    >
                      <option value="">Default</option>
                      <option value="Photorealistic photography, high detail, natural lighting">Photorealistic</option>
                      <option value="Cinematic film still, dramatic lighting, shallow depth of field">Cinematic</option>
                      <option value="Flat vector illustration, bold colours, clean lines">Flat Illustration</option>
                      <option value="Watercolour painting, soft washes, artistic">Watercolour</option>
                      <option value="Bold graphic design, strong contrast, modern typography layout">Bold Graphic</option>
                      <option value="Minimalist, white background, clean and simple">Minimalist</option>
                      <option value="Vibrant product photography, studio lighting, commercial quality">Product Photography</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-muted-foreground font-medium">Model:</span>
                    <select
                      value={campaign.imageModel ?? "dall-e-3"}
                      onChange={e => setImageModelMutation.mutate({ id: campaignId, imageModel: e.target.value as "dall-e-3" | "nano-banana-2" })}
                      disabled={setImageModelMutation.isPending}
                      className="text-xs h-7 rounded-md border border-input bg-background px-2 pr-6 cursor-pointer focus:outline-none focus:ring-1 focus:ring-violet-400 appearance-auto"
                    >
                      <option value="dall-e-3">DALL-E 3</option>
                      <option value="nano-banana-2">Nano Banana 2</option>
                    </select>
                  </div>
                </div>
                {allPostsApproved && campaign.status === "approval" && (
                  <Button
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                    onClick={() => updateStatusMutation.mutate({ id: campaignId, status: "active" })}
                    disabled={updateStatusMutation.isPending}
                  >
                    <Zap className="w-3.5 h-3.5" />
                    Activate Campaign
                  </Button>
                )}
              </div>

              {/* Post grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {posts.map(post => (
                  <div key={post.id} className="rounded-xl border bg-card overflow-hidden">
                    {/* Image area */}
                    <div className="relative aspect-square bg-muted group/img">
                      {generatingPostIds.has(post.id) ? (
                        /* ── Generating overlay ── */
                        <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-violet-50">
                          <div className="relative w-12 h-12">
                            <div className="absolute inset-0 rounded-full border-4 border-violet-200" />
                            <div className="absolute inset-0 rounded-full border-4 border-violet-600 border-t-transparent animate-spin" />
                            <div className="absolute inset-0 flex items-center justify-center">
                              <Sparkles className="w-4 h-4 text-violet-600" />
                            </div>
                          </div>
                          <div className="text-center">
                            <p className="text-xs font-medium text-violet-700">Generating image…</p>
                            <p className="text-[10px] text-violet-500 mt-0.5">This takes 10–30 seconds</p>
                          </div>
                        </div>
                      ) : post.imageUrl ? (
                        <>
                          <img
                            src={post.imageUrl}
                            alt="Post"
                            className="w-full h-full object-cover cursor-zoom-in"
                            onClick={() => setLightboxUrl(post.imageUrl!)}
                          />
                          {/* Hover overlay: download + upload */}
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center gap-2" onClick={() => setLightboxUrl(post.imageUrl!)}>
                            <button
                              onClick={e => { e.stopPropagation(); downloadImage(post.imageUrl!, post.id); }}
                              className="flex items-center gap-1.5 bg-white/90 hover:bg-white text-gray-800 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                            >
                              <Download className="w-3.5 h-3.5" />
                              Download
                            </button>
                            <label className="flex items-center gap-1.5 bg-white/90 hover:bg-white text-gray-800 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors cursor-pointer" onClick={e => e.stopPropagation()}>
                              <Upload className="w-3.5 h-3.5" />
                              Replace
                              <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(post.id, f); e.target.value = ""; }} />
                            </label>
                          </div>
                        </>
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                          <ImageIcon className="w-8 h-8 text-muted-foreground/40" />
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs h-7"
                            onClick={() => generateImageMutation.mutate({ postId: post.id })}
                            disabled={generatingPostIds.has(post.id)}
                          >
                            Generate Image
                          </Button>
                          <label className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground cursor-pointer transition-colors">
                            <Upload className="w-3 h-3" />
                            Upload instead
                            <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(post.id, f); e.target.value = ""; }} />
                          </label>
                        </div>
                      )}
                      <div className="absolute top-2 right-2">
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${POST_STATUS_COLORS[post.status] ?? ""}`}>
                          {post.status}
                        </span>
                      </div>
                    </div>

                    {/* Post details */}
                    <div className="p-3 space-y-2">
                      {post.scheduledAt && (
                        <p className="text-[10px] text-muted-foreground font-medium">
                          {new Date(post.scheduledAt).toLocaleDateString("en-ZA", { weekday: "short", day: "2-digit", month: "short" })}
                          {" "}at{" "}
                          {new Date(post.scheduledAt).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      )}
                      {post.theme && (
                        <p className="text-[10px] font-semibold text-violet-600 uppercase tracking-wider">{post.theme}</p>
                      )}

                      {editingPostId === post.id ? (
                        /* ── Edit mode ── */
                        <div className="space-y-2">
                          <div>
                            <p className="text-[10px] font-medium text-muted-foreground mb-1">Caption</p>
                            <textarea
                              className="w-full text-xs rounded-lg border bg-muted px-2.5 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-violet-400"
                              rows={4}
                              value={editDraft.caption}
                              onChange={e => setEditDraft(d => ({ ...d, caption: e.target.value }))}
                            />
                          </div>
                          <div>
                            <p className="text-[10px] font-medium text-muted-foreground mb-1">Hashtags</p>
                            <textarea
                              className="w-full text-xs rounded-lg border bg-muted px-2.5 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-violet-400"
                              rows={2}
                              value={editDraft.hashtags}
                              onChange={e => setEditDraft(d => ({ ...d, hashtags: e.target.value }))}
                            />
                          </div>
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <p className="text-[10px] font-medium text-muted-foreground">Image prompt</p>
                              <button
                                className="text-[10px] text-violet-600 underline underline-offset-2 hover:text-violet-800 disabled:opacity-40"
                                disabled={suggestPromptMutation.isPending}
                                onClick={() => suggestPromptMutation.mutate({ postId: post.id })}
                              >
                                {suggestPromptMutation.isPending ? "thinking…" : "suggest new"}
                              </button>
                            </div>
                            <textarea
                              className="w-full text-xs rounded-lg border bg-muted px-2.5 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-violet-400"
                              rows={3}
                              value={editDraft.imagePrompt}
                              onChange={e => setEditDraft(d => ({ ...d, imagePrompt: e.target.value }))}
                            />
                          </div>
                          <div className="flex gap-1.5 pt-1">
                            <Button
                              size="sm"
                              className="flex-1 h-7 text-xs bg-violet-600 hover:bg-violet-700 text-white"
                              onClick={() => updateContentMutation.mutate({ postId: post.id, ...editDraft })}
                              disabled={updateContentMutation.isPending}
                            >
                              Save
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs gap-1"
                              disabled={generatingPostIds.has(post.id) || updateContentMutation.isPending}
                              onClick={async () => {
                                await updateContentMutation.mutateAsync({ postId: post.id, ...editDraft });
                                regenerateImageMutation.mutate({ postId: post.id });
                              }}
                            >
                              <RefreshCw className="w-3 h-3" />
                              Regen Image
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingPostId(null)}>
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        /* ── View mode ── */
                        <div className="space-y-1.5">
                          <div className="flex items-start justify-between gap-1">
                            <p className="text-xs text-foreground line-clamp-3 flex-1">{post.caption}</p>
                            <button
                              onClick={() => { setEditingPostId(post.id); setEditDraft({ caption: post.caption ?? "", hashtags: post.hashtags ?? "", imagePrompt: post.imagePrompt ?? "" }); }}
                              className="shrink-0 p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                          </div>
                          {post.hashtags && (
                            <p className="text-[10px] text-muted-foreground line-clamp-1">{post.hashtags}</p>
                          )}
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex gap-1.5 pt-1">
                        {(post.status === "draft" || post.status === "rejected") && (
                          <>
                            <Button
                              size="sm"
                              className="flex-1 h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                              onClick={() => approveMutation.mutate({ postId: post.id })}
                              disabled={approveMutation.isPending}
                            >
                              <Check className="w-3 h-3" />
                              Approve
                            </Button>
                            {post.status === "draft" && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="flex-1 h-7 text-xs gap-1"
                                onClick={() => rejectMutation.mutate({ postId: post.id })}
                                disabled={rejectMutation.isPending}
                              >
                                <X className="w-3 h-3" />
                                Reject
                              </Button>
                            )}
                          </>
                        )}
                        {(post.status === "draft" || post.status === "approved" || post.status === "rejected") && post.imageUrl && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 h-7 text-xs gap-1"
                            onClick={() => regenerateImageMutation.mutate({ postId: post.id })}
                            disabled={regenerateImageMutation.isPending}
                          >
                            <RefreshCw className="w-3 h-3" />
                            Regen Image
                          </Button>
                        )}
                        {post.status === "posted" && post.instagramPostId && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 h-7 text-xs gap-1"
                            onClick={() => setAnalyticsPostId(post.id)}
                          >
                            <BarChart2 className="w-3 h-3" />
                            Analytics
                          </Button>
                        )}
                        {post.status === "approved" && post.imageUrl && igStatus?.connected && (
                          <Button
                            size="sm"
                            className="flex-1 h-7 text-xs bg-violet-600 hover:bg-violet-700 text-white gap-1"
                            onClick={() => publishNowMutation.mutate({ postId: post.id })}
                            disabled={publishNowMutation.isPending}
                          >
                            {publishNowMutation.isPending ? (
                              <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <Zap className="w-3 h-3" />
                            )}
                            Post Now
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </TabsContent>

        {/* ── Calendar Tab ─────────────────────────────────────────────── */}
        <TabsContent value="calendar" className="flex-1 overflow-y-auto mt-0">
          {calendarEvents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
              <CalendarDays className="w-8 h-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">No scheduled posts yet.</p>
            </div>
          ) : (
            <div className="rounded-xl border overflow-hidden">
              <FullCalendar
                plugins={[dayGridPlugin]}
                initialView="dayGridMonth"
                events={calendarEvents}
                headerToolbar={{ left: "prev,next today", center: "title", right: "" }}
                height="auto"
                eventClick={info => {
                  const postId = info.event.extendedProps.postId;
                  toast.info(`Post #${postId} — ${info.event.extendedProps.status}`);
                }}
              />
            </div>
          )}
        </TabsContent>

        {/* ── Performance Tab ──────────────────────────────────────────── */}
        <TabsContent value="performance" className="flex-1 overflow-y-auto mt-0">
          {perfLoading ? (
            <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
              <span className="w-4 h-4 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm">Fetching analytics…</span>
            </div>
          ) : !perfData?.rows.length ? (
            <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
              <TrendingUp className="w-8 h-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">No published posts yet — analytics will appear here once posts are live on Instagram.</p>
            </div>
          ) : (() => {
            const METRICS: { key: keyof typeof perfData.rows[0]["insights"]; label: string; color: string }[] = [
              { key: "reach",             label: "Reach",        color: "text-violet-600"  },
              { key: "likes",             label: "Likes",        color: "text-pink-600"    },
              { key: "comments",          label: "Comments",     color: "text-amber-600"   },
              { key: "shares",            label: "Shares",       color: "text-emerald-600" },
              { key: "saved",             label: "Saves",        color: "text-indigo-600"  },
              { key: "totalInteractions", label: "Interactions", color: "text-blue-600"    },
            ];

            // Normalise each metric to 0–1 relative to best post, average → 0–100 composite
            const maxVals = Object.fromEntries(
              METRICS.map(m => [m.key, Math.max(1, ...perfData.rows.map(r => (r.insights[m.key] as number | null) ?? 0))])
            );
            const withScores = perfData.rows.map(row => {
              const avg = METRICS.reduce((s, m) => {
                const val = (row.insights[m.key] as number | null) ?? 0;
                return s + val / maxVals[m.key];
              }, 0) / METRICS.length;
              return { ...row, bestOverall: Math.round(avg * 1000) / 10 }; // 1 decimal 0–100
            });

            const sorted = [...withScores].sort((a, b) => {
              const av = perfSort.key === "bestOverall"
                ? a.bestOverall
                : (a.insights[perfSort.key as keyof typeof a.insights] as number | null) ?? 0;
              const bv = perfSort.key === "bestOverall"
                ? b.bestOverall
                : (b.insights[perfSort.key as keyof typeof b.insights] as number | null) ?? 0;
              return perfSort.dir === "desc" ? bv - av : av - bv;
            });

            const totals = METRICS.map(m => ({
              ...m,
              total: perfData.rows.reduce((s, r) => s + ((r.insights[m.key] as number | null) ?? 0), 0),
            }));

            const totalReach = perfData.rows.reduce((s, r) => s + r.insights.reach, 0);
            const totalInteractions = perfData.rows.reduce((s, r) => s + r.insights.totalInteractions, 0);
            const avgEngRate = totalReach > 0 ? ((totalInteractions / totalReach) * 100).toFixed(1) : null;

            function SortHeader({ metricKey, label }: { metricKey: string; label: string }) {
              const active = perfSort.key === metricKey;
              return (
                <th
                  className={`px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider cursor-pointer select-none whitespace-nowrap transition-colors ${active ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  onClick={() => setPerfSort(s => s.key === metricKey ? { key: metricKey, dir: s.dir === "desc" ? "asc" : "desc" } : { key: metricKey, dir: "desc" })}
                >
                  <span className="inline-flex items-center justify-end gap-1">
                    {label}
                    {active
                      ? (perfSort.dir === "desc" ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />)
                      : <ChevronDown className="w-3 h-3 opacity-20" />}
                  </span>
                </th>
              );
            }

            return (
              <div className="space-y-4">
                {/* ── Summary stat cards ── */}
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                  {totals.map(m => (
                    <div key={m.key} className="rounded-xl border bg-card px-3 py-2.5 text-center">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{m.label}</p>
                      <p className={`text-xl font-bold mt-0.5 ${m.color}`}>{m.total.toLocaleString()}</p>
                    </div>
                  ))}
                </div>

                {avgEngRate && (
                  <p className="text-xs text-muted-foreground text-center">
                    Avg engagement rate across {perfData.rows.length} post{perfData.rows.length !== 1 ? "s" : ""}: <span className="font-semibold text-foreground">{avgEngRate}%</span>
                  </p>
                )}

                {/* ── Sortable table ── */}
                <div className="rounded-xl border overflow-hidden">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-muted/50 border-b">
                        <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground w-8">#</th>
                        <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Post</th>
                        <SortHeader metricKey="bestOverall" label="Best Overall" />
                        {METRICS.map(m => <SortHeader key={m.key} metricKey={m.key} label={m.label} />)}
                        <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Eng. Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map((row, idx) => {
                        const { post, insights: ins } = row;
                        const engRate = ins.reach > 0 ? ((ins.totalInteractions / ins.reach) * 100).toFixed(1) : null;
                        return (
                          <tr key={post.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                            {/* Rank */}
                            <td className="px-3 py-3 text-center">
                              <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold ${idx === 0 && sorted.length > 1 ? "bg-violet-600 text-white" : "text-muted-foreground"}`}>
                                {idx + 1}
                              </span>
                            </td>

                            {/* Image + caption */}
                            <td className="px-3 py-3">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className="w-10 h-10 rounded-md overflow-hidden bg-muted shrink-0">
                                  {post.imageUrl ? (
                                    <img
                                      src={post.imageUrl}
                                      alt=""
                                      className="w-full h-full object-cover cursor-zoom-in"
                                      onClick={() => setLightboxUrl(post.imageUrl!)}
                                    />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center">
                                      <ImageIcon className="w-4 h-4 text-muted-foreground/40" />
                                    </div>
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-xs font-medium line-clamp-2 leading-snug">{post.caption ?? "—"}</p>
                                  {post.scheduledAt && (
                                    <p className="text-[10px] text-muted-foreground mt-0.5">
                                      {new Date(post.scheduledAt).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </td>

                            {/* Best Overall */}
                            <td className={`px-3 py-3 text-right tabular-nums font-semibold ${perfSort.key === "bestOverall" ? "text-violet-600" : "text-muted-foreground"}`}>
                              {row.bestOverall.toFixed(1)}
                            </td>

                            {/* Metric columns */}
                            {METRICS.map(m => {
                              const val = (ins[m.key] as number | null) ?? 0;
                              const active = perfSort.key === m.key;
                              return (
                                <td key={m.key} className={`px-3 py-3 text-right tabular-nums ${active ? `font-bold ${m.color}` : "text-foreground"}`}>
                                  {val.toLocaleString()}
                                </td>
                              );
                            })}

                            {/* Engagement rate */}
                            <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">
                              {engRate ? `${engRate}%` : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>

                    {/* Totals footer */}
                    <tfoot>
                      <tr className="border-t-2 border-border bg-muted/30">
                        <td className="px-3 py-2.5" />
                        <td className="px-3 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Total</td>
                        <td className="px-3 py-2.5" />
                        {totals.map(m => (
                          <td key={m.key} className={`px-3 py-2.5 text-right text-[11px] font-bold tabular-nums ${m.color}`}>
                            {m.total.toLocaleString()}
                          </td>
                        ))}
                        <td className="px-3 py-2.5 text-right text-[11px] font-bold text-muted-foreground tabular-nums">
                          {avgEngRate ? `${avgEngRate}%` : "—"}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            );
          })()}
        </TabsContent>
      </Tabs>

      {/* ── Image Lightbox ──────────────────────────────────────────────── */}
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

      {/* ── Analytics Modal ─────────────────────────────────────────────── */}
      <Dialog open={!!analyticsPostId} onOpenChange={open => { if (!open) setAnalyticsPostId(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-violet-600" />
              Post Analytics
            </DialogTitle>
          </DialogHeader>
          {analyticsPost && (
            <p className="text-xs text-muted-foreground -mt-1 line-clamp-2">{analyticsPost.caption}</p>
          )}
          {insightsLoading ? (
            <div className="flex items-center justify-center py-10 gap-2 text-muted-foreground">
              <span className="w-4 h-4 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm">Fetching live data…</span>
            </div>
          ) : insightsError ? (
            <p className="text-sm text-red-600 py-4">{insightsError.message}</p>
          ) : insights ? (
            <div className="space-y-3">
              {insights.mediaType && (
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{insights.mediaType.replace('_', ' ')}</p>
              )}
              <div className="grid grid-cols-2 gap-2">
                {([
                  { icon: Users,        label: "Reach",          value: insights.reach,          color: "text-violet-600",  bg: "bg-violet-50"  },
                  insights.plays !== null && { icon: RefreshCw,   label: "Plays",          value: insights.plays,          color: "text-purple-600",  bg: "bg-purple-50"  },
                  { icon: Heart,        label: "Likes",          value: insights.likes,          color: "text-pink-600",    bg: "bg-pink-50"    },
                  { icon: MessageCircle,label: "Comments",       value: insights.comments,       color: "text-amber-600",   bg: "bg-amber-50"   },
                  { icon: Share2,       label: "Shares",         value: insights.shares,         color: "text-emerald-600", bg: "bg-emerald-50" },
                  { icon: Bookmark,     label: "Saves",          value: insights.saved,          color: "text-indigo-600",  bg: "bg-indigo-50"  },
                  insights.profileVisits !== null && { icon: UserCheck, label: "Profile Visits", value: insights.profileVisits,  color: "text-teal-600",    bg: "bg-teal-50"    },
                  insights.follows !== null && { icon: Users,     label: "New Follows",    value: insights.follows,        color: "text-cyan-600",    bg: "bg-cyan-50"    },
                ] as const).filter(Boolean).map((item) => {
                  if (!item) return null;
                  const { icon: Icon, label, value, color, bg } = item as { icon: React.ElementType; label: string; value: number; color: string; bg: string };
                  return (
                    <div key={label} className={`flex items-center gap-3 rounded-lg ${bg} px-3 py-2.5`}>
                      <Icon className={`w-4 h-4 shrink-0 ${color}`} />
                      <div>
                        <p className="text-xs text-muted-foreground leading-none mb-0.5">{label}</p>
                        <p className={`text-lg font-bold leading-none ${color}`}>{value.toLocaleString()}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="rounded-lg bg-muted px-3 py-2.5 flex items-center justify-between">
                <span className="text-xs text-muted-foreground font-medium">Total Interactions</span>
                <span className="text-base font-bold">{insights.totalInteractions.toLocaleString()}</span>
              </div>
              {insights.reach > 0 && (
                <p className="text-[11px] text-muted-foreground text-center">
                  Engagement rate: {((insights.totalInteractions / insights.reach) * 100).toFixed(1)}%
                </p>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* ── Share with Client Dialog ─────────────────────────────────── */}
      <Dialog open={showShareDialog} onOpenChange={setShowShareDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link className="w-4 h-4 text-violet-600" />
              Share with Client
            </DialogTitle>
          </DialogHeader>

          {!campaign.shareToken ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Generate a private link to share this campaign with your client. They'll be able to review and approve posts, and see performance data — without needing a portal account.
              </p>
              <Button
                className="w-full bg-violet-600 hover:bg-violet-700 text-white"
                onClick={() => generateShareLinkMutation.mutate({ id: campaignId })}
                disabled={generateShareLinkMutation.isPending}
              >
                {generateShareLinkMutation.isPending
                  ? <><span className="w-3.5 h-3.5 border-2 border-white/50 border-t-white rounded-full animate-spin" /> Generating…</>
                  : <><Link className="w-3.5 h-3.5" /> Generate client link</>}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Link display */}
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">Client link</p>
                <div className="flex items-center gap-2 min-w-0">
                  <code className="flex-1 min-w-0 text-xs bg-muted rounded-lg px-3 py-2 truncate text-foreground font-mono block">
                    {`${window.location.origin}/campaign/preview/${campaign.shareToken}`}
                  </code>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/campaign/preview/${campaign.shareToken}`);
                      toast.success("Link copied");
                    }}
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>

              {/* Password */}
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1.5">
                  <Lock className="w-3 h-3" />
                  Password protection <span className="text-muted-foreground/60 font-normal">(optional)</span>
                </p>
                <div className="flex items-center gap-2 min-w-0">
                  <input
                    type="text"
                    value={sharePasswordInput}
                    onChange={e => setSharePasswordInput(e.target.value)}
                    placeholder={campaign.sharePassword ? "••••••••" : "Set a password…"}
                    className="flex-1 min-w-0 text-sm bg-muted rounded-lg px-3 py-2 border-0 outline-none focus:ring-1 focus:ring-violet-400"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    disabled={setSharePasswordMutation.isPending}
                    onClick={() => setSharePasswordMutation.mutate({ id: campaignId, password: sharePasswordInput })}
                  >
                    {sharePasswordSaved ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : "Save"}
                  </Button>
                  {campaign.sharePassword && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="shrink-0 text-muted-foreground"
                      onClick={() => { setSharePasswordInput(""); setSharePasswordMutation.mutate({ id: campaignId, password: "" }); }}
                    >
                      Remove
                    </Button>
                  )}
                </div>
                {campaign.sharePassword && !sharePasswordInput && (
                  <p className="text-[11px] text-emerald-600 mt-1 flex items-center gap-1">
                    <Lock className="w-3 h-3" /> Password protected
                  </p>
                )}
              </div>

              {/* Revoke */}
              <div className="border-t pt-3">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground hover:text-red-600 hover:bg-red-50 w-full"
                  onClick={() => revokeShareLinkMutation.mutate({ id: campaignId })}
                  disabled={revokeShareLinkMutation.isPending}
                >
                  Revoke link — client access will be removed immediately
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete campaign?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently delete <span className="font-medium text-foreground">{campaign.name}</span>, all its posts, and the chat history. This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deleteMutation.mutate({ id: campaignId })}
              disabled={deleteMutation.isPending}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
