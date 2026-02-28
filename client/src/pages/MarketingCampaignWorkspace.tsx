import { useState, useRef, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Send, Bot, ImageIcon, Check, X, RefreshCw, ArrowLeft, Sparkles, CalendarDays, LayoutGrid, MessageSquare, Zap, Trash2, Download, Upload, Pencil } from "lucide-react";
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

  const [input, setInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [calendarGenerating, setCalendarGenerating] = useState(false);
  const [generatingPostIds, setGeneratingPostIds] = useState<Set<number>>(new Set());
  const [editingPostId, setEditingPostId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState({ caption: "", hashtags: "", imagePrompt: "" });
  const [localMessages, setLocalMessages] = useState<Message[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
  const approveAllMutation = trpc.campaign.post.approveAll.useMutation({
    onSuccess: () => { toast.success("All draft posts approved"); refetch(); },
    onError: () => toast.error("Failed to approve all"),
  });
  const updateStatusMutation = trpc.campaign.updateStatus.useMutation({
    onSuccess: () => { toast.success("Campaign activated"); refetch(); },
    onError: () => toast.error("Failed to activate campaign"),
  });
  const deleteMutation = trpc.campaign.delete.useMutation({
    onSuccess: () => { toast.success("Campaign deleted"); setLocation("/marketing"); },
    onError: () => toast.error("Failed to delete campaign"),
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
          <p className="text-xs text-muted-foreground mt-0.5">{campaign.clientSlug}</p>
        </div>
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
                  : "Complete the strategy with the agent first, then generate the calendar."}
              </p>
              {(campaign.status === "discovery" || campaign.status === "strategy") && (
                <Button
                  size="sm"
                  className="shrink-0 bg-violet-600 hover:bg-violet-700 text-white gap-1.5 disabled:opacity-40"
                  onClick={generateCalendar}
                  disabled={calendarGenerating || chatLoading || !campaign.strategy}
                  title={!campaign.strategy ? "Complete the strategy chat first" : undefined}
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
                {/* Image style + model selectors */}
                <div className="flex items-center gap-3 ml-auto flex-wrap">
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
                          <img src={post.imageUrl} alt="Post" className="w-full h-full object-cover" />
                          {/* Hover overlay: download + upload */}
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center gap-2">
                            <button
                              onClick={() => downloadImage(post.imageUrl!, post.id)}
                              className="flex items-center gap-1.5 bg-white/90 hover:bg-white text-gray-800 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                            >
                              <Download className="w-3.5 h-3.5" />
                              Download
                            </button>
                            <label className="flex items-center gap-1.5 bg-white/90 hover:bg-white text-gray-800 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors cursor-pointer">
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
                                disabled={updateContentMutation.isPending || regenerateImageMutation.isPending}
                                onClick={async () => {
                                  await updateContentMutation.mutateAsync({ postId: post.id, ...editDraft });
                                  regenerateImageMutation.mutate({ postId: post.id });
                                }}
                              >
                                {regenerateImageMutation.isPending ? "Generating…" : "regenerate"}
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
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditingPostId(null)}>
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
                        {(post.status === "approved" || post.status === "rejected") && post.imageUrl && (
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
      </Tabs>

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
