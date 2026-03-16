import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sparkles,
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronRight,
  ExternalLink,
  Send,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────
type ChatEntry =
  | { kind: "agent"; id: string; text: string }
  | { kind: "user"; id: string; text: string }
  | { kind: "approval"; id: string; question: string; answered: boolean; response?: string }
  | { kind: "agent_complete"; id: string; summary: string; campaignId: number };

type ActivityEntry =
  | { kind: "thinking"; id: string; text: string }
  | { kind: "tool_call"; id: string; tool: string; args: unknown; result?: string; success?: boolean }
  | { kind: "error"; id: string; message: string };

type Phase = "idle" | "running" | "paused" | "done" | "error";

interface Props {
  open: boolean;
  onClose: () => void;
  clients: Array<{ clientSlug: string; clientName: string }>;
}

// ── Constants ──────────────────────────────────────────────────────────────────
const TOOL_LABELS: Record<string, string> = {
  send_message: "Sending message...",
  save_preferences: "Saving preferences...",
  create_campaign: "Creating campaign...",
  save_brand_info: "Saving brand information...",
  save_strategy: "Writing content strategy...",
  generate_calendar: "Generating content calendar...",
  generate_post_image: "Generating post image...",
  approve_post: "Approving post...",
  approve_all_posts: "Approving all posts...",
  activate_campaign: "Activating campaign...",
  create_mailer: "Creating email mailer...",
  generate_mailer: "Generating mailer HTML...",
  request_approval: "Pausing for approval...",
  complete: "Completing...",
};

const LIFECYCLE_STEPS = [
  { key: "create", label: "Create", tools: ["create_campaign"] },
  { key: "brand", label: "Brand", tools: ["save_brand_info"] },
  { key: "strategy", label: "Strategy", tools: ["save_strategy"] },
  { key: "calendar", label: "Calendar", tools: ["generate_calendar"] },
  { key: "images", label: "Images", tools: ["generate_post_image"] },
  { key: "activate", label: "Activate", tools: ["activate_campaign", "approve_all_posts", "approve_post"] },
  { key: "mailer", label: "Mailer", tools: ["create_mailer", "generate_mailer"] },
  { key: "done", label: "Done", tools: [] },
];

