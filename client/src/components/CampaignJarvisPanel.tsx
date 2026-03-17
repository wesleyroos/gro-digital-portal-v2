import React, { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, X, Send, ChevronRight, Loader2, CheckCircle2, XCircle, MessageSquare, Activity, ChevronDown, ChevronUp } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
type ChatEntry =
  | { kind: "agent"; id: string; text: string }
  | { kind: "user"; id: string; text: string }
  | { kind: "approval"; id: string; question: string; answered: boolean }
  | { kind: "complete"; id: string; summary: string }
  | { kind: "error"; id: string; message: string };

type ActivityEntry =
  | { kind: "thinking"; id: string; text: string }
  | { kind: "tool"; id: string; tool: string; args: unknown; result?: string; success?: boolean };

type Phase = "idle" | "running" | "paused" | "done" | "error";

const TOOL_LABELS: Record<string, string> = {
  browse_website: "Browsing website...",
  send_message: "Sending message...",
  save_preferences: "Saving preferences...",
  save_brand_info: "Saving brand info...",
  save_strategy: "Saving strategy...",
  generate_calendar: "Generating content calendar...",
  generate_post_image: "Generating image...",
  approve_post: "Approving post...",
  approve_all_posts: "Approving all posts...",
  activate_campaign: "Activating campaign...",
  create_mailer: "Creating mailer...",
  generate_mailer: "Generating mailer...",
  request_approval: "Requesting approval...",
  complete: "Completing...",
};

const LIFECYCLE_STEPS = [
  { key: "browse_website", label: "Research" },
  { key: "save_brand_info", label: "Brand" },
  { key: "save_strategy", label: "Strategy" },
  { key: "generate_calendar", label: "Calendar" },
  { key: "generate_post_image", label: "Images" },
  { key: "approve_all_posts", label: "Approve" },
  { key: "activate_campaign", label: "Activate" },
  { key: "generate_mailer", label: "Mailer" },
];

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  campaignId: number;
  goals?: string;
  autoStart?: boolean;
  onDataChanged: () => void;
  onClose: () => void;
}

