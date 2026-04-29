import React, { useState, useRef, useEffect, useCallback } from "react";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, rectSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Send, Bot, ImageIcon, Check, X, RefreshCw, ArrowLeft, Sparkles, CalendarDays, LayoutGrid, MessageSquare, Zap, Trash2, Download, Upload, Pencil, BarChart2, Heart, MessageCircle, Share2, Bookmark, UserCheck, Users, TrendingUp, ChevronUp, ChevronDown, Link, Copy, Lock, Eye, EyeOff, Paperclip, ChevronLeft, ChevronRight, Mail, Undo2, GripVertical } from "lucide-react";
import CampaignJarvisPanel from "@/components/CampaignJarvisPanel";
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

function LinkedinCaptionSection({ post }: { post: { id: number; linkedinCaption?: string | null } }) {
  const utils = trpc.useUtils();
  const repurposeMutation = trpc.campaign.post.repurposeForLinkedin.useMutation({
    onSuccess: ({ linkedinCaption }) => {
      toast.success("LinkedIn caption generated");
      utils.campaign.getPosts.invalidate();
      setCaption(linkedinCaption);
    },
    onError: (e) => toast.error(`Failed: ${e.message}`),
  });
  const [caption, setCaption] = useState<string | null>(post.linkedinCaption ?? null);
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-1.5 border-t border-border pt-1.5">
      <button
        className="flex items-center gap-1 text-[10px] font-medium text-[#0a66c2] hover:underline"
        onClick={() => setOpen(v => !v)}
      >
        <span className="font-bold">in</span>
        LinkedIn
        {caption ? " ✓" : ""}
        <span className="ml-0.5 text-muted-foreground">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="mt-1 space-y-1">
          {caption ? (
            <p className="text-[10px] text-muted-foreground line-clamp-4 whitespace-pre-wrap">{caption}</p>
          ) : (
            <p className="text-[10px] text-muted-foreground italic">No LinkedIn caption yet.</p>
          )}
          <button
            className="text-[10px] text-[#0a66c2] hover:underline disabled:opacity-40"
            disabled={repurposeMutation.isPending}
            onClick={() => repurposeMutation.mutate({ postId: post.id })}
          >
            {repurposeMutation.isPending ? "Generating…" : caption ? "Regenerate" : "Repurpose for LinkedIn"}
          </button>
        </div>
      )}
    </div>
  );
}

function SortablePostWrapper({ id, children }: { id: number; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1, zIndex: isDragging ? 10 : undefined }}
      className="relative"
    >
      <div
        {...attributes}
        {...listeners}
        className="absolute top-2 left-2 z-10 cursor-grab active:cursor-grabbing bg-black/30 hover:bg-black/50 rounded p-1 touch-none"
        title="Drag to reorder"
      >
        <GripVertical className="w-3 h-3 text-white" />
      </div>
      {children}
    </div>
  );
}