// ── Component ──────────────────────────────────────────────────────────────────
export default function CampaignAutoAgentModal({ open, onClose, clients }: Props) {
  const [, setLocation] = useLocation();
  const [phase, setPhase] = useState<Phase>("idle");
  const [clientSlug, setClientSlug] = useState("");
  const [campaignName, setCampaignName] = useState("");
  const [goals, setGoals] = useState("");
  const [chatLog, setChatLog] = useState<ChatEntry[]>([]);
  const [activityLog, setActivityLog] = useState<ActivityEntry[]>([]);
  const [approvalInputs, setApprovalInputs] = useState<Record<string, string>>({});
  const [chatInput, setChatInput] = useState("");
  const agentIdRef = useRef<string>("");
  const chatEndRef = useRef<HTMLDivElement>(null);
  const activityEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatLog]);

  useEffect(() => {
    activityEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activityLog]);

  // Reset when modal opens
  useEffect(() => {
    if (open) {
      setPhase("idle");
      setChatLog([]);
      setActivityLog([]);
      setApprovalInputs({});
      setChatInput("");
      agentIdRef.current = "";
    }
  }, [open]);

  // ── Lifecycle stepper (based on activity log) ─────────────────────────────
  const completedTools = activityLog
    .filter((e): e is Extract<ActivityEntry, { kind: "tool_call" }> => e.kind === "tool_call" && e.result !== undefined)
    .map((e) => e.tool);

  const currentStepIndex = (() => {
    if (chatLog.some((e) => e.kind === "agent_complete")) return LIFECYCLE_STEPS.length - 1;
    for (let i = LIFECYCLE_STEPS.length - 2; i >= 0; i--) {
      const step = LIFECYCLE_STEPS[i];
      if (step.tools.some((t) => completedTools.includes(t))) return i;
    }
    return -1;
  })();

  // ── SSE event handler ────────────────────────────────────────────────────────
  function handleSseEvent(event: { type: string; [key: string]: unknown }) {
    if (event.type === "thinking") {
      const text = event.text as string;
      setActivityLog((prev) => {
        const last = prev[prev.length - 1];
        if (last?.kind === "thinking") {
          return [...prev.slice(0, -1), { ...last, text: last.text + text }];
        }
        return [...prev, { kind: "thinking", id: crypto.randomUUID(), text }];
      });
    } else if (event.type === "tool_call") {
      setActivityLog((prev) => [
        ...prev,
        {
          kind: "tool_call",
          id: crypto.randomUUID(),
          tool: event.tool as string,
          args: event.args as unknown,
        },
      ]);
    } else if (event.type === "tool_result") {
      const tool = event.tool as string;
      setActivityLog((prev) => {
        const idx = [...prev]
          .reverse()
          .findIndex(
            (e) =>
              e.kind === "tool_call" &&
              (e as Extract<ActivityEntry, { kind: "tool_call" }>).tool === tool &&
              (e as Extract<ActivityEntry, { kind: "tool_call" }>).result === undefined
          );
        if (idx === -1) return prev;
        const realIdx = prev.length - 1 - idx;
        const updated = [...prev];
        updated[realIdx] = {
          ...(updated[realIdx] as Extract<ActivityEntry, { kind: "tool_call" }>),
          result: event.result as string,
          success: event.success as boolean,
        };
        return updated;
      });
    } else if (event.type === "agent_message") {
      setChatLog((prev) => [
        ...prev,
        { kind: "agent", id: crypto.randomUUID(), text: event.text as string },
      ]);
    } else if (event.type === "user_message_echoed") {
      setChatLog((prev) => [
        ...prev,
        { kind: "user", id: crypto.randomUUID(), text: event.text as string },
      ]);
    } else if (event.type === "approval_required") {
      setPhase("paused");
      setChatLog((prev) => [
        ...prev,
        {
          kind: "approval",
          id: crypto.randomUUID(),
          question: event.question as string,
          answered: false,
        },
      ]);
    } else if (event.type === "complete") {
      setPhase("done");
      setChatLog((prev) => [
        ...prev,
        {
          kind: "agent_complete",
          id: crypto.randomUUID(),
          summary: event.summary as string,
          campaignId: event.campaignId as number,
        },
      ]);
      setActivityLog((prev) => [...prev]);
    } else if (event.type === "error") {
      setPhase("error");
      setActivityLog((prev) => [
        ...prev,
        { kind: "error", id: crypto.randomUUID(), message: event.message as string },
      ]);
    }
  }

  // ── Launch ───────────────────────────────────────────────────────────────────
  async function handleLaunch() {
    if (!clientSlug) return;
    setPhase("running");
    setChatLog([]);
    setActivityLog([]);

    try {
      const res = await fetch("/api/agent/campaign-auto", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientSlug,
          campaignName: campaignName.trim() || undefined,
          goals: goals.trim() || undefined,
        }),
      });

      agentIdRef.current = res.headers.get("X-Agent-Id") ?? "";

      if (!res.ok || !res.body) {
        setPhase("error");
        setActivityLog((prev) => [
          ...prev,
          { kind: "error", id: crypto.randomUUID(), message: `HTTP ${res.status}` },
        ]);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          const trimmed = part.trim();
          if (trimmed.startsWith("data: ")) {
            try {
              const event = JSON.parse(trimmed.slice(6)) as { type: string; [key: string]: unknown };
              handleSseEvent(event);
            } catch { /* ignore malformed */ }
          }
        }
      }

      setPhase((prev) => (prev === "running" ? "done" : prev));
    } catch (e) {
      setPhase("error");
      setActivityLog((prev) => [
        ...prev,
        { kind: "error", id: crypto.randomUUID(), message: String(e) },
      ]);
    }
  }

  // ── Approval submission ──────────────────────────────────────────────────────
  async function submitApproval(entryId: string) {
    const response = approvalInputs[entryId] ?? "";
    const agentId = agentIdRef.current;
    if (!agentId) return;

    setChatLog((prev) =>
      prev.map((e) =>
        e.id === entryId && e.kind === "approval"
          ? { ...e, answered: true, response }
          : e
      )
    );
    setApprovalInputs((prev) => {
      const n = { ...prev };
      delete n[entryId];
      return n;
    });
    setPhase("running");

    await fetch("/api/agent/campaign-auto/respond", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId, response }),
    });
  }

  // ── Chat message send ────────────────────────────────────────────────────────
  async function sendChatMessage() {
    const msg = chatInput.trim();
    if (!msg || !agentIdRef.current || phase === "paused") return;
    setChatInput("");
    await fetch("/api/agent/campaign-auto/message", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId: agentIdRef.current, message: msg }),
    });
  }

  // ── Status dot color ─────────────────────────────────────────────────────────
  const statusDotClass =
    phase === "running"
      ? "bg-emerald-500"
      : phase === "paused"
      ? "bg-amber-500"
      : "bg-gray-400";

  // ── Render ───────────────────────────────────────────────────────────────────
  const lastThinkingId = activityLog.filter((e) => e.kind === "thinking").slice(-1)[0]?.id;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-5xl h-[88vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-4 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Sparkles className="w-4 h-4 text-violet-500" />
            Jarvis — Autonomous Campaign Agent
          </DialogTitle>
        </DialogHeader>

        {phase === "idle" ? (
          /* ── Setup form ── */
          <div className="flex-1 flex items-start justify-center overflow-y-auto">
            <div className="w-full max-w-lg px-6 py-8 space-y-4">
              <div className="space-y-1.5">
                <Label>Client</Label>
                <Select value={clientSlug} onValueChange={setClientSlug}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a client..." />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((c) => (
                      <SelectItem key={c.clientSlug} value={c.clientSlug}>
                        {c.clientName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>
                  Campaign name{" "}
                  <span className="text-muted-foreground font-normal">(optional)</span>
                </Label>
                <Input
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                  placeholder="e.g. Q2 2026 Instagram Campaign"
                />
              </div>

              <div className="space-y-1.5">
                <Label>
                  Goals / notes{" "}
                  <span className="text-muted-foreground font-normal">(optional)</span>
                </Label>
                <Input
                  value={goals}
                  onChange={(e) => setGoals(e.target.value)}
                  placeholder="e.g. Drive traffic to new product launch, focus on brand awareness"
                />
              </div>

              <p className="text-xs text-muted-foreground pt-1">
                Jarvis will autonomously create the campaign, write brand info and strategy, generate the content calendar, create post images, approve posts, activate the campaign, and generate a mailer — pausing only when it needs your input.
              </p>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button onClick={handleLaunch} disabled={!clientSlug} className="gap-2">
                  <Sparkles className="w-4 h-4" />
                  Launch
                </Button>
              </div>
            </div>
          </div>
        ) : (
          /* ── Agent running view — two pane layout ── */
          <div className="flex flex-1 overflow-hidden">
            {/* ── Left pane: Chat ── */}
            <div className="w-[40%] flex flex-col border-r">
              {/* Chat header */}
              <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-muted/30 shrink-0">
                <span className={`w-2 h-2 rounded-full shrink-0 ${statusDotClass}`} />
                <span className="text-sm font-semibold">Jarvis</span>
                <Sparkles className="w-3.5 h-3.5 text-violet-500 ml-0.5" />
              </div>

              {/* Chat messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {chatLog.map((entry) => {
                  if (entry.kind === "agent") {
                    return (
                      <div key={entry.id} className="flex items-start gap-2">
                        <div className="w-6 h-6 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                          J
                        </div>
                        <div className="bg-violet-50 border border-violet-100 rounded-2xl rounded-tl-sm px-3 py-2 text-sm text-foreground leading-relaxed max-w-[85%]">
                          {entry.text}
                        </div>
                      </div>
                    );
                  }

                  if (entry.kind === "user") {
                    return (
                      <div key={entry.id} className="flex justify-end">
                        <div className="bg-blue-500 text-white rounded-2xl rounded-tr-sm px-3 py-2 text-sm leading-relaxed max-w-[85%]">
                          {entry.text}
                        </div>
                      </div>
                    );
                  }

                  if (entry.kind === "approval") {
                    return (
                      <div key={entry.id} className="space-y-2">
                        {/* Jarvis bubble for question */}
                        <div className="flex items-start gap-2">
                          <div className="w-6 h-6 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                            J
                          </div>
                          <div className="bg-violet-50 border border-violet-100 rounded-2xl rounded-tl-sm px-3 py-2 text-sm text-foreground leading-relaxed max-w-[85%]">
                            {entry.question}
                          </div>
                        </div>
                        {/* Approval input card */}
                        {!entry.answered ? (
                          <div className="ml-8 border border-amber-300 bg-amber-50 rounded-xl p-3 space-y-2">
                            <div className="text-xs font-semibold text-amber-700 uppercase tracking-wide">
                              Approval required
                            </div>
                            <div className="flex gap-2">
                              <Input
                                className="bg-white border-amber-200 text-sm h-8 flex-1"
                                placeholder="Type your response..."
                                value={approvalInputs[entry.id] ?? ""}
                                onChange={(e) =>
                                  setApprovalInputs((prev) => ({
                                    ...prev,
                                    [entry.id]: e.target.value,
                                  }))
                                }
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") submitApproval(entry.id);
                                }}
                              />
                              <Button
                                size="sm"
                                className="h-8 shrink-0 bg-amber-500 hover:bg-amber-600"
                                onClick={() => submitApproval(entry.id)}
                              >
                                Confirm
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="ml-8 flex justify-end">
                            <div className="bg-blue-500 text-white rounded-2xl rounded-tr-sm px-3 py-2 text-sm leading-relaxed max-w-[85%]">
                              {entry.response || "(submitted)"}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  }

                  if (entry.kind === "agent_complete") {
                    return (
                      <div key={entry.id} className="flex items-start gap-2">
                        <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                          J
                        </div>
                        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl rounded-tl-sm px-3 py-2 text-sm text-foreground leading-relaxed max-w-[85%] space-y-2">
                          <div className="flex items-center gap-1.5 font-semibold text-emerald-700">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Campaign setup complete
                          </div>
                          <p className="text-muted-foreground">{entry.summary}</p>
                          {entry.campaignId > 0 && (
                            <button
                              onClick={() => {
                                onClose();
                                setLocation(`/marketing/${entry.campaignId}`);
                              }}
                              className="text-emerald-600 text-xs hover:underline flex items-center gap-1 font-medium"
                            >
                              <ExternalLink className="w-3 h-3" />
                              View Campaign
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  }

                  return null;
                })}
                <div ref={chatEndRef} />
              </div>

              {/* Chat input */}
              <div className="px-3 py-3 border-t shrink-0 flex gap-2">
                <Input
                  className="flex-1 text-sm h-9"
                  placeholder={
                    phase === "paused"
                      ? "Waiting for approval above..."
                      : "Message Jarvis..."
                  }
                  value={chatInput}
                  disabled={phase === "paused" || phase === "done" || phase === "error"}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") sendChatMessage();
                  }}
                />
                <Button
                  size="sm"
                  className="h-9 w-9 p-0 shrink-0"
                  disabled={phase === "paused" || phase === "done" || phase === "error" || !chatInput.trim()}
                  onClick={sendChatMessage}
                >
                  <Send className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>

            {/* ── Right pane: Activity ── */}
            <div className="w-[60%] flex flex-col">
              {/* Lifecycle stepper */}
              <div className="flex items-center gap-1 px-4 py-2.5 border-b bg-muted/30 overflow-x-auto shrink-0">
                {LIFECYCLE_STEPS.map((step, i) => {
                  const isCompleted = i < currentStepIndex || (i === currentStepIndex && phase === "done");
                  const isCurrent = i === currentStepIndex && phase !== "done";
                  return (
                    <div key={step.key} className="flex items-center gap-1 shrink-0">
                      <div
                        className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                          isCompleted
                            ? "bg-emerald-100 text-emerald-700"
                            : isCurrent
                            ? "bg-violet-100 text-violet-700"
                            : "text-muted-foreground"
                        }`}
                      >
                        {isCompleted && <CheckCircle2 className="w-3 h-3" />}
                        {isCurrent && phase === "running" && (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        )}
                        {step.label}
                      </div>
                      {i < LIFECYCLE_STEPS.length - 1 && (
                        <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Activity terminal */}
              <div className="flex-1 overflow-y-auto bg-zinc-950 text-zinc-100 font-mono text-sm p-4 space-y-2">
                {activityLog.map((entry) => {
                  if (entry.kind === "thinking") {
                    return (
                      <div
                        key={entry.id}
                        className="text-zinc-300 leading-relaxed whitespace-pre-wrap"
                      >
                        {entry.text}
                        {phase === "running" && entry.id === lastThinkingId && (
                          <span className="inline-block w-2 h-[1em] bg-zinc-300 ml-0.5 align-middle animate-pulse" />
                        )}
                      </div>
                    );
                  }

                  if (entry.kind === "tool_call") {
                    return (
                      <div key={entry.id} className="border border-zinc-700 rounded p-2 space-y-1">
                        <div className="flex items-center gap-2">
                          {entry.result === undefined ? (
                            <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin shrink-0" />
                          ) : entry.success ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          ) : (
                            <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                          )}
                          <span className="text-amber-300 font-medium text-xs">
                            {TOOL_LABELS[entry.tool] ?? entry.tool}
                          </span>
                        </div>
                        {entry.result && (
                          <div
                            className={`text-xs pl-5 leading-relaxed ${
                              entry.success ? "text-zinc-500" : "text-red-400"
                            }`}
                          >
                            {entry.result}
                          </div>
                        )}
                      </div>
                    );
                  }

                  if (entry.kind === "error") {
                    return (
                      <div
                        key={entry.id}
                        className="border border-red-500/60 rounded p-2 text-red-400 text-sm"
                      >
                        Error: {entry.message}
                      </div>
                    );
                  }

                  return null;
                })}
                <div ref={activityEndRef} />
              </div>

              {/* Footer */}
              <div className="px-5 py-3 border-t shrink-0 flex items-center justify-between bg-background">
                <div className="text-xs text-muted-foreground">
                  {phase === "running" && (
                    <span className="flex items-center gap-1.5">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Agent is running...
                    </span>
                  )}
                  {phase === "paused" && "Waiting for your input..."}
                  {phase === "done" && "Done."}
                  {phase === "error" && "An error occurred."}
                </div>
                <Button variant="outline" size="sm" onClick={onClose}>
                  Close
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