export default function CampaignJarvisPanel({ campaignId, goals, autoStart, onDataChanged, onClose }: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [chatLog, setChatLog] = useState<ChatEntry[]>([]);
  const [activityLog, setActivityLog] = useState<ActivityEntry[]>([]);
  const [input, setInput] = useState("");
  const [approvalInput, setApprovalInput] = useState("");
  const [activeTab, setActiveTab] = useState<"chat" | "activity">("chat");
  const [activityCollapsed, setActivityCollapsed] = useState<Set<string>>(new Set());
  const completedToolsRef = useRef<Set<string>>(new Set());

  const chatBottomRef = useRef<HTMLDivElement>(null);
  const activityBottomRef = useRef<HTMLDivElement>(null);
  const latestApprovalRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const uid = () => Math.random().toString(36).slice(2);

  const scrollChatToBottom = useCallback(() => {
    setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }, []);

  const scrollActivityToBottom = useCallback(() => {
    setTimeout(() => activityBottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }, []);

  useEffect(() => { scrollChatToBottom(); }, [chatLog, scrollChatToBottom]);
  useEffect(() => { scrollActivityToBottom(); }, [activityLog, scrollActivityToBottom]);

  useEffect(() => {
    if (phase === "paused") {
      setTimeout(() => latestApprovalRef.current?.focus(), 100);
    }
  }, [phase]);

  // Auto-start on mount if requested
  useEffect(() => {
    if (autoStart) {
      startAgent();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startAgent() {
    if (phase === "running" || phase === "paused") return;
    setPhase("running");
    setChatLog([]);
    setActivityLog([]);
    completedToolsRef.current = new Set();

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const res = await fetch(`/api/agent/jarvis/${campaignId}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goals }),
        signal: abort.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        setChatLog(prev => [...prev, { kind: "error", id: uid(), message: (err as { error?: string }).error ?? "Failed to start agent" }]);
        setPhase("error");
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";

        for (const chunk of chunks) {
          const line = chunk.trim();
          if (!line || line.startsWith(":")) continue;
          if (!line.startsWith("data: ")) continue;

          let event: Record<string, unknown>;
          try { event = JSON.parse(line.slice(6)) as Record<string, unknown>; }
          catch { continue; }

          const type = event.type as string;

          if (type === "thinking") {
            const text = event.text as string;
            setActivityLog(prev => {
              const last = prev[prev.length - 1];
              if (last?.kind === "thinking") {
                return [...prev.slice(0, -1), { ...last, text: last.text + text }];
              }
              return [...prev, { kind: "thinking", id: uid(), text }];
            });
          } else if (type === "tool_call") {
            const toolId = uid();
            setActivityLog(prev => [...prev, { kind: "tool", id: toolId, tool: event.tool as string, args: event.args }]);
          } else if (type === "tool_result") {
            const tool = event.tool as string;
            completedToolsRef.current.add(tool);
            setActivityLog(prev => {
              // Find last pending tool with this name
              const idx = [...prev].reverse().findIndex(e => e.kind === "tool" && e.tool === tool && e.result === undefined);
              if (idx === -1) return prev;
              const realIdx = prev.length - 1 - idx;
              const updated = [...prev];
              updated[realIdx] = { ...updated[realIdx] as ActivityEntry & { kind: "tool" }, result: event.result as string, success: event.success as boolean };
              return updated;
            });
          } else if (type === "agent_message") {
            setChatLog(prev => [...prev, { kind: "agent", id: uid(), text: event.text as string }]);
            setActiveTab("chat");
          } else if (type === "user_message_echoed") {
            // Already shown optimistically
          } else if (type === "approval_required") {
            setChatLog(prev => [...prev, { kind: "approval", id: uid(), question: event.question as string, answered: false }]);
            setPhase("paused");
            setActiveTab("chat");
          } else if (type === "data_changed") {
            onDataChanged();
          } else if (type === "complete") {
            setChatLog(prev => [...prev, { kind: "complete", id: uid(), summary: event.summary as string }]);
            setPhase("done");
            onDataChanged();
          } else if (type === "error") {
            setChatLog(prev => [...prev, { kind: "error", id: uid(), message: event.message as string }]);
            setPhase("error");
          }
        }
      }

      if (phase !== "done" && phase !== "error") setPhase("done");
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setChatLog(prev => [...prev, { kind: "error", id: uid(), message: String(e) }]);
      setPhase("error");
    }
  }

  async function sendApproval() {
    const response = approvalInput.trim();
    if (!response) return;
    setApprovalInput("");

    // Mark latest unanswered approval as answered
    setChatLog(prev => {
      const lastIdx = [...prev].reverse().findIndex(e => e.kind === "approval" && !(e as { answered: boolean }).answered);
      if (lastIdx === -1) return prev;
      const realIdx = prev.length - 1 - lastIdx;
      const updated = [...prev];
      const entry = updated[realIdx] as Extract<ChatEntry, { kind: "approval" }>;
      updated[realIdx] = { ...entry, answered: true };
      return updated;
    });

    // Add user message in chat
    setChatLog(prev => [...prev, { kind: "user", id: uid(), text: response }]);
    setPhase("running");

    await fetch(`/api/agent/jarvis/${campaignId}/respond`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ response }),
    });
  }

  async function sendChatMessage() {
    const msg = input.trim();
    if (!msg || phase === "idle") return;
    setInput("");
    setChatLog(prev => [...prev, { kind: "user", id: uid(), text: msg }]);

    await fetch(`/api/agent/jarvis/${campaignId}/message`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: msg }),
    });
  }

  const completedTools = completedToolsRef.current;
  const activeStepIndex = LIFECYCLE_STEPS.findIndex(s => !completedTools.has(s.key));

  return (
    <div className="w-[380px] shrink-0 border-l bg-background flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b shrink-0">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-violet-500/10 flex items-center justify-center shrink-0">
            <Sparkles className="w-3.5 h-3.5 text-violet-600" />
          </div>
          <span className="font-semibold text-sm">Jarvis</span>
          <span className="text-[9px] font-semibold bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded-full border border-violet-200">AI</span>
          {phase === "running" && (
            <span className="flex items-center gap-1 text-[10px] text-violet-600">
              <span className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse" />
              Working…
            </span>
          )}
          {phase === "paused" && (
            <span className="flex items-center gap-1 text-[10px] text-amber-600">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              Waiting for you
            </span>
          )}
          {phase === "done" && (
            <span className="flex items-center gap-1 text-[10px] text-emerald-600">
              <CheckCircle2 className="w-3 h-3" />
              Done
            </span>
          )}
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={onClose}>
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Lifecycle stepper */}
      {phase !== "idle" && (
        <div className="px-4 py-2 border-b shrink-0 overflow-x-auto">
          <div className="flex items-center gap-0 min-w-max">
            {LIFECYCLE_STEPS.map((step, i) => {
              const done = completedTools.has(step.key);
              const active = i === activeStepIndex && phase === "running";
              return (
                <React.Fragment key={step.key}>
                  <div className={`flex flex-col items-center gap-0.5 ${done ? "text-emerald-600" : active ? "text-violet-600" : "text-muted-foreground/40"}`}>
                    <div className={`w-2 h-2 rounded-full ${done ? "bg-emerald-500" : active ? "bg-violet-500 animate-pulse" : "bg-muted-foreground/20"}`} />
                    <span className="text-[9px] font-medium">{step.label}</span>
                  </div>
                  {i < LIFECYCLE_STEPS.length - 1 && (
                    <div className={`w-6 h-px mb-3 ${done ? "bg-emerald-300" : "bg-muted-foreground/15"}`} />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b shrink-0">
        <button
          onClick={() => setActiveTab("chat")}
          className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium border-b-2 transition-colors ${activeTab === "chat" ? "border-violet-600 text-violet-600" : "border-transparent text-muted-foreground hover:text-foreground"}`}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          Chat
          {phase === "paused" && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />}
        </button>
        <button
          onClick={() => setActiveTab("activity")}
          className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium border-b-2 transition-colors ${activeTab === "activity" ? "border-violet-600 text-violet-600" : "border-transparent text-muted-foreground hover:text-foreground"}`}
        >
          <Activity className="w-3.5 h-3.5" />
          Activity
        </button>
      </div>

      {/* Content area */}
      <div className="flex-1 min-h-0 flex flex-col">
        {/* ── CHAT TAB ── */}
        {activeTab === "chat" && (
          <div className="flex-1 flex flex-col min-h-0">
            {phase === "idle" ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 py-8 text-center">
                <div className="w-14 h-14 rounded-2xl bg-violet-500/10 flex items-center justify-center">
                  <Sparkles className="w-7 h-7 text-violet-500" />
                </div>
                <div>
                  <p className="font-semibold text-sm">Ready to launch</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Jarvis will build out this campaign automatically — brand info, strategy, posts, images, and mailer.
                  </p>
                </div>
                <Button
                  className="gap-2 bg-violet-600 hover:bg-violet-700"
                  onClick={startAgent}
                >
                  <Sparkles className="w-4 h-4" />
                  Start Jarvis
                </Button>
              </div>
            ) : (
              <>
                {/* Messages */}
                <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
                  {chatLog.map((entry) => {
                    if (entry.kind === "agent") {
                      return (
                        <div key={entry.id} className="flex gap-2 items-start">
                          <div className="w-6 h-6 rounded-full bg-violet-500/10 flex items-center justify-center shrink-0 mt-0.5">
                            <Sparkles className="w-3 h-3 text-violet-600" />
                          </div>
                          <div className="bg-violet-50 border border-violet-100 rounded-2xl rounded-tl-sm px-3 py-2 text-xs text-foreground max-w-[90%] prose prose-xs prose-violet">
                            <ReactMarkdown>{entry.text}</ReactMarkdown>
                          </div>
                        </div>
                      );
                    }
                    if (entry.kind === "user") {
                      return (
                        <div key={entry.id} className="flex justify-end">
                          <div className="bg-violet-600 text-white rounded-2xl rounded-tr-sm px-3 py-2 text-xs max-w-[85%]">
                            {entry.text}
                          </div>
                        </div>
                      );
                    }
                    if (entry.kind === "approval") {
                      return (
                        <div key={entry.id} className="flex gap-2 items-start">
                          <div className="w-6 h-6 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0 mt-0.5">
                            <Sparkles className="w-3 h-3 text-amber-600" />
                          </div>
                          <div className={`flex-1 rounded-2xl rounded-tl-sm border-2 px-3 py-2 space-y-2 ${entry.answered ? "border-emerald-200 bg-emerald-50/50" : "border-amber-400 bg-amber-50"}`}>
                            <p className="text-xs text-foreground font-medium">{entry.question}</p>
                            {!entry.answered && (
                              <div className="flex gap-2">
                                <Textarea
                                  ref={latestApprovalRef}
                                  value={approvalInput}
                                  onChange={e => setApprovalInput(e.target.value)}
                                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendApproval(); } }}
                                  placeholder="Your reply…"
                                  className="text-xs min-h-[60px] resize-none"
                                />
                                <Button
                                  size="sm"
                                  className="self-end bg-amber-500 hover:bg-amber-600 text-white"
                                  onClick={sendApproval}
                                  disabled={!approvalInput.trim()}
                                >
                                  <Send className="w-3 h-3" />
                                </Button>
                              </div>
                            )}
                            {entry.answered && (
                              <p className="text-[10px] text-emerald-600 flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" /> Answered
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    }
                    if (entry.kind === "complete") {
                      return (
                        <div key={entry.id} className="flex gap-2 items-start">
                          <div className="w-6 h-6 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0 mt-0.5">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          </div>
                          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl rounded-tl-sm px-3 py-2 text-xs text-emerald-800 max-w-[90%]">
                            <p className="font-semibold mb-1">Campaign ready!</p>
                            <p>{entry.summary}</p>
                          </div>
                        </div>
                      );
                    }
                    if (entry.kind === "error") {
                      return (
                        <div key={entry.id} className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                          Error: {entry.message}
                        </div>
                      );
                    }
                    return null;
                  })}
                  {phase === "running" && chatLog.length === 0 && (
                    <div className="flex gap-2 items-center text-xs text-muted-foreground">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Jarvis is starting…
                    </div>
                  )}
                  <div ref={chatBottomRef} />
                </div>

                {/* Input */}
                {(phase === "running" || phase === "paused" || phase === "done") && (
                  <div className="border-t p-3 shrink-0">
                    <div className="flex gap-2">
                      <Textarea
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChatMessage(); } }}
                        placeholder={phase === "paused" ? "Reply in the card above, or send a message…" : "Send a message to Jarvis…"}
                        className="text-xs min-h-[60px] resize-none"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        className="self-end"
                        onClick={sendChatMessage}
                        disabled={!input.trim()}
                      >
                        <Send className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── ACTIVITY TAB ── */}
        {activeTab === "activity" && (
          <div className="flex-1 overflow-y-auto bg-zinc-950 font-mono text-[11px] p-3 space-y-1.5">
            {activityLog.length === 0 && phase !== "running" && (
              <p className="text-zinc-600 text-center py-8">No activity yet</p>
            )}
            {activityLog.map((entry) => {
              if (entry.kind === "thinking") {
                const collapsed = activityCollapsed.has(entry.id);
                const preview = entry.text.slice(0, 120);
                return (
                  <div key={entry.id} className="group">
                    <button
                      onClick={() => setActivityCollapsed(prev => {
                        const next = new Set(prev);
                        collapsed ? next.delete(entry.id) : next.add(entry.id);
                        return next;
                      })}
                      className="flex items-start gap-1.5 text-zinc-500 hover:text-zinc-400 text-left w-full"
                    >
                      {collapsed ? <ChevronRight className="w-3 h-3 mt-0.5 shrink-0" /> : <ChevronDown className="w-3 h-3 mt-0.5 shrink-0" />}
                      <span className={collapsed ? "truncate" : "whitespace-pre-wrap break-words"}>
                        {collapsed ? preview + (entry.text.length > 120 ? "…" : "") : entry.text}
                      </span>
                    </button>
                  </div>
                );
              }
              if (entry.kind === "tool") {
                const label = TOOL_LABELS[entry.tool] ?? entry.tool;
                const pending = entry.result === undefined;
                return (
                  <div key={entry.id} className={`flex items-start gap-2 px-2 py-1.5 rounded-md ${pending ? "bg-zinc-800" : entry.success ? "bg-zinc-900 border border-zinc-700" : "bg-red-950 border border-red-800"}`}>
                    {pending
                      ? <Loader2 className="w-3 h-3 text-violet-400 animate-spin mt-0.5 shrink-0" />
                      : entry.success
                        ? <CheckCircle2 className="w-3 h-3 text-emerald-400 mt-0.5 shrink-0" />
                        : <XCircle className="w-3 h-3 text-red-400 mt-0.5 shrink-0" />
                    }
                    <div className="min-w-0 flex-1">
                      <span className={`font-medium ${pending ? "text-violet-300" : entry.success ? "text-emerald-300" : "text-red-300"}`}>
                        {label}
                      </span>
                      {!pending && entry.result && (
                        <p className="text-zinc-500 truncate mt-0.5">{entry.result.slice(0, 120)}</p>
                      )}
                    </div>
                  </div>
                );
              }
              return null;
            })}
            {phase === "running" && (
              <div className="flex items-center gap-1.5 text-violet-400">
                <span className="inline-block w-2 h-4 bg-violet-400 animate-pulse rounded-sm" />
              </div>
            )}
            <div ref={activityBottomRef} />
          </div>
        )}
      </div>
    </div>
  );
}
