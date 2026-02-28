import { useState, useRef, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Send, Bot, ImageIcon, Check, X, RefreshCw, ArrowLeft, Sparkles, CalendarDays, LayoutGrid, MessageSquare, Zap, Trash2 } from "lucide-react";
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
  const [localMessages, setLocalMessages] = useState<Message[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

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
    onSuccess: () => { toast.success("Image generated"); refetch(); },
    onError: () => toast.error("Image generation failed"),
  });
  const regenerateImageMutation = trpc.campaign.post.regenerateImage.useMutation({
    onSuccess: () => { toast.success("Image regenerated"); refetch(); },
    onError: () => toast.error("Image regeneration failed"),
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

  async function sendMessage(text?: string) {
    const msg = (text ?? input).trim();
    if (!msg || chatLoading) return;
    setInput("");
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
          {posts.length === 0 && localMessages.length > 0 && !chatLoading && (
            <div className="shrink-0 mb-3 flex items-center justify-between gap-3 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3">
              <p className="text-sm text-violet-800">
                {campaign.status === "approval" || campaign.status === "active"
                  ? "Posts are ready — switch to the Content tab."
                  : "Happy with the strategy? Generate the content calendar."}
              </p>
              {(campaign.status === "discovery" || campaign.status === "strategy") && (
                <Button
                  size="sm"
                  className="shrink-0 bg-violet-600 hover:bg-violet-700 text-white gap-1.5"
                  onClick={() => sendMessage("Generate the content calendar now. Call generate_content_calendar with all posts.")}
                  disabled={chatLoading}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Generate Calendar
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
                {allPostsApproved && campaign.status === "approval" && (
                  <Button
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 ml-auto"
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
                    <div className="relative aspect-square bg-muted">
                      {post.imageUrl ? (
                        <img src={post.imageUrl} alt="Post" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                          <ImageIcon className="w-8 h-8 text-muted-foreground/40" />
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs h-7"
                            onClick={() => generateImageMutation.mutate({ postId: post.id })}
                            disabled={generateImageMutation.isPending}
                          >
                            Generate Image
                          </Button>
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
                      <p className="text-xs text-foreground line-clamp-3">{post.caption}</p>
                      {post.hashtags && (
                        <p className="text-[10px] text-muted-foreground line-clamp-1">{post.hashtags}</p>
                      )}

                      {/* Actions */}
                      <div className="flex gap-1.5 pt-1">
                        {post.status === "draft" && (
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