export default function MarketingCampaignWorkspace() {
  const [, adminParams] = useRoute("/marketing/:id");
  const [, portalParams] = useRoute("/portal/marketing/:id");
  const params = adminParams ?? portalParams;
  const isPortal = !!portalParams;
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "superAdmin";
  const campaignId = parseInt(params?.id ?? "0", 10);

  const [jarvisOpen, setJarvisOpen] = useState(false);
  const [autoStartJarvis, setAutoStartJarvis] = useState(false);

  // Open Jarvis automatically when ?jarvis=start is in the URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("jarvis") === "start") {
      setJarvisOpen(true);
      setAutoStartJarvis(true);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

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
  const { data: fbStatus } = trpc.facebook.getStatus.useQuery(
    { clientSlug: campaign?.clientSlug ?? "" },
    { enabled: !!campaign?.clientSlug }
  );
  const { data: liStatus } = trpc.linkedin.getStatus.useQuery(
    { clientSlug: campaign?.clientSlug ?? "" },
    { enabled: !!campaign?.clientSlug }
  );

  const [input, setInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [calendarGenerating, setCalendarGenerating] = useState(false);
  const [generatingPostIds, setGeneratingPostIds] = useState<Set<number>>(new Set());
  const [editingPostId, setEditingPostId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState({ caption: "", hashtags: "", imagePrompt: "", scheduledAt: "" });
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [localMessages, setLocalMessages] = useState<Message[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [analyticsPostId, setAnalyticsPostId] = useState<number | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [lightboxImages, setLightboxImages] = useState<string[]>([]);

  // Lightbox keyboard navigation — must be after lightboxUrl/lightboxImages declarations
  useEffect(() => {
    if (!lightboxUrl) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setLightboxUrl(null);
      } else if (e.key === 'ArrowRight') {
        const idx = lightboxImages.indexOf(lightboxUrl);
        if (idx !== -1 && idx < lightboxImages.length - 1) setLightboxUrl(lightboxImages[idx + 1]);
      } else if (e.key === 'ArrowLeft') {
        const idx = lightboxImages.indexOf(lightboxUrl);
        if (idx > 0) setLightboxUrl(lightboxImages[idx - 1]);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [lightboxUrl, lightboxImages]);

  const [perfSort, setPerfSort] = useState<{ key: string; dir: "desc" | "asc" }>({ key: "bestOverall", dir: "desc" });
  const [perfPlatform, setPerfPlatform] = useState<"all" | "ig" | "fb" | "li" | "mailers" | "mailchimp">("all");
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [sharePasswordInput, setSharePasswordInput] = useState("");
  const [sharePasswordSaved, setSharePasswordSaved] = useState(false);
  const [assetsExpanded, setAssetsExpanded] = useState(true);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [selectedMailerId, setSelectedMailerId] = useState<number | null>(null);
  const [mailerTab, setMailerTab] = useState<'edit' | 'preview' | 'ai'>('preview');
  const [mailerAiMessages, setMailerAiMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [mailerAiInput, setMailerAiInput] = useState('');
  const [mailerAiState, setMailerAiState] = useState<'idle' | 'thinking' | 'streaming-text' | 'streaming-html'>('idle');
  const mailerAiHtmlBuf = useRef<string>('');
  const [mailerAiHtmlDisplay, setMailerAiHtmlDisplay] = useState('');
  const mailerAiCodeRef = useRef<HTMLPreElement>(null);
  const [mailerUndoStack, setMailerUndoStack] = useState<string[]>([]);
  const [mailerRedoStack, setMailerRedoStack] = useState<string[]>([]);
  const [mailerAiHistoryLoaded, setMailerAiHistoryLoaded] = useState<number | null>(null);
  const mailerAiBottomRef = useRef<HTMLDivElement>(null);
  const [mailerDraft, setMailerDraft] = useState({ subject: '', previewText: '', htmlContent: '', scheduledAt: '', notes: '' });
  const [mailerDirty, setMailerDirty] = useState(false);
  const [showGenerateMailer, setShowGenerateMailer] = useState(false);
  const [showSendTest, setShowSendTest] = useState(false);
  const [showSendToList, setShowSendToList] = useState(false);
  const [showManageSubscribers, setShowManageSubscribers] = useState(false);
  const [subscriberInput, setSubscriberInput] = useState('');
  const [subscriberFirstName, setSubscriberFirstName] = useState('');
  const [subscriberLastName, setSubscriberLastName] = useState('');
  const [csvPreview, setCsvPreview] = useState<{ email: string; firstName?: string; lastName?: string }[] | null>(null);
  const [csvFileName, setCsvFileName] = useState('');
  const [pasteEmailsText, setPasteEmailsText] = useState('');
  const csvFileRef = useRef<HTMLInputElement>(null);
  const [broadcastScheduledAt, setBroadcastScheduledAt] = useState('');
  const [testEmailInput, setTestEmailInput] = useState('');
  const [testEmails, setTestEmails] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('mailerTestEmails') ?? '[]') as string[]; } catch { return []; }
  });
  const updateTestEmails = (emails: string[]) => {
    setTestEmails(emails);
    localStorage.setItem('mailerTestEmails', JSON.stringify(emails));
  };
  const [generateHeroUrl, setGenerateHeroUrl] = useState<string | null>(null);
  const [generatePurpose, setGeneratePurpose] = useState('');
  const [generateLogoUrl, setGenerateLogoUrl] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const assetFileRef = useRef<HTMLInputElement>(null);

  const analyticsPost = posts.find(p => p.id === analyticsPostId);
  const { data: insights, isLoading: insightsLoading } = trpc.campaign.post.getInsights.useQuery(
    { postId: analyticsPostId ?? 0 },
    { enabled: !!analyticsPostId && analyticsPost?.status === "posted" && !!analyticsPost?.instagramPostId }
  );

  const { data: perfData, isLoading: perfLoading } = trpc.campaign.post.getPerformance.useQuery(
    { campaignId },
    { enabled: !!campaignId }
  );

  const { data: mailerAnalytics, isLoading: mailerAnalyticsLoading } = trpc.campaign.mailer.getAnalytics.useQuery(
    { campaignId },
    { enabled: perfPlatform === 'mailers' }
  );
  const { data: mailchimpData, isLoading: mailchimpLoading } = trpc.campaign.mailer.getMailchimpReports.useQuery(
    { campaignId },
    { enabled: perfPlatform === 'mailchimp' }
  );

  const { data: mailchimpUpcoming } = trpc.campaign.mailer.getMailchimpUpcoming.useQuery(
    { campaignId },
    { enabled: !!campaignId }
  );

  const { data: mailers = [], refetch: refetchMailers } = trpc.campaign.mailer.list.useQuery(
    { campaignId },
    { enabled: !!campaignId }
  );
  const createMailerMutation = trpc.campaign.mailer.create.useMutation({
    onSuccess: (mailer) => {
      refetchMailers();
      setSelectedMailerId(mailer.id);
      setMailerDraft({ subject: mailer.subject ?? '', previewText: '', htmlContent: '', scheduledAt: '', notes: '' });
      setMailerDirty(false);
    },
    onError: () => toast.error('Failed to create mailer'),
  });
  const updateMailerMutation = trpc.campaign.mailer.update.useMutation({
    onSuccess: (data) => {
      refetchMailers();
      setMailerDirty(false);
      setMailerUndoStack([]);
      setMailerRedoStack([]);
      if (data.broadcastUpdated) {
        toast.success('Saved and synced to Resend');
      } else if (data.cannotSyncToResend) {
        toast.warning("Saved locally. Couldn't sync to Resend — cancel and re-schedule this broadcast to use the latest content.");
      } else {
        toast.success('Saved');
      }
    },
    onError: () => toast.error('Failed to save mailer'),
  });
  const deleteMailerMutation = trpc.campaign.mailer.delete.useMutation({
    onSuccess: () => { refetchMailers(); setSelectedMailerId(null); },
    onError: () => toast.error('Failed to delete mailer'),
  });
  const sendTestMutation = trpc.campaign.mailer.sendTest.useMutation({
    onSuccess: ({ sent, failed }) => {
      toast.success(`Test sent to ${sent} recipient${sent !== 1 ? 's' : ''}${failed > 0 ? ` (${failed} failed)` : ''}`);
      setShowSendTest(false);
      setTestEmailInput('');
    },
    onError: (e) => toast.error(e.message),
  });

  const generateMailerMutation = trpc.campaign.mailer.generate.useMutation({
    onSuccess: (mailer) => {
      refetchMailers();
      setSelectedMailerId(mailer.id);
      setMailerDraft({ subject: mailer.subject ?? '', previewText: mailer.previewText ?? '', htmlContent: mailer.htmlContent ?? '', scheduledAt: '', notes: '' });
      setMailerDirty(false);
      setMailerTab('preview');
      setShowGenerateMailer(false);
      setGenerateHeroUrl(null);
      setGeneratePurpose('');
      setGenerateLogoUrl('');
      toast.success('Mailer generated — check the Preview tab');
    },
    onError: (e) => toast.error(`Generation failed: ${e.message}`),
  });

  const clientSlug = campaign?.clientSlug ?? '';
  const { data: segmentStatus, refetch: refetchSegment } = trpc.campaign.mailer.getSegmentStatus.useQuery(
    { clientSlug },
    { enabled: !!clientSlug }
  );
  const { data: subscribers = [], refetch: refetchSubscribers } = trpc.campaign.mailer.listSubscribers.useQuery(
    { clientSlug },
    { enabled: !!clientSlug && showManageSubscribers }
  );
  const addSubscriberMutation = trpc.campaign.mailer.addSubscriber.useMutation({
    onSuccess: () => { refetchSubscribers(); refetchSegment(); setSubscriberInput(''); setSubscriberFirstName(''); setSubscriberLastName(''); toast.success('Subscriber added'); },
    onError: (e) => toast.error(e.message),
  });
  const removeSubscriberMutation = trpc.campaign.mailer.removeSubscriber.useMutation({
    onSuccess: () => { refetchSubscribers(); refetchSegment(); toast.success('Subscriber removed'); },
    onError: (e) => toast.error(e.message),
  });
  const importSubscribersMutation = trpc.campaign.mailer.importSubscribers.useMutation({
    onSuccess: ({ added, failed }) => {
      refetchSubscribers();
      refetchSegment();
      setCsvPreview(null);
      setCsvFileName('');
      toast.success(`Imported ${added} subscriber${added !== 1 ? 's' : ''}${failed > 0 ? ` (${failed} failed)` : ''}`);
    },
    onError: (e) => toast.error(e.message),
  });

  function handleCsvFile(file: File) {
    setCsvFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) { toast.error('CSV must have a header row and at least one contact'); return; }
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/['"]/g, ''));
      const emailIdx = headers.findIndex(h => h === 'email');
      const firstIdx = headers.findIndex(h => h.includes('first'));
      const lastIdx = headers.findIndex(h => h.includes('last'));
      if (emailIdx === -1) { toast.error('CSV must have an "email" column'); return; }
      const contacts: { email: string; firstName?: string; lastName?: string }[] = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.trim().replace(/^["']|["']$/g, ''));
        const email = cols[emailIdx];
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue;
        contacts.push({ email, firstName: firstIdx >= 0 ? cols[firstIdx] || undefined : undefined, lastName: lastIdx >= 0 ? cols[lastIdx] || undefined : undefined });
      }
      if (contacts.length === 0) { toast.error('No valid email addresses found in CSV'); return; }
      setCsvPreview(contacts);
    };
    reader.readAsText(file);
  }

  const broadcastMutation = trpc.campaign.mailer.broadcast.useMutation({
    onSuccess: () => {
      refetchMailers();
      setShowSendToList(false);
      setBroadcastScheduledAt('');
      toast.success('Campaign sent to subscriber list');
    },
    onError: (e) => toast.error(e.message),
  });

  const { data: mailerChatHistory } = trpc.campaign.mailer.chat.getMessages.useQuery(
    { mailerId: selectedMailerId ?? 0 },
    { enabled: !!selectedMailerId && mailerTab === 'ai' }
  );
  const mailerChatSendMutation = trpc.campaign.mailer.chat.send.useMutation();
  const mailerChatClearMutation = trpc.campaign.mailer.chat.clear.useMutation({
    onSuccess: () => { setMailerAiMessages([]); setMailerUndoStack([]); setMailerRedoStack([]); /* keep mailerAiHistoryLoaded — prevents effect re-populating from stale query */ },
    onError: () => toast.error('Failed to clear chat'),
  });

  async function sendMailerAiMessage() {
    const msg = mailerAiInput.trim();
    if (!msg || mailerAiState !== 'idle' || !selectedMailerId) return;
    setMailerAiInput('');
    setMailerAiMessages(prev => [...prev, { role: 'user', content: msg }]);
    setMailerAiState('thinking');
    mailerAiHtmlBuf.current = '';
    setMailerAiHtmlDisplay('');
    // Add a placeholder assistant message that we'll stream into
    setMailerAiMessages(prev => [...prev, { role: 'assistant', content: '' }]);
    try {
      const res = await fetch(`/api/mailer-chat/${selectedMailerId}/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, currentHtml: mailerDraft.htmlContent }),
      });
      if (!res.ok) throw new Error('AI request failed');
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let htmlStarted = false;
      let textStreamingStarted = false;
      let accumulatedText = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = JSON.parse(line.slice(6)) as { text?: string; done?: boolean; hasHtml?: boolean; base64Map?: string[]; error?: string };
          if (payload.error) throw new Error(payload.error);
          if (payload.done) {
            if (payload.hasHtml) {
              // Restore base64 placeholders locally
              let restoredHtml = mailerAiHtmlBuf.current;
              const map = payload.base64Map ?? [];
              for (let i = 0; i < map.length; i++) {
                restoredHtml = restoredHtml.split(`__BASE64_${i}__`).join(map[i]);
              }
              // Push current HTML onto undo stack (up to 5 levels), clear redo (new branch)
              setMailerUndoStack(prev => [...prev.slice(-4), mailerDraft.htmlContent]);
              setMailerRedoStack([]);
              setMailerDraft(d => ({ ...d, htmlContent: restoredHtml }));
              setMailerDirty(true);
              // Stamp the local message with [HTML updated] so badge shows immediately (without reload)
              setMailerAiMessages(prev => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last?.role === 'assistant') {
                  updated[updated.length - 1] = {
                    ...last,
                    content: last.content ? `${last.content}\n[HTML updated]` : '[HTML updated]',
                  };
                }
                return updated;
              });
            }
            setMailerAiState('idle');
            continue;
          }
          if (payload.text) {
            if (!htmlStarted) {
              // Check if the accumulated stream has reached <!DOCTYPE html
              accumulatedText += payload.text;
              const htmlIdx = accumulatedText.toLowerCase().indexOf('<!doctype html');
              if (htmlIdx >= 0) {
                // Switch to HTML streaming mode — freeze the bubble at text before doctype
                htmlStarted = true;
                const htmlStart = accumulatedText.slice(htmlIdx);
                mailerAiHtmlBuf.current = htmlStart;
                setMailerAiHtmlDisplay(htmlStart);
                const textBeforeHtml = accumulatedText.slice(0, htmlIdx).trim();
                // Freeze the bubble with the pre-HTML text
                setMailerAiMessages(prev => {
                  const updated = [...prev];
                  updated[updated.length - 1] = { role: 'assistant', content: textBeforeHtml };
                  return updated;
                });
                setMailerAiState('streaming-html');
              } else {
                // Still in text phase
                if (!textStreamingStarted) { textStreamingStarted = true; setMailerAiState('streaming-text'); }
                setMailerAiMessages(prev => {
                  const updated = [...prev];
                  updated[updated.length - 1] = { role: 'assistant', content: accumulatedText };
                  return updated;
                });
              }
            } else {
              // Accumulate HTML tokens — update ref (no extra render) + display state (live code view)
              mailerAiHtmlBuf.current += payload.text;
              setMailerAiHtmlDisplay(prev => prev + payload.text);
            }
          }
        }
      }
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : 'AI request failed';
      toast.error(errMsg);
      // Remove the empty placeholder on error
      setMailerAiMessages(prev => prev.slice(0, -1));
      setMailerAiState('idle');
    }
  }

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

  useEffect(() => {
    if (mailerChatHistory && selectedMailerId && mailerAiHistoryLoaded !== selectedMailerId) {
      setMailerAiMessages(mailerChatHistory.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })));
      setMailerAiHistoryLoaded(selectedMailerId);
    }
  }, [mailerChatHistory, selectedMailerId, mailerAiHistoryLoaded]);

  useEffect(() => {
    mailerAiBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mailerAiMessages, mailerAiState]);

  // Auto-scroll the live code pane to bottom as HTML tokens stream in
  useEffect(() => {
    if (mailerAiCodeRef.current) {
      mailerAiCodeRef.current.scrollTop = mailerAiCodeRef.current.scrollHeight;
    }
  }, [mailerAiHtmlDisplay]);

  // Reset AI history loaded flag when switching mailers
  useEffect(() => {
    setMailerAiHistoryLoaded(null);
    setMailerAiMessages([]);
  }, [selectedMailerId]);

  // Warn on page/tab close if mailer has unsaved changes
  useEffect(() => {
    if (!mailerDirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [mailerDirty]);

  const approveMutation = trpc.campaign.post.approve.useMutation({
    onSuccess: () => refetch(),
    onError: () => toast.error("Failed to approve post"),
  });
  const rejectMutation = trpc.campaign.post.reject.useMutation({
    onSuccess: () => refetch(),
    onError: () => toast.error("Failed to reject post"),
  });
  const updateStatusDirectMutation = trpc.campaign.post.setStatus.useMutation({
    onSuccess: () => refetch(),
    onError: () => toast.error("Failed to update status"),
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
    onSuccess: ({ postedTo }) => {
      const label = postedTo.length === 0 ? 'No platforms posted' : `Posted to ${postedTo.join(' & ')}!`;
      toast.success(label);
      refetch();
    },
    onError: (e) => toast.error(`Post failed: ${e.message}`),
  });
  const approveAllMutation = trpc.campaign.post.approveAll.useMutation({
    onSuccess: () => { toast.success("All draft posts approved"); refetch(); },
    onError: () => toast.error("Failed to approve all"),
  });
  const rescheduleAllMutation = trpc.campaign.post.rescheduleAll.useMutation({
    onSuccess: ({ count }) => { toast.success(`${count} posts rescheduled`); setRescheduleDate(""); refetch(); },
    onError: () => toast.error("Failed to reschedule"),
  });
  const reorderMutation = trpc.campaign.post.reorder.useMutation({
    onError: () => { toast.error("Failed to save order"); refetch(); },
  });
  const [localPostOrder, setLocalPostOrder] = useState<number[]>([]);
  useEffect(() => { setLocalPostOrder(posts.map(p => p.id)); }, [posts.length]);
  const dndSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setLocalPostOrder(prev => {
      const oldIdx = prev.indexOf(active.id as number);
      const newIdx = prev.indexOf(over.id as number);
      const newOrder = arrayMove(prev, oldIdx, newIdx);
      reorderMutation.mutate({ campaignId, order: newOrder });
      return newOrder;
    });
  }, [campaignId, reorderMutation]);
  const updateStatusMutation = trpc.campaign.updateStatus.useMutation({
    onSuccess: () => { toast.success("Campaign activated"); refetch(); },
    onError: () => toast.error("Failed to activate campaign"),
  });
  const saveStrategyMutation = trpc.campaign.saveStrategy.useMutation({
    onSuccess: () => { toast.success("Strategy saved — you can now generate the calendar"); refetch(); },
    onError: () => toast.error("Failed to save strategy"),
  });
  const deleteMutation = trpc.campaign.delete.useMutation({
    onSuccess: () => { toast.success("Campaign deleted"); setLocation(isPortal ? "/portal/marketing" : "/marketing"); },
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
  const uploadVideoMutation = trpc.campaign.post.uploadVideo.useMutation({
    onSuccess: () => { toast.success("Video uploaded"); refetch(); },
    onError: () => toast.error("Video upload failed"),
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
  const setPlatformsMutation = trpc.campaign.setPlatforms.useMutation({
    onSuccess: () => refetch(),
    onError: () => toast.error("Failed to update platforms"),
  });
  const suggestPromptMutation = trpc.campaign.post.suggestImagePrompt.useMutation({
    onSuccess: ({ prompt }) => setEditDraft(d => ({ ...d, imagePrompt: prompt })),
    onError: () => toast.error("Failed to suggest prompt"),
  });

  const { data: campaignAssets = [], refetch: refetchAssets } = trpc.campaign.asset.list.useQuery(
    { campaignId },
    { enabled: !!campaignId }
  );
  const uploadAssetMutation = trpc.campaign.asset.upload.useMutation({
    onSuccess: () => { refetchAssets(); setUploadingCount(n => Math.max(0, n - 1)); },
    onError: () => { toast.error("Upload failed"); setUploadingCount(n => Math.max(0, n - 1)); },
  });
  const deleteAssetMutation = trpc.campaign.asset.delete.useMutation({
    onSuccess: () => { refetchAssets(); },
    onError: () => toast.error("Failed to remove asset"),
  });

  function handleAssetFiles(files: FileList) {
    for (const file of Array.from(files)) {
      setUploadingCount(n => n + 1);
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(",")[1];
        uploadAssetMutation.mutate({ campaignId, base64, mimeType: file.type });
      };
      reader.readAsDataURL(file);
    }
  }

  async function downloadImage(url: string, postId: number) {
    try {
      const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(url)}`;
      const res = await fetch(proxyUrl);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `post-${postId}.jpg`;
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

  function handleVideoUpload(postId: number, file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(",")[1];
      uploadVideoMutation.mutate({ postId, base64, mimeType: file.type });
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

  function selectMailer(mailer: typeof mailers[0]) {
    if (mailerDirty && !window.confirm('You have unsaved changes. Discard them?')) return;
    setSelectedMailerId(mailer.id);
    setMailerDraft({
      subject: mailer.subject ?? '',
      previewText: mailer.previewText ?? '',
      htmlContent: mailer.htmlContent ?? '',
      scheduledAt: mailer.scheduledAt ? new Date(mailer.scheduledAt).toISOString().slice(0, 16) : '',
      notes: mailer.notes ?? '',
    });
    setMailerDirty(false);
    setMailerUndoStack([]);
    setMailerRedoStack([]);
    setMailerTab('preview');
  }

  function saveMailer() {
    if (!selectedMailerId) return;
    updateMailerMutation.mutate({
      id: selectedMailerId,
      subject: mailerDraft.subject,
      previewText: mailerDraft.previewText || null,
      htmlContent: mailerDraft.htmlContent,
      scheduledAt: mailerDraft.scheduledAt || null,
      notes: mailerDraft.notes || null,
    });
  }

  function downloadMailerHtml() {
    const blob = new Blob([mailerDraft.htmlContent], { type: 'text/html' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${mailerDraft.subject || 'mailer'}.html`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const allPostsApproved = posts.length > 0 && posts.every(p => p.status === "approved" || p.status === "posted" || p.status === "scheduled");
  const hasDraftPosts = posts.some(p => p.status === "draft");

  const calendarEvents = posts
    .filter(p => p.scheduledAt)
    .flatMap(p => {
      const date = new Date(p.scheduledAt!).toISOString().slice(0, 10);
      const title = p.theme ?? p.caption?.slice(0, 30) ?? "Post";
      const base = { date, extendedProps: { postId: p.id, status: p.status } };

      // Posted: one bar per platform in platform colour
      if (p.status === 'posted' && ((p.instagramPostId || p.facebookPostId || (p as any).linkedinPostId))) {
        const events = [];
        if (p.instagramPostId) events.push({
          ...base, title,
          backgroundColor: '#ec4899', borderColor: '#ec4899',
        });
        if (p.facebookPostId) events.push({
          ...base, title,
          backgroundColor: '#1d4ed8', borderColor: '#1d4ed8',
        });
        if ((p as any).linkedinPostId) events.push({
          ...base, title,
          backgroundColor: '#0a66c2', borderColor: '#0a66c2',
        });
        return events;
      }

      // Not yet posted: single bar in status colour
      return [{ ...base, title, backgroundColor: POST_CALENDAR_COLORS[p.status] ?? "#9ca3af", borderColor: POST_CALENDAR_COLORS[p.status] ?? "#9ca3af" }];
    }).concat(
      mailers
        .filter(m => m.scheduledAt)
        .map(m => ({
          title: `✉ ${m.subject || 'Mailer'}`,
          date: new Date(m.scheduledAt!).toISOString().slice(0, 10),
          backgroundColor: m.status === 'sent' ? '#10b981' : '#f59e0b',
          borderColor: m.status === 'sent' ? '#10b981' : '#f59e0b',
          extendedProps: { postId: 0, status: 'scheduled' as const },
        }))
    );

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

  const lightboxIdx = lightboxUrl ? lightboxImages.indexOf(lightboxUrl) : -1;
  const lightboxHasPrev = lightboxIdx > 0;
  const lightboxHasNext = lightboxIdx !== -1 && lightboxIdx < lightboxImages.length - 1;

  return (
    <div className="flex h-[calc(100vh-64px)] gap-0">
      {/* Main workspace */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5 shrink-0">
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setLocation(isPortal ? "/portal/marketing" : "/marketing")}>
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
            {fbStatus?.connected ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                FB {fbStatus.pageName}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                Facebook not connected
              </span>
            )}
            {liStatus?.connected ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                LI {liStatus.postTarget === 'organization' && liStatus.orgName ? liStatus.orgName : 'Personal'}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                LinkedIn not connected
              </span>
            )}
          </div>
        </div>
        {isSuperAdmin && (
          <Button
            variant="ghost"
            size="sm"
            className={`h-8 px-2.5 gap-1.5 text-xs font-medium ${jarvisOpen ? "text-violet-600 bg-violet-50 hover:bg-violet-100" : "text-muted-foreground hover:text-foreground"}`}
            onClick={() => setJarvisOpen(v => !v)}
          >
            <Sparkles className="w-3.5 h-3.5" />
            {jarvisOpen ? "Hide Jarvis" : "Jarvis"}
          </Button>
        )}
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
          <TabsTrigger value="mails" className="gap-1.5">
            <Mail className="w-3.5 h-3.5" />
            Mails
            {mailers.length > 0 && <span className="ml-1 text-[10px] bg-muted rounded-full px-1.5">{mailers.length}</span>}
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

          {/* Brand Assets panel */}
          <div className="shrink-0 mb-4 rounded-xl border border-border bg-card">
            <button
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-foreground hover:bg-muted/50 rounded-xl transition-colors"
              onClick={() => setAssetsExpanded(e => !e)}
            >
              <span className="flex items-center gap-2">
                <Paperclip className="w-3.5 h-3.5 text-muted-foreground" />
                Brand Assets
                {campaignAssets.length > 0 && (
                  <span className="text-xs bg-muted rounded-full px-1.5 py-0.5 text-muted-foreground">{campaignAssets.length}</span>
                )}
              </span>
              <ChevronRight className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${assetsExpanded ? "rotate-90" : ""}`} />
            </button>
            {assetsExpanded && (
              <div className="px-4 pb-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  {campaignAssets.map(asset => (
                    <div key={asset.id} className="relative group w-10 h-10 rounded-md overflow-hidden border border-border bg-muted shrink-0">
                      <img src={asset.url} alt={asset.label ?? "Brand asset"} className="w-full h-full object-cover" title={asset.aiDescription ?? asset.label ?? undefined} />
                      <button
                        className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100"
                        onClick={() => deleteAssetMutation.mutate({ assetId: asset.id })}
                        title="Remove"
                      >
                        <X className="w-3 h-3 text-white" />
                      </button>
                    </div>
                  ))}
                  {Array.from({ length: uploadingCount }).map((_, i) => (
                    <div key={`uploading-${i}`} className="w-10 h-10 rounded-md border border-border bg-muted flex items-center justify-center shrink-0">
                      <span className="w-3.5 h-3.5 border-2 border-muted-foreground border-t-transparent rounded-full animate-spin" />
                    </div>
                  ))}
                  <input
                    ref={assetFileRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={e => { if (e.target.files?.length) handleAssetFiles(e.target.files); e.target.value = ""; }}
                  />
                  <button
                    className="w-10 h-10 rounded-md border border-dashed border-border bg-muted hover:bg-muted/80 flex items-center justify-center shrink-0 transition-colors"
                    onClick={() => assetFileRef.current?.click()}
                    title="Upload reference images"
                  >
                    <Upload className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                </div>
                {campaignAssets.length === 0 && uploadingCount === 0 && (
                  <p className="text-xs text-muted-foreground mt-2">Upload product photos, mood boards, or style references for the AI to use.</p>
                )}
              </div>
            )}
          </div>

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
              <div className="flex items-center gap-2 mb-4 flex-wrap justify-between">
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
                {/* Platform toggles */}
                <div className="flex items-center gap-3 border rounded-md px-3 py-1.5">
                  <span className="text-[11px] text-muted-foreground font-medium">Post to:</span>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={campaign.postToInstagram ?? true}
                      onChange={e => setPlatformsMutation.mutate({ id: campaignId, postToInstagram: e.target.checked, postToFacebook: campaign.postToFacebook ?? false })}
                      disabled={setPlatformsMutation.isPending}
                      className="w-3.5 h-3.5 accent-violet-600"
                    />
                    <span className="text-xs font-medium">Instagram</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={campaign.postToFacebook ?? false}
                      onChange={e => setPlatformsMutation.mutate({ id: campaignId, postToInstagram: campaign.postToInstagram ?? true, postToFacebook: e.target.checked, postToLinkedin: (campaign as any).postToLinkedin ?? false })}
                      disabled={setPlatformsMutation.isPending}
                      className="w-3.5 h-3.5 accent-violet-600"
                    />
                    <span className="text-xs font-medium">Facebook</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={(campaign as any).postToLinkedin ?? false}
                      onChange={e => setPlatformsMutation.mutate({ id: campaignId, postToInstagram: campaign.postToInstagram ?? true, postToFacebook: campaign.postToFacebook ?? false, postToLinkedin: e.target.checked })}
                      disabled={setPlatformsMutation.isPending}
                      className="w-3.5 h-3.5 accent-violet-600"
                    />
                    <span className="text-xs font-medium" style={{ color: '#0a66c2' }}>LinkedIn</span>
                  </label>
                </div>
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
                      onChange={e => setImageModelMutation.mutate({ id: campaignId, imageModel: e.target.value as "dall-e-3" | "nano-banana-2" | "gpt-image-1" })}
                      disabled={setImageModelMutation.isPending}
                      className="text-xs h-7 rounded-md border border-input bg-background px-2 pr-6 cursor-pointer focus:outline-none focus:ring-1 focus:ring-violet-400 appearance-auto"
                    >
                      <option value="dall-e-3">DALL-E 3</option>
                      <option value="nano-banana-2">Nano Banana 2</option>
                      <option value="gpt-image-1">GPT Image 1</option>
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
                {campaign.status === "active" && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-amber-600 border-amber-200 hover:bg-amber-50"
                    onClick={() => updateStatusMutation.mutate({ id: campaignId, status: "approval" })}
                    disabled={updateStatusMutation.isPending}
                  >
                    Deactivate
                  </Button>
                )}
                {/* Reschedule all posts */}
                <div className="flex items-center gap-1.5 ml-auto">
                  <input
                    type="date"
                    value={rescheduleDate}
                    onChange={e => setRescheduleDate(e.target.value)}
                    className="text-xs h-7 rounded-md border border-input bg-background px-2 focus:outline-none focus:ring-1 focus:ring-violet-400"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 h-7 text-xs"
                    disabled={!rescheduleDate || rescheduleAllMutation.isPending}
                    onClick={() => rescheduleAllMutation.mutate({ campaignId, startDate: rescheduleDate })}
                  >
                    <CalendarDays className="w-3.5 h-3.5" />
                    Reschedule from date
                  </Button>
                </div>
              </div>

              {/* Post grid */}
              <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={localPostOrder} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {localPostOrder.map(id => { const post = posts.find(p => p.id === id); if (!post) return null; return (
                  <SortablePostWrapper key={post.id} id={post.id}>
                  <div className="rounded-xl border bg-card overflow-hidden">
                    {/* Media area */}
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
                      ) : post.mediaType === "video" && post.videoUrl ? (
                        /* ── Video preview ── */
                        <>
                          <video
                            src={post.videoUrl}
                            className="w-full h-full object-cover"
                            controls
                            preload="metadata"
                          />
                          {/* Hover overlay: replace video */}
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                            <label className="flex items-center gap-1.5 bg-white/90 hover:bg-white text-gray-800 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors cursor-pointer pointer-events-auto" onClick={e => e.stopPropagation()}>
                              <Upload className="w-3.5 h-3.5" />
                              Replace video
                              <input type="file" accept="video/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleVideoUpload(post.id, f); e.target.value = ""; }} />
                            </label>
                          </div>
                        </>
                      ) : post.imageUrl ? (
                        /* ── Image preview ── */
                        <>
                          <img
                            src={post.imageUrl}
                            alt="Post"
                            className="w-full h-full object-cover cursor-zoom-in"
                            onClick={() => { const imgs = posts.filter(p => p.imageUrl).map(p => p.imageUrl!); setLightboxImages(imgs); setLightboxUrl(post.imageUrl!); }}
                          />
                          {/* Hover overlay: download + replace */}
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center gap-2" onClick={() => { const imgs = posts.filter(p => p.imageUrl).map(p => p.imageUrl!); setLightboxImages(imgs); setLightboxUrl(post.imageUrl!); }}>
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
                              <input
                                type="file"
                                accept="image/*,video/*"
                                className="hidden"
                                onChange={e => {
                                  const f = e.target.files?.[0];
                                  if (!f) return;
                                  if (f.type.startsWith("video/")) {
                                    handleVideoUpload(post.id, f);
                                  } else {
                                    handleFileUpload(post.id, f);
                                  }
                                  e.target.value = "";
                                }}
                              />
                            </label>
                          </div>
                        </>
                      ) : (
                        /* ── No media yet ── */
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
                            Upload image or video
                            <input
                              type="file"
                              accept="image/*,video/*"
                              className="hidden"
                              onChange={e => {
                                const f = e.target.files?.[0];
                                if (!f) return;
                                if (f.type.startsWith("video/")) {
                                  handleVideoUpload(post.id, f);
                                } else {
                                  handleFileUpload(post.id, f);
                                }
                                e.target.value = "";
                              }}
                            />
                          </label>
                        </div>
                      )}
                      <div className="absolute top-2 right-2">
                        {(post.status === "draft" || post.status === "approved" || post.status === "rejected") ? (
                          <select
                            value={post.status}
                            onChange={e => {
                              const s = e.target.value as "draft" | "approved" | "rejected";
                              if (s === "approved") approveMutation.mutate({ postId: post.id });
                              else if (s === "rejected") rejectMutation.mutate({ postId: post.id });
                              else updateStatusDirectMutation.mutate({ postId: post.id, status: s });
                            }}
                            className={`text-[10px] font-medium px-2 py-0.5 rounded-full border-0 cursor-pointer focus:outline-none focus:ring-1 focus:ring-violet-400 ${POST_STATUS_COLORS[post.status] ?? ""}`}
                          >
                            <option value="draft">draft</option>
                            <option value="approved">approved</option>
                            <option value="rejected">rejected</option>
                          </select>
                        ) : (
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${POST_STATUS_COLORS[post.status] ?? ""}`}>
                            {post.status}
                          </span>
                        )}
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
                            <p className="text-[10px] font-medium text-muted-foreground mb-1">Scheduled date & time</p>
                            <input
                              type="datetime-local"
                              className="w-full text-xs rounded-lg border bg-muted px-2.5 py-2 focus:outline-none focus:ring-1 focus:ring-violet-400"
                              value={editDraft.scheduledAt}
                              onChange={e => setEditDraft(d => ({ ...d, scheduledAt: e.target.value }))}
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
                              onClick={() => updateContentMutation.mutate({ postId: post.id, ...editDraft, scheduledAt: editDraft.scheduledAt || null })}
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
                                await updateContentMutation.mutateAsync({ postId: post.id, ...editDraft, scheduledAt: editDraft.scheduledAt || null });
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
                              onClick={() => { setEditingPostId(post.id); setEditDraft({ caption: post.caption ?? "", hashtags: post.hashtags ?? "", imagePrompt: post.imagePrompt ?? "", scheduledAt: post.scheduledAt ? new Date(post.scheduledAt).toISOString().slice(0, 16) : "" }); }}
                              className="shrink-0 p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                          </div>
                          {post.hashtags && (
                            <p className="text-[10px] text-muted-foreground line-clamp-1">{post.hashtags}</p>
                          )}
                          {/* LinkedIn caption section */}
                          {(campaign as any).postToLinkedin && (
                            <LinkedinCaptionSection post={post} />
                          )}
                          {post.status === "rejected" && (post as any).notes && (
                            <div className="mt-1.5 rounded-lg bg-red-50 border border-red-100 px-2.5 py-2">
                              <p className="text-[10px] font-semibold text-red-500 uppercase tracking-wide mb-0.5">Client feedback</p>
                              <p className="text-xs text-red-700 leading-snug">{(post as any).notes}</p>
                            </div>
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
                        {post.status === "posted" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 h-7 text-xs gap-1"
                            onClick={() => publishNowMutation.mutate({ postId: post.id })}
                            disabled={publishNowMutation.isPending}
                          >
                            {publishNowMutation.isPending
                              ? <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                              : <RefreshCw className="w-3 h-3" />
                            }
                            Re-post
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
                  </SortablePostWrapper>
                ); })}
              </div>
              </SortableContext>
              </DndContext>
            </>
          )}
        </TabsContent>

        {/* ── Mails Tab ─────────────────────────────────────────────────── */}
        <TabsContent value="mails" className="flex-1 flex min-h-0 gap-4 mt-0">
          {/* Left: mailer list */}
          <div className="w-64 shrink-0 flex flex-col gap-2 overflow-y-auto pr-1">
            <Button
              size="sm"
              className="bg-violet-600 hover:bg-violet-700 text-white gap-1.5 w-full"
              onClick={() => setShowGenerateMailer(true)}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Generate Mailer
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 w-full"
              onClick={() => createMailerMutation.mutate({ campaignId })}
              disabled={createMailerMutation.isPending}
            >
              <Mail className="w-3.5 h-3.5" />
              Blank Mailer
            </Button>
            {mailers.length === 0 && (
              <p className="text-xs text-muted-foreground text-center pt-4">No mailers yet.</p>
            )}
            {mailers.map(mailer => (
              <button
                key={mailer.id}
                onClick={() => selectMailer(mailer)}
                className={`w-full text-left rounded-xl border p-3 transition-colors ${selectedMailerId === mailer.id ? 'border-violet-400 bg-violet-50' : 'border-border bg-card hover:bg-muted/50'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-medium text-foreground truncate">{mailer.subject || 'Untitled'}</p>
                  <span className={`shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                    mailer.status === 'sent' ? 'bg-emerald-100 text-emerald-700' :
                    mailer.status === 'scheduled' ? 'bg-blue-100 text-blue-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>{mailer.status}</span>
                </div>
                {(mailer.scheduledAt || mailer.sentAt) && (
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {(() => {
                      const d = new Date(mailer.scheduledAt ?? mailer.sentAt!);
                      const tz = { timeZone: 'Africa/Johannesburg' };
                      return d.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric', ...tz })
                        + ' · ' + d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', ...tz });
                    })()}
                  </p>
                )}
              </button>
            ))}

            {mailchimpUpcoming && mailchimpUpcoming.campaigns.length > 0 && (
              <>
                <div className="flex items-center gap-2 pt-2">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Mailchimp</span>
                  <div className="flex-1 h-px bg-border" />
                </div>
                {mailchimpUpcoming.campaigns.map(c => (
                  <div key={c.id} className="rounded-xl border border-border bg-card p-3 space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-medium text-foreground leading-snug">{c.subject}</p>
                      <span className={`shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                        c.status === 'schedule' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                      }`}>{c.status === 'schedule' ? 'scheduled' : 'draft'}</span>
                    </div>
                    {c.scheduledFor && (
                      <p className="text-[10px] text-muted-foreground">
                        {new Date(c.scheduledFor).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Africa/Johannesburg' })}
                        {' · '}
                        {new Date(c.scheduledFor).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Johannesburg' })}
                      </p>
                    )}
                    {c.listName && (
                      <p className="text-[10px] text-muted-foreground truncate">{c.listName}{c.recipientCount > 0 ? ` · ${c.recipientCount.toLocaleString()} recipients` : ''}</p>
                    )}
                  </div>
                ))}
              </>
            )}
          </div>

          {/* Right: editor */}
          {selectedMailerId ? (() => {
            const mailer = mailers.find(m => m.id === selectedMailerId);
            return (
              <div className="flex-1 min-w-0 flex flex-col gap-3 min-h-0">
                {/* Toolbar */}
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex rounded-lg border border-border overflow-hidden text-xs">
                    <button
                      onClick={() => setMailerTab('edit')}
                      className={`px-3 py-1.5 transition-colors ${mailerTab === 'edit' ? 'bg-violet-600 text-white' : 'bg-background text-foreground hover:bg-muted'}`}
                    >Edit HTML</button>
                    <button
                      onClick={() => setMailerTab('preview')}
                      className={`px-3 py-1.5 transition-colors ${mailerTab === 'preview' ? 'bg-violet-600 text-white' : 'bg-background text-foreground hover:bg-muted'}`}
                    >Preview</button>
                    <button
                      onClick={() => setMailerTab('ai')}
                      className={`px-3 py-1.5 transition-colors flex items-center gap-1 ${mailerTab === 'ai' ? 'bg-violet-600 text-white' : 'bg-background text-foreground hover:bg-muted'}`}
                    ><Bot className="w-3 h-3" />AI Edit</button>
                  </div>
                  <select
                    value={mailer?.status ?? 'draft'}
                    onChange={e => updateMailerMutation.mutate({ id: selectedMailerId, status: e.target.value as 'draft' | 'scheduled' | 'sent' })}
                    className="text-xs h-7 rounded-md border border-input bg-background px-2 cursor-pointer focus:outline-none focus:ring-1 focus:ring-violet-400"
                  >
                    <option value="draft">Draft</option>
                    <option value="scheduled">Scheduled</option>
                    <option value="sent">Sent</option>
                  </select>
                  <Button size="sm" variant="outline" className="gap-1.5 text-xs h-7" onClick={downloadMailerHtml}>
                    <Download className="w-3 h-3" />
                    Export HTML
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1.5 text-xs h-7" onClick={() => setShowSendTest(true)} disabled={!mailerDraft.htmlContent}>
                    <Send className="w-3 h-3" />
                    Send Test
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 text-xs h-7 border-violet-300 text-violet-700 hover:bg-violet-50"
                    onClick={() => setShowManageSubscribers(true)}
                  >
                    <Users className="w-3 h-3" />
                    {segmentStatus?.subscriberCount ?? 0} Subscribers
                  </Button>
                  <Button
                    size="sm"
                    className="gap-1.5 text-xs h-7 bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={() => { setBroadcastScheduledAt(mailerDraft.scheduledAt); setShowSendToList(true); }}
                    disabled={!mailerDraft.htmlContent || !mailerDraft.subject || !segmentStatus?.segmentId}
                  >
                    <Send className="w-3 h-3" />
                    Send to List
                  </Button>
                  <Button size="sm" className="bg-violet-600 hover:bg-violet-700 text-white text-xs h-7 gap-1.5 ml-auto" onClick={saveMailer} disabled={updateMailerMutation.isPending || !mailerDirty}>
                    {updateMailerMutation.isPending ? <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Check className="w-3 h-3" />}
                    Save
                  </Button>
                  <Button size="sm" variant="outline" className="text-xs h-7 text-red-600 hover:bg-red-50 border-red-200" onClick={() => { if (confirm('Delete this mailer?')) deleteMailerMutation.mutate({ id: selectedMailerId }); }}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>

                {/* Meta fields */}
                <div className="grid grid-cols-2 gap-2 shrink-0">
                  <div>
                    <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Subject</label>
                    <input
                      type="text"
                      value={mailerDraft.subject}
                      onChange={e => { setMailerDraft(d => ({ ...d, subject: e.target.value })); setMailerDirty(true); }}
                      placeholder="Email subject line"
                      className="w-full mt-1 text-xs rounded-lg border bg-background px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-violet-400"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Preview text</label>
                    <input
                      type="text"
                      value={mailerDraft.previewText}
                      onChange={e => { setMailerDraft(d => ({ ...d, previewText: e.target.value })); setMailerDirty(true); }}
                      placeholder="Preview text shown in inbox"
                      className="w-full mt-1 text-xs rounded-lg border bg-background px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-violet-400"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Scheduled date</label>
                    <input
                      type="datetime-local"
                      value={mailerDraft.scheduledAt}
                      onChange={e => { setMailerDraft(d => ({ ...d, scheduledAt: e.target.value })); setMailerDirty(true); }}
                      className="w-full mt-1 text-xs rounded-lg border bg-background px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-violet-400"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Notes</label>
                    <input
                      type="text"
                      value={mailerDraft.notes}
                      onChange={e => { setMailerDraft(d => ({ ...d, notes: e.target.value })); setMailerDirty(true); }}
                      placeholder="Internal notes"
                      className="w-full mt-1 text-xs rounded-lg border bg-background px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-violet-400"
                    />
                  </div>
                </div>

                {/* HTML editor / preview / AI */}
                <div className="flex-1 min-h-0 rounded-xl border border-border overflow-hidden">
                  {mailerTab === 'edit' ? (
                    <textarea
                      value={mailerDraft.htmlContent}
                      onChange={e => { setMailerDraft(d => ({ ...d, htmlContent: e.target.value })); setMailerDirty(true); }}
                      placeholder="Paste your HTML email code here…"
                      className="w-full h-full resize-none font-mono text-xs p-3 focus:outline-none bg-muted/30"
                      spellCheck={false}
                    />
                  ) : mailerTab === 'preview' ? (
                    <iframe
                      srcDoc={mailerDraft.htmlContent || '<p style="font-family:sans-serif;color:#999;padding:2rem">No HTML content yet</p>'}
                      className="w-full h-full border-0"
                      sandbox="allow-same-origin"
                      title="Mailer preview"
                    />
                  ) : (
                    /* AI Edit — split pane */
                    <div className="flex h-full">
                      {/* Left: live code view while streaming, preview otherwise */}
                      <div className="w-1/2 border-r border-border h-full overflow-hidden">
                        {mailerAiState === 'streaming-html' ? (
                          <pre
                            ref={mailerAiCodeRef}
                            className="w-full h-full overflow-auto bg-[#1e1e2e] text-[#cdd6f4] text-[11px] leading-relaxed font-mono p-3 m-0 whitespace-pre-wrap break-all"
                          >{mailerAiHtmlDisplay}</pre>
                        ) : (
                          <iframe
                            srcDoc={mailerDraft.htmlContent || '<p style="font-family:sans-serif;color:#999;padding:2rem">No HTML content yet</p>'}
                            className="w-full h-full border-0"
                            sandbox="allow-same-origin"
                            title="Mailer preview"
                          />
                        )}
                      </div>
                      {/* Right: chat */}
                      <div className="w-1/2 flex flex-col h-full bg-background">
                        {/* Chat header */}
                        <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
                          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                            <Bot className="w-3.5 h-3.5 text-violet-500" />
                            AI Mailer Editor
                          </div>
                          <button
                            onClick={() => { if (confirm('Clear chat history?')) mailerChatClearMutation.mutate({ mailerId: selectedMailerId! }); }}
                            className="text-[10px] text-muted-foreground hover:text-destructive transition-colors"
                          >Clear</button>
                        </div>
                        {/* Persistent action bar */}
                        {(mailerUndoStack.length > 0 || mailerRedoStack.length > 0 || mailerDirty) && (
                          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border shrink-0 bg-muted/30">
                            {mailerUndoStack.length > 0 && (
                              <button
                                onClick={() => {
                                  const prev = mailerUndoStack[mailerUndoStack.length - 1];
                                  setMailerRedoStack(s => [...s, mailerDraft.htmlContent]);
                                  setMailerUndoStack(s => s.slice(0, -1));
                                  setMailerDraft(d => ({ ...d, htmlContent: prev }));
                                  setMailerDirty(true);
                                }}
                                className="flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-0.5 hover:bg-amber-100 transition-colors"
                              >
                                <Undo2 className="w-3 h-3" />
                                Undo ({mailerUndoStack.length})
                              </button>
                            )}
                            {mailerRedoStack.length > 0 && (
                              <button
                                onClick={() => {
                                  const next = mailerRedoStack[mailerRedoStack.length - 1];
                                  setMailerUndoStack(s => [...s, mailerDraft.htmlContent]);
                                  setMailerRedoStack(s => s.slice(0, -1));
                                  setMailerDraft(d => ({ ...d, htmlContent: next }));
                                  setMailerDirty(true);
                                }}
                                className="flex items-center gap-1 text-[11px] font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-2 py-0.5 hover:bg-blue-100 transition-colors"
                              >
                                <Undo2 className="w-3 h-3 scale-x-[-1]" />
                                Redo ({mailerRedoStack.length})
                              </button>
                            )}
                            {mailerDirty && (
                              <span className="text-[11px] text-muted-foreground">· Unsaved changes</span>
                            )}
                            {mailerDirty && (
                              <button
                                onClick={saveMailer}
                                disabled={updateMailerMutation.isPending}
                                className="ml-auto flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-0.5 hover:bg-emerald-100 transition-colors disabled:opacity-50"
                              >
                                {updateMailerMutation.isPending ? 'Saving…' : 'Save'}
                              </button>
                            )}
                          </div>
                        )}
                        {/* Messages */}
                        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 min-h-0">
                          {mailerAiMessages.length === 0 && mailerAiState === 'idle' && (
                            <div className="text-xs text-muted-foreground text-center py-8">
                              <Bot className="w-8 h-8 mx-auto mb-2 text-violet-300" />
                              <p className="font-medium mb-1">AI has full context of this campaign</p>
                              <p className="text-[11px]">Describe changes you want and the AI will rewrite the HTML for you.</p>
                            </div>
                          )}
                          {mailerAiMessages.map((msg, i) => {
                            const isLastAssistant = msg.role === 'assistant' && i === mailerAiMessages.length - 1;
                            const isStreaming = isLastAssistant && (mailerAiState === 'streaming-text' || mailerAiState === 'streaming-html' || mailerAiState === 'thinking');
                            // Check for [HTML updated] marker (new format) or raw HTML (old DB format)
                            const hasHtmlMarker = msg.role === 'assistant' && msg.content.endsWith('\n[HTML updated]');
                            const hasOldHtml = !hasHtmlMarker && msg.role === 'assistant' && /<!doctype html/i.test(msg.content);
                            const showAppliedBadge = hasHtmlMarker || hasOldHtml;
                            const displayText = hasHtmlMarker
                              ? msg.content.slice(0, -'\n[HTML updated]'.length).trim() || '(HTML updated — see preview)'
                              : hasOldHtml
                                ? msg.content.slice(0, msg.content.toLowerCase().indexOf('<!doctype html')).trim() || '(HTML updated — see preview)'
                                : msg.content;
                            return (
                              <div key={i} className={`flex flex-col gap-1 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                                <div className={`max-w-[90%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                                  msg.role === 'user'
                                    ? 'bg-violet-600 text-white rounded-br-sm'
                                    : 'bg-muted text-foreground rounded-bl-sm'
                                }`}>
                                  {mailerAiState === 'thinking' && isStreaming ? (
                                    <span className="flex items-center gap-2 text-muted-foreground">
                                      <span className="w-3 h-3 border-2 border-violet-400 border-t-transparent rounded-full animate-spin shrink-0" />
                                      Thinking…
                                    </span>
                                  ) : displayText || '\u00A0'}
                                </div>
                                {/* Streaming-html pill below frozen bubble */}
                                {isStreaming && mailerAiState === 'streaming-html' && (
                                  <span className="flex items-center gap-1.5 text-[11px] font-medium text-violet-500 bg-violet-50 border border-violet-200 rounded-lg px-2.5 py-1">
                                    <span className="w-3 h-3 border-2 border-violet-400 border-t-transparent rounded-full animate-spin shrink-0" />
                                    Rewriting HTML…
                                  </span>
                                )}
                                {/* Applied badge for completed HTML messages */}
                                {!isStreaming && showAppliedBadge && (
                                  <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1">
                                    <Check className="w-3 h-3" />
                                    Applied to preview
                                  </span>
                                )}
                              </div>
                            );
                          })}
                          <div ref={mailerAiBottomRef} />
                        </div>
                        {/* Input */}
                        <div className="border-t border-border p-2 shrink-0">
                          <div className="flex gap-2 items-end">
                            <textarea
                              value={mailerAiInput}
                              onChange={e => setMailerAiInput(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                  e.preventDefault();
                                  sendMailerAiMessage();
                                }
                              }}
                              placeholder="Describe changes… (Enter to send)"
                              rows={2}
                              className="flex-1 resize-none text-xs rounded-lg border bg-background px-2.5 py-2 focus:outline-none focus:ring-1 focus:ring-violet-400"
                            />
                            <button
                              onClick={sendMailerAiMessage}
                              disabled={mailerAiState !== 'idle' || !mailerAiInput.trim()}
                              className="shrink-0 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white p-2 transition-colors"
                            >
                              <Send className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })() : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
              Select a mailer or create a new one
            </div>
          )}
        </TabsContent>

        {/* ── Generate Mailer Dialog ───────────────────────────────────── */}
        <Dialog open={showGenerateMailer} onOpenChange={setShowGenerateMailer}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-violet-600" />
                Generate Mailer
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Purpose / notes for the AI <span className="font-normal normal-case">(optional)</span></label>
                <input
                  type="text"
                  value={generatePurpose}
                  onChange={e => setGeneratePurpose(e.target.value)}
                  placeholder="e.g. Monthly newsletter, product launch announcement, seasonal promotion…"
                  className="w-full mt-1.5 text-sm rounded-lg border bg-background px-3 py-2 focus:outline-none focus:ring-1 focus:ring-violet-400"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Logo URL <span className="font-normal normal-case">(paste a direct image link, or leave blank)</span></label>
                <input
                  type="url"
                  value={generateLogoUrl}
                  onChange={e => setGenerateLogoUrl(e.target.value)}
                  placeholder="https://example.com/logo.png"
                  className="w-full mt-1.5 text-sm rounded-lg border bg-background px-3 py-2 focus:outline-none focus:ring-1 focus:ring-violet-400"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Hero image <span className="font-normal normal-case">(pick a generated post image, or skip)</span></label>
                <div className="flex flex-wrap gap-2 mt-2">
                  <button
                    onClick={() => setGenerateHeroUrl(null)}
                    className={`w-14 h-14 rounded-lg border-2 flex items-center justify-center text-[10px] text-muted-foreground transition-colors ${generateHeroUrl === null ? 'border-violet-500 bg-violet-50' : 'border-border bg-muted hover:bg-muted/80'}`}
                  >
                    None
                  </button>
                  {posts.filter(p => p.imageUrl).map(p => (
                    <button
                      key={p.id}
                      onClick={() => setGenerateHeroUrl(p.imageUrl!)}
                      className={`w-14 h-14 rounded-lg border-2 overflow-hidden transition-colors ${generateHeroUrl === p.imageUrl ? 'border-violet-500' : 'border-border hover:border-violet-300'}`}
                      title={p.caption?.slice(0, 60)}
                    >
                      <img src={p.imageUrl!} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                  {posts.filter(p => p.imageUrl).length === 0 && (
                    <p className="text-xs text-muted-foreground self-center">No post images generated yet — generate some in the Content tab first.</p>
                  )}
                </div>
              </div>
              <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
                The AI will use your campaign strategy, brand voice, audience, and brand assets to write copy and design the email. If no logo URL is provided, a <strong>text logo placeholder</strong> is used — you can paste the URL into the HTML afterwards.
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowGenerateMailer(false)}>Cancel</Button>
              <Button
                className="bg-violet-600 hover:bg-violet-700 text-white gap-2"
                onClick={() => generateMailerMutation.mutate({ campaignId, heroImageUrl: generateHeroUrl, purpose: generatePurpose || undefined, logoUrl: generateLogoUrl || undefined })}
                disabled={generateMailerMutation.isPending}
              >
                {generateMailerMutation.isPending ? (
                  <><span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />Generating…</>
                ) : (
                  <><Sparkles className="w-3.5 h-3.5" />Generate</>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Send Test Dialog ─────────────────────────────────────────── */}
        <Dialog open={showSendTest} onOpenChange={setShowSendTest}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Send className="w-4 h-4 text-violet-600" />
                Send Test Email
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Recipients</label>
                <div className="mt-1.5 min-h-[42px] flex flex-wrap gap-1.5 rounded-lg border bg-background px-2.5 py-2 focus-within:ring-1 focus-within:ring-violet-400">
                  {testEmails.map(email => (
                    <span key={email} className="inline-flex items-center gap-1 bg-violet-100 text-violet-800 text-xs rounded-full px-2.5 py-1">
                      {email}
                      <button onClick={() => updateTestEmails(testEmails.filter(e => e !== email))} className="hover:text-violet-600">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                  <input
                    type="email"
                    value={testEmailInput}
                    onChange={e => setTestEmailInput(e.target.value)}
                    onKeyDown={e => {
                      if ((e.key === 'Enter' || e.key === ',') && testEmailInput.trim()) {
                        e.preventDefault();
                        const email = testEmailInput.trim().replace(/,$/, '');
                        if (email && !testEmails.includes(email)) updateTestEmails([...testEmails, email]);
                        setTestEmailInput('');
                      }
                      if (e.key === 'Backspace' && !testEmailInput && testEmails.length) {
                        updateTestEmails(testEmails.slice(0, -1));
                      }
                    }}
                    onBlur={() => {
                      const email = testEmailInput.trim();
                      if (email && !testEmails.includes(email)) updateTestEmails([...testEmails, email]);
                      setTestEmailInput('');
                    }}
                    placeholder={testEmails.length === 0 ? 'Type an email and press Enter…' : ''}
                    className="flex-1 min-w-[160px] text-sm bg-transparent outline-none"
                  />
                </div>
                <p className="mt-1.5 text-[11px] text-muted-foreground">Press Enter or comma to add each address. Up to 10 recipients.</p>
              </div>
              <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
                The subject will be prefixed with <strong>[TEST]</strong> so recipients know it's a preview.
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowSendTest(false)}>Cancel</Button>
              <Button
                className="bg-violet-600 hover:bg-violet-700 text-white gap-2"
                onClick={() => selectedMailerId && sendTestMutation.mutate({ mailerId: selectedMailerId, emails: testEmails })}
                disabled={testEmails.length === 0 || sendTestMutation.isPending}
              >
                {sendTestMutation.isPending ? (
                  <><span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />Sending…</>
                ) : (
                  <><Send className="w-3.5 h-3.5" />Send to {testEmails.length || ''} {testEmails.length === 1 ? 'recipient' : 'recipients'}</>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Manage Subscribers Dialog ──────────────────────────────── */}
        <Dialog open={showManageSubscribers} onOpenChange={setShowManageSubscribers}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Subscriber List</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {/* CSV import */}
              <div className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Import CSV</p>
                  <button
                    type="button"
                    onClick={() => csvFileRef.current?.click()}
                    className="text-[11px] text-violet-600 hover:underline"
                  >
                    Choose file
                  </button>
                  <input ref={csvFileRef} type="file" accept=".csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleCsvFile(f); e.target.value = ''; }} />
                </div>
                {csvPreview ? (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">{csvFileName} — <strong>{csvPreview.length} contact{csvPreview.length !== 1 ? 's' : ''}</strong> found</p>
                    <div className="max-h-28 overflow-y-auto rounded border divide-y text-xs">
                      {csvPreview.slice(0, 5).map((c, i) => (
                        <div key={i} className="px-2 py-1 flex gap-2">
                          <span className="font-medium truncate">{c.firstName || c.lastName ? `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim() : c.email}</span>
                          {(c.firstName || c.lastName) && <span className="text-muted-foreground truncate">{c.email}</span>}
                        </div>
                      ))}
                      {csvPreview.length > 5 && <div className="px-2 py-1 text-muted-foreground">+{csvPreview.length - 5} more…</div>}
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" className="text-xs h-7 bg-violet-600 hover:bg-violet-700 text-white flex-1" onClick={() => importSubscribersMutation.mutate({ clientSlug, clientName: campaign?.name ?? clientSlug, contacts: csvPreview })} disabled={importSubscribersMutation.isPending}>
                        {importSubscribersMutation.isPending ? <><span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> Importing…</> : `Import ${csvPreview.length} contacts`}
                      </Button>
                      <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => { setCsvPreview(null); setCsvFileName(''); }}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground">CSV must have an <code>email</code> column. Optional: <code>first_name</code>, <code>last_name</code>.</p>
                )}
              </div>

              {/* Paste emails */}
              <div className="rounded-lg border p-3 space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Paste Emails</p>
                <textarea
                  placeholder={"Paste emails here, one per line or comma-separated:\nuser@example.com\nanother@example.com"}
                  value={pasteEmailsText}
                  onChange={e => setPasteEmailsText(e.target.value)}
                  rows={4}
                  className="w-full text-xs rounded-lg border bg-background px-2.5 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-violet-400"
                />
                {(() => {
                  const emails = pasteEmailsText
                    .split(/[\n,;]+/)
                    .map(e => e.trim().toLowerCase())
                    .filter(e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
                  if (!pasteEmailsText.trim() || emails.length === 0) return null;
                  return (
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] text-muted-foreground"><strong>{emails.length}</strong> valid email{emails.length !== 1 ? 's' : ''} found</p>
                      <Button
                        size="sm"
                        className="text-xs h-7 bg-violet-600 hover:bg-violet-700 text-white"
                        disabled={importSubscribersMutation.isPending}
                        onClick={() => importSubscribersMutation.mutate(
                          { clientSlug, clientName: campaign?.name ?? clientSlug, contacts: emails.map(email => ({ email })) },
                          { onSuccess: () => setPasteEmailsText('') }
                        )}
                      >
                        {importSubscribersMutation.isPending ? <><span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> Importing…</> : `Import ${emails.length}`}
                      </Button>
                    </div>
                  );
                })()}
              </div>

              {/* Add subscriber form */}
              <div className="rounded-lg border p-3 space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Add Subscriber</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="First name"
                    value={subscriberFirstName}
                    onChange={e => setSubscriberFirstName(e.target.value)}
                    className="flex-1 text-xs rounded-lg border bg-background px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-violet-400"
                  />
                  <input
                    type="text"
                    placeholder="Last name"
                    value={subscriberLastName}
                    onChange={e => setSubscriberLastName(e.target.value)}
                    className="flex-1 text-xs rounded-lg border bg-background px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-violet-400"
                  />
                </div>
                <div className="flex gap-2">
                  <input
                    type="email"
                    placeholder="email@example.com"
                    value={subscriberInput}
                    onChange={e => setSubscriberInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && subscriberInput.trim()) {
                        e.preventDefault();
                        addSubscriberMutation.mutate({ clientSlug, clientName: campaign?.name ?? clientSlug, email: subscriberInput.trim(), firstName: subscriberFirstName || undefined, lastName: subscriberLastName || undefined });
                      }
                    }}
                    className="flex-1 text-xs rounded-lg border bg-background px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-violet-400"
                  />
                  <Button
                    size="sm"
                    className="text-xs h-7 bg-violet-600 hover:bg-violet-700 text-white"
                    onClick={() => addSubscriberMutation.mutate({ clientSlug, clientName: campaign?.name ?? clientSlug, email: subscriberInput.trim(), firstName: subscriberFirstName || undefined, lastName: subscriberLastName || undefined })}
                    disabled={!subscriberInput.trim() || addSubscriberMutation.isPending}
                  >
                    Add
                  </Button>
                </div>
              </div>

              {/* Subscriber list */}
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {subscribers.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">No subscribers yet.</p>
                ) : subscribers.map(s => (
                  <div key={s.id} className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 hover:bg-muted/50 group">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{s.first_name || s.last_name ? `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim() : s.email}</p>
                      {(s.first_name || s.last_name) && <p className="text-[10px] text-muted-foreground truncate">{s.email}</p>}
                    </div>
                    {s.unsubscribed && <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">Unsubscribed</span>}
                    <button
                      onClick={() => removeSubscriberMutation.mutate({ clientSlug, email: s.email })}
                      disabled={removeSubscriberMutation.isPending}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-50 hover:text-red-600 text-muted-foreground transition-all"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">{segmentStatus?.subscriberCount ?? 0} total subscriber{segmentStatus?.subscriberCount === 1 ? '' : 's'} · Unsubscribes are handled automatically by Resend.</p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowManageSubscribers(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Send to List Dialog ─────────────────────────────────────── */}
        <Dialog open={showSendToList} onOpenChange={setShowSendToList}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Send to Subscriber List</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="rounded-lg border bg-muted/40 p-3 space-y-1">
                <p className="text-xs text-muted-foreground">Subject</p>
                <p className="text-sm font-medium">{mailerDraft.subject}</p>
              </div>
              <div className="rounded-lg border bg-muted/40 p-3 space-y-1">
                <p className="text-xs text-muted-foreground">Recipients</p>
                <p className="text-sm font-medium">{segmentStatus?.subscriberCount ?? 0} subscriber{segmentStatus?.subscriberCount === 1 ? '' : 's'}</p>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Schedule send (optional)</label>
                <input
                  type="datetime-local"
                  value={broadcastScheduledAt}
                  onChange={e => setBroadcastScheduledAt(e.target.value)}
                  className="w-full mt-1.5 text-xs rounded-lg border bg-background px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-violet-400"
                />
                <p className="text-[11px] text-muted-foreground mt-1">Leave blank to send immediately.</p>
              </div>
              {(segmentStatus?.subscriberCount ?? 0) === 0 && (
                <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">No subscribers on this list yet. Add subscribers first.</p>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowSendToList(false)}>Cancel</Button>
              <Button
                className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
                onClick={() => selectedMailerId && broadcastMutation.mutate({ mailerId: selectedMailerId, clientSlug, scheduledAt: broadcastScheduledAt ? new Date(broadcastScheduledAt).toISOString() : undefined })}
                disabled={broadcastMutation.isPending || (segmentStatus?.subscriberCount ?? 0) === 0}
              >
                {broadcastMutation.isPending ? (
                  <><span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />Sending…</>
                ) : broadcastScheduledAt ? (
                  <><Mail className="w-3.5 h-3.5" />Schedule Send</>
                ) : (
                  <><Send className="w-3.5 h-3.5" />Send Now</>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Calendar Tab ─────────────────────────────────────────────── */}
        <TabsContent value="calendar" className="flex-1 overflow-y-auto mt-0">
          {/* Legend */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-4 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Legend:</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: '#ec4899' }} />Instagram</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: '#1d4ed8' }} />Facebook</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: '#0a66c2' }} />LinkedIn</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: '#f59e0b' }} />Scheduled email</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: '#10b981' }} />Sent email</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: '#6366f1' }} />Scheduled post</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: '#9ca3af' }} />Draft</span>
          </div>
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
                  setAnalyticsPostId(info.event.extendedProps.postId);
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
          ) : !perfData?.rows.length && perfPlatform !== 'mailers' && perfPlatform !== 'mailchimp' ? (
            <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
              <TrendingUp className="w-8 h-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">No published posts yet — analytics will appear here once posts are live.</p>
            </div>
          ) : (() => {
            const isFbView = perfPlatform === 'fb';

            // ── Shared platform filter tabs ──
            const platformTabs = (
              <div className="flex items-center gap-2">
                {([
                  { key: "all" as const, label: "All platforms", activeClass: 'bg-foreground text-background border-foreground' },
                  { key: "ig" as const,  label: "Instagram",     activeClass: 'bg-pink-500 text-white border-pink-500' },
                  { key: "fb" as const,  label: "Facebook",      activeClass: 'bg-blue-600 text-white border-blue-600' },
                  { key: "li" as const,  label: "LinkedIn",      activeClass: 'bg-[#0a66c2] text-white border-[#0a66c2]' },
                  { key: "mailers" as const,   label: "Mailers",    activeClass: 'bg-emerald-600 text-white border-emerald-600' },
                  { key: "mailchimp" as const, label: "Mailchimp",  activeClass: 'bg-[#FFE01B] text-[#241C15] border-[#FFE01B]' },
                ]).map(opt => (
                  <button
                    key={opt.key}
                    onClick={() => setPerfPlatform(opt.key as any)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                      perfPlatform === opt.key
                        ? opt.activeClass
                        : 'bg-card text-muted-foreground border-border hover:border-foreground'
                    }`}
                  >
                    {opt.label}
                    {opt.key !== 'all' && opt.key !== 'mailers' && perfData && (
                      <span className="ml-1.5 opacity-70">
                        {opt.key === 'ig'
                          ? perfData.rows.filter(r => r.post.instagramPostId).length
                          : opt.key === 'fb'
                          ? perfData.rows.filter(r => r.post.facebookPostId).length
                          : perfData.rows.filter(r => (r.post as any).linkedinPostId).length}
                      </span>
                    )}
                  </button>
                ))}
                {perfPlatform === 'fb' && (
                  <span className="text-[10px] text-muted-foreground ml-1">Views &amp; clicks — data may take a few hours after posting</span>
                )}
              </div>
            );

            // ── Mailers analytics view ──
            if (perfPlatform === 'mailchimp') {
              if (mailchimpLoading) return (
                <div className="space-y-4">
                  {platformTabs}
                  <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
                    <span className="w-4 h-4 border-2 border-[#FFE01B] border-t-transparent rounded-full animate-spin" />
                    <span className="text-sm">Fetching Mailchimp analytics…</span>
                  </div>
                </div>
              );
              const mcRows = mailchimpData?.campaigns ?? [];
              const totalSent = mcRows.reduce((s, r) => s + r.emailsSent, 0);
              const totalOpens = mcRows.reduce((s, r) => s + r.opens, 0);
              const totalClicks = mcRows.reduce((s, r) => s + r.clicks, 0);
              const avgOpenRate = mcRows.length > 0 ? (mcRows.reduce((s, r) => s + r.openRate, 0) / mcRows.length * 100).toFixed(1) : null;
              const avgClickRate = mcRows.length > 0 ? (mcRows.reduce((s, r) => s + r.clickRate, 0) / mcRows.length * 100).toFixed(1) : null;

              if (!mcRows.length) return (
                <div className="space-y-4">
                  {platformTabs}
                  <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
                    <p className="text-sm font-medium">No Mailchimp campaigns found</p>
                    <p className="text-xs text-muted-foreground">Set the Mailchimp API key in the client's <strong>Connections</strong> tab.</p>
                  </div>
                </div>
              );

              return (
                <div className="space-y-4">
                  {platformTabs}
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                    {[
                      { label: 'Sent', value: totalSent > 0 ? totalSent.toLocaleString() : '—', color: 'text-foreground' },
                      { label: 'Opens', value: totalOpens.toLocaleString(), color: 'text-emerald-600' },
                      { label: 'Open Rate', value: avgOpenRate ? `${avgOpenRate}%` : '—', color: 'text-emerald-600' },
                      { label: 'Clicks', value: totalClicks.toLocaleString(), color: 'text-blue-600' },
                      { label: 'Click Rate', value: avgClickRate ? `${avgClickRate}%` : '—', color: 'text-blue-600' },
                    ].map(c => (
                      <div key={c.label} className="rounded-xl border bg-card px-3 py-2.5 text-center">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{c.label}</p>
                        <p className={`text-xl font-bold mt-0.5 ${c.color}`}>{c.value}</p>
                      </div>
                    ))}
                  </div>
                  <div className="rounded-xl border overflow-hidden">
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="bg-muted/50 border-b">
                          <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Subject</th>
                          <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Recipients</th>
                          <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-emerald-600">Opens</th>
                          <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-emerald-600">Open Rate</th>
                          <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-blue-600">Clicks</th>
                          <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-blue-600">Click Rate</th>
                        </tr>
                      </thead>
                      <tbody>
                        {mcRows.map(row => {
                          const sentDate = row.sendTime
                            ? new Date(row.sendTime).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Johannesburg' })
                            : null;
                          return (
                            <tr key={row.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                              <td className="px-3 py-3">
                                <p className="text-xs font-medium">{row.subject}</p>
                                {sentDate && <p className="text-[10px] text-muted-foreground mt-0.5">Sent {sentDate}</p>}
                              </td>
                              <td className="px-3 py-3 text-right tabular-nums text-foreground">{row.emailsSent > 0 ? row.emailsSent.toLocaleString() : '—'}</td>
                              <td className="px-3 py-3 text-right tabular-nums text-emerald-600 font-semibold">{row.opens.toLocaleString()}</td>
                              <td className="px-3 py-3 text-right tabular-nums text-emerald-600">{(row.openRate * 100).toFixed(1)}%</td>
                              <td className="px-3 py-3 text-right tabular-nums text-blue-600 font-semibold">{row.clicks.toLocaleString()}</td>
                              <td className="px-3 py-3 text-right tabular-nums text-blue-600">{(row.clickRate * 100).toFixed(1)}%</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            }

            if (perfPlatform === 'mailers') {
              if (mailerAnalyticsLoading) return (
                <div className="space-y-4">
                  {platformTabs}
                  <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
                    <span className="w-4 h-4 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
                    <span className="text-sm">Fetching mailer analytics…</span>
                  </div>
                </div>
              );
              const rows = mailerAnalytics ?? [];
              // Summary stats only from sent mailers with known recipient counts
              const sentRows = rows.filter(r => r.mailer.status === 'sent');
              const ratedRows = sentRows.filter(r => r.sentCount > 0);
              const totalSent = ratedRows.reduce((s, r) => s + r.sentCount, 0);
              const totalOpens = sentRows.reduce((s, r) => s + r.opens, 0);
              const totalClicks = sentRows.reduce((s, r) => s + r.clicks, 0);
              const avgOpenRate = totalSent > 0 ? ((ratedRows.reduce((s, r) => s + r.opens, 0) / totalSent) * 100).toFixed(1) : null;
              const avgClickRate = totalSent > 0 ? ((ratedRows.reduce((s, r) => s + r.clicks, 0) / totalSent) * 100).toFixed(1) : null;

              if (!rows.length) return (
                <div className="space-y-4">
                  {platformTabs}
                  <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
                    <p className="text-sm text-muted-foreground">No mailers yet — analytics will appear here once emails have been sent.</p>
                  </div>
                </div>
              );

              return (
                <div className="space-y-4">
                  {platformTabs}
                  {/* Summary cards — sent mailers only */}
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                    {[
                      { label: 'Sent', value: totalSent > 0 ? totalSent.toLocaleString() : '—', color: 'text-foreground' },
                      { label: 'Opens', value: totalOpens.toLocaleString(), color: 'text-emerald-600' },
                      { label: 'Open Rate', value: avgOpenRate ? `${avgOpenRate}%` : '—', color: 'text-emerald-600' },
                      { label: 'Clicks', value: totalClicks.toLocaleString(), color: 'text-blue-600' },
                      { label: 'Click Rate', value: avgClickRate ? `${avgClickRate}%` : '—', color: 'text-blue-600' },
                    ].map(c => (
                      <div key={c.label} className="rounded-xl border bg-card px-3 py-2.5 text-center">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{c.label}</p>
                        <p className={`text-xl font-bold mt-0.5 ${c.color}`}>{c.value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Per-mailer table */}
                  <div className="rounded-xl border overflow-hidden">
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="bg-muted/50 border-b">
                          <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Subject</th>
                          <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                          <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Recipients</th>
                          <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-emerald-600">Opens</th>
                          <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-emerald-600">Open Rate</th>
                          <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-blue-600">Clicks</th>
                          <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-blue-600">Click Rate</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map(row => {
                          const isSent = row.mailer.status === 'sent';
                          const openRate = row.sentCount > 0 ? ((row.opens / row.sentCount) * 100).toFixed(1) : null;
                          const clickRate = row.sentCount > 0 ? ((row.clicks / row.sentCount) * 100).toFixed(1) : null;
                          const schedDate = row.mailer.scheduledAt
                            ? new Date(row.mailer.scheduledAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', timeZone: 'Africa/Johannesburg' })
                            : null;
                          const sentDate = row.mailer.sentAt
                            ? new Date(row.mailer.sentAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Johannesburg' })
                            : null;
                          return (
                            <tr key={row.mailer.id} className={`border-b last:border-0 transition-colors ${isSent ? 'hover:bg-muted/30' : 'opacity-60 hover:opacity-80 hover:bg-muted/20'}`}>
                              <td className="px-3 py-3">
                                <p className="text-xs font-medium">{row.mailer.subject || '(No subject)'}</p>
                                {sentDate && <p className="text-[10px] text-muted-foreground mt-0.5">Sent {sentDate}</p>}
                              </td>
                              <td className="px-3 py-3">
                                {isSent
                                  ? <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">Sent</span>
                                  : row.mailer.status === 'scheduled'
                                    ? <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">Scheduled{schedDate ? ` ${schedDate}` : ''}</span>
                                    : <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">Draft</span>
                                }
                              </td>
                              <td className="px-3 py-3 text-right tabular-nums text-foreground">{isSent ? (row.sentCount > 0 ? row.sentCount.toLocaleString() : '—') : '—'}</td>
                              <td className="px-3 py-3 text-right tabular-nums text-emerald-600 font-semibold">{isSent ? row.opens.toLocaleString() : '—'}</td>
                              <td className="px-3 py-3 text-right tabular-nums text-emerald-600">{isSent ? (openRate ? `${openRate}%` : '—') : '—'}</td>
                              <td className="px-3 py-3 text-right tabular-nums text-blue-600 font-semibold">{isSent ? row.clicks.toLocaleString() : '—'}</td>
                              <td className="px-3 py-3 text-right tabular-nums text-blue-600">{isSent ? (clickRate ? `${clickRate}%` : '—') : '—'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            }

            if (!perfData) return null;

            const METRICS: { key: keyof typeof perfData.rows[0]["insights"]; label: string; color: string }[] = [
              { key: "reach",             label: isFbView ? "Reach (imp)" : "Reach",     color: "text-violet-600"  },
              { key: "likes",             label: isFbView ? "Reactions"   : "Likes",     color: "text-pink-600"    },
              { key: "comments",          label: "Comments",     color: "text-amber-600"   },
              { key: "shares",            label: "Shares",       color: "text-emerald-600" },
              { key: "saved",             label: isFbView ? "—" : "Saves", color: "text-indigo-600"  },
              { key: "totalInteractions", label: "Interactions", color: "text-blue-600"    },
            ];

            // Platform filter
            const filteredRows = perfData.rows
              .filter(row => {
                if (perfPlatform === 'ig') return !!row.post.instagramPostId;
                if (perfPlatform === 'fb') return !!row.post.facebookPostId;
                if (perfPlatform === 'li') return !!(row.post as any).linkedinPostId;
                return true;
              })
              .map(row => {
                if (perfPlatform === 'fb') {
                  if (row.fbInsights) {
                    const fb = row.fbInsights;
                    return { ...row, insights: {
                      reach: fb.reach, likes: fb.reactions, comments: fb.clicks, // clicks = comments in basic mode
                      shares: fb.shares, saved: 0,
                      totalInteractions: fb.reactions + fb.shares + fb.clicks,
                    }};
                  }
                  // No FB data at all — show zeros, never show IG numbers
                  return { ...row, insights: { reach: 0, likes: 0, comments: 0, shares: 0, saved: 0, totalInteractions: 0 } };
                }
                return row;
              });

            // Normalise each metric to 0–1 relative to best post, average → 0–100 composite
            const maxVals = Object.fromEntries(
              METRICS.map(m => [m.key, Math.max(1, ...filteredRows.map(r => (r.insights[m.key] as number | null) ?? 0))])
            );
            const withScores = filteredRows.map(row => {
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
              total: filteredRows.reduce((s, r) => s + ((r.insights[m.key] as number | null) ?? 0), 0),
            }));

            const totalReach = filteredRows.reduce((s, r) => s + r.insights.reach, 0);
            const totalInteractions = filteredRows.reduce((s, r) => s + r.insights.totalInteractions, 0);
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
                {/* ── Platform filter ── */}
                {platformTabs}

                {filteredRows.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center gap-2">
                    <p className="text-sm text-muted-foreground">No posts posted to {perfPlatform === 'ig' ? 'Instagram' : perfPlatform === 'fb' ? 'Facebook' : perfPlatform === 'li' ? 'LinkedIn' : 'any platform'} yet.</p>
                  </div>
                ) : (<>

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
                    Avg engagement rate across {filteredRows.length} post{filteredRows.length !== 1 ? "s" : ""}: <span className="font-semibold text-foreground">{avgEngRate}%</span>
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
                                      onClick={() => { const imgs = posts.filter(p => p.imageUrl).map(p => p.imageUrl!); setLightboxImages(imgs); setLightboxUrl(post.imageUrl!); }}
                                    />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center">
                                      <ImageIcon className="w-4 h-4 text-muted-foreground/40" />
                                    </div>
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-xs font-medium line-clamp-2 leading-snug">{post.caption ?? "—"}</p>
                                  <div className="flex items-center gap-1 mt-1 flex-wrap">
                                    {post.scheduledAt && (
                                      <p className="text-[10px] text-muted-foreground">
                                        {new Date(post.scheduledAt).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}
                                      </p>
                                    )}
                                    {post.instagramPostId && <span className="inline-flex px-1 py-px rounded text-[9px] font-bold bg-pink-100 text-pink-700">IG</span>}
                                    {post.facebookPostId && <span className="inline-flex px-1 py-px rounded text-[9px] font-bold bg-blue-100 text-blue-700">FB</span>}
                                    {!post.instagramPostId && post.facebookPostId && (
                                      <span className="text-[9px] text-blue-500">metrics from FB</span>
                                    )}
                                  </div>
                                  {row.fbInsights && post.instagramPostId && (
                                    <p className="text-[9px] text-blue-600 mt-0.5">FB: {row.fbInsights.reach.toLocaleString()} reach · {row.fbInsights.reactions.toLocaleString()} reactions · {row.fbInsights.shares.toLocaleString()} shares</p>
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
                </>)}
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
          {lightboxHasPrev && (
            <button
              className="absolute left-4 top-1/2 -translate-y-1/2 text-white/80 hover:text-white bg-black/40 hover:bg-black/60 rounded-full p-2 transition-colors"
              onClick={e => { e.stopPropagation(); setLightboxUrl(lightboxImages[lightboxIdx - 1]); }}
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
          )}
          {lightboxHasNext && (
            <button
              className="absolute right-4 top-1/2 -translate-y-1/2 text-white/80 hover:text-white bg-black/40 hover:bg-black/60 rounded-full p-2 transition-colors"
              onClick={e => { e.stopPropagation(); setLightboxUrl(lightboxImages[lightboxIdx + 1]); }}
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          )}
          {lightboxImages.length > 1 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/60 text-sm tabular-nums">
              {lightboxIdx + 1} / {lightboxImages.length}
            </div>
          )}
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
        <DialogContent className="max-w-sm p-0 overflow-hidden gap-0" showCloseButton={false}>
          {analyticsPost && (
            <>
              {/* ── Media ── */}
              <div className="relative aspect-square bg-muted">
                {analyticsPost.mediaType === "video" && analyticsPost.videoUrl ? (
                  <video src={analyticsPost.videoUrl} className="w-full h-full object-cover" controls preload="metadata" />
                ) : analyticsPost.imageUrl ? (
                  <img src={analyticsPost.imageUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <ImageIcon className="w-10 h-10 text-muted-foreground/30" />
                  </div>
                )}
                {/* Overlaid UI */}
                <button
                  className="absolute top-3 right-3 text-white/90 hover:text-white bg-black/40 hover:bg-black/60 rounded-full p-1.5 transition-colors"
                  onClick={() => setAnalyticsPostId(null)}
                >
                  <X className="w-4 h-4" />
                </button>
                <div className="absolute top-3 left-3">
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${POST_STATUS_COLORS[analyticsPost.status] ?? ""}`}>
                    {analyticsPost.status}
                  </span>
                </div>
              </div>

              {/* ── Post info ── */}
              <div className="p-4 space-y-3 max-h-[50vh] overflow-y-auto">
                {analyticsPost.scheduledAt && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <CalendarDays className="w-3 h-3" />
                    {new Date(analyticsPost.scheduledAt).toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                    {" · "}
                    {new Date(analyticsPost.scheduledAt).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                )}
                {analyticsPost.theme && (
                  <p className="text-[10px] font-semibold text-violet-600 uppercase tracking-wider">{analyticsPost.theme}</p>
                )}
                {analyticsPost.caption && (
                  <p className="text-sm leading-relaxed text-foreground">{analyticsPost.caption}</p>
                )}
                {analyticsPost.hashtags && (
                  <p className="text-xs text-violet-500 leading-relaxed">{analyticsPost.hashtags}</p>
                )}

                {/* ── Analytics (posted only) ── */}
                {analyticsPost.status === "posted" && analyticsPost.instagramPostId && (
                  <div className="border-t pt-3 space-y-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                      <BarChart2 className="w-3 h-3" /> Performance
                    </p>
                    {insightsLoading ? (
                      <div className="flex items-center gap-2 py-3 text-muted-foreground">
                        <span className="w-3.5 h-3.5 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
                        <span className="text-xs">Fetching live data…</span>
                      </div>
                    ) : insights ? (
                      <>
                        <div className="grid grid-cols-2 gap-2">
                          {([
                            { icon: Users,         label: "Reach",          value: insights.reach,             color: "text-violet-600",  bg: "bg-violet-50"  },
                            insights.plays !== null && { icon: RefreshCw,   label: "Plays",          value: insights.plays!,            color: "text-purple-600",  bg: "bg-purple-50"  },
                            { icon: Heart,         label: "Likes",          value: insights.likes,             color: "text-pink-600",    bg: "bg-pink-50"    },
                            { icon: MessageCircle, label: "Comments",       value: insights.comments,          color: "text-amber-600",   bg: "bg-amber-50"   },
                            { icon: Share2,        label: "Shares",         value: insights.shares,            color: "text-emerald-600", bg: "bg-emerald-50" },
                            { icon: Bookmark,      label: "Saves",          value: insights.saved,             color: "text-indigo-600",  bg: "bg-indigo-50"  },
                            insights.profileVisits !== null && { icon: UserCheck, label: "Profile Visits", value: insights.profileVisits!,  color: "text-teal-600",  bg: "bg-teal-50"  },
                            insights.follows !== null && { icon: Users,     label: "New Follows",    value: insights.follows!,          color: "text-cyan-600",    bg: "bg-cyan-50"    },
                          ] as const).filter(Boolean).map((item) => {
                            if (!item) return null;
                            const { icon: Icon, label, value, color, bg } = item as { icon: React.ElementType; label: string; value: number; color: string; bg: string };
                            return (
                              <div key={label} className={`flex items-center gap-2.5 rounded-lg ${bg} px-3 py-2`}>
                                <Icon className={`w-3.5 h-3.5 shrink-0 ${color}`} />
                                <div>
                                  <p className="text-[10px] text-muted-foreground leading-none mb-0.5">{label}</p>
                                  <p className={`text-base font-bold leading-none ${color}`}>{value.toLocaleString()}</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <div className="rounded-lg bg-muted px-3 py-2 flex items-center justify-between">
                          <span className="text-xs text-muted-foreground font-medium">Total Interactions</span>
                          <span className="text-sm font-bold">{insights.totalInteractions.toLocaleString()}</span>
                        </div>
                        {insights.reach > 0 && (
                          <p className="text-[11px] text-muted-foreground text-center">
                            Engagement rate: <span className="font-semibold text-foreground">{((insights.totalInteractions / insights.reach) * 100).toFixed(1)}%</span>
                          </p>
                        )}
                      </>
                    ) : null}
                  </div>
                )}
              </div>
            </>
          )}
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
            <div className="space-y-4 min-w-0">
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
                    type="password"
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
      </div>{/* end main workspace */}

      {/* Jarvis sidebar panel */}
      {isSuperAdmin && jarvisOpen && (
        <CampaignJarvisPanel
          campaignId={campaignId}
          autoStart={autoStartJarvis}
          onDataChanged={() => refetch()}
          onClose={() => { setJarvisOpen(false); setAutoStartJarvis(false); }}
        />
      )}
    </div>
  );
}
