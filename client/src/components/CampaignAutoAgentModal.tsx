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
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────
type LogEntry =
  | { kind: "thinking"; id: string; text: string }
  | { kind: "tool_call"; id: string; tool: string; args: unknown; result?: string; success?: boolean }
  | { kind: "approval"; id: string; question: string; answered: boolean; response?: string }
  | { kind: "complete"; id: string; summary: string; campaignId: number }
  | { kind: "error"; id: string; message: string };

type Phase = "idle" | "running" | "paused" | "done" | "error";

interface Props {
  open: boolean;
  onClose: () => void;
  clients: Array<{ clientSlug: string; clientName: string }>;
}

// ── Constants ──────────────────────────────────────────────────────────────────
const TOOL_LABELS: Record<string, string> = {
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
  const [log, setLog] = useState<LogEntry[]>([]);
  const [approvalInputs, setApprovalInputs] = useState<Record<string, string>>({});
  const agentIdRef = useRef<string>("");
  const logEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll log to bottom
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [log]);

  // Reset when modal opens
  useEffect(() => {
    if (open) {
      setPhase("idle");
      setLog([]);
      setApprovalInputs({});
      agentIdRef.current = "";
    }
  }, [open]);

  // ── Lifecycle stepper ────────────────────────────────────────────────────────
  const completedTools = log
    .filter((e): e is Extract<LogEntry, { kind: "tool_call" }> => e.kind === "tool_call" && e.result !== undefined)
    .map((e) => e.tool);

  const currentStepIndex = (() => {
    if (log.some((e) => e.kind === "complete")) return LIFECYCLE_STEPS.length - 1;
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
      setLog((prev) => {
        const last = prev[prev.length - 1];
        if (last?.kind === "thinking") {
          return [...prev.slice(0, -1), { ...last, text: last.text + text }];
        }
        return [...prev, { kind: "thinking", id: crypto.randomUUID(), text }];
      });
    } else if (event.type === "tool_call") {
      setLog((prev) => [
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
      setLog((prev) => {
        // Find the most recent pending tool_call for this tool
        const idx = [...prev]
          .reverse()
          .findIndex(
            (e) =>
              e.kind === "tool_call" &&
              (e as Extract<LogEntry, { kind: "tool_call" }>).tool === tool &&
              (e as Extract<LogEntry, { kind: "tool_call" }>).result === undefined
          );
        if (idx === -1) return prev;
        const realIdx = prev.length - 1 - idx;
        const updated = [...prev];
        updated[realIdx] = {
          ...(updated[realIdx] as Extract<LogEntry, { kind: "tool_call" }>),
          result: event.result as string,
          success: event.success as boolean,
        };
        return updated;
      });
    } else if (event.type === "approval_required") {
      setPhase("paused");
      setLog((prev) => [
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
      setLog((prev) => [
        ...prev,
        {
          kind: "complete",
          id: crypto.randomUUID(),
          summary: event.summary as string,
          campaignId: event.campaignId as number,
        },
      ]);
    } else if (event.type === "error") {
      setPhase("error");
      setLog((prev) => [
        ...prev,
        { kind: "error", id: crypto.randomUUID(), message: event.message as string },
      ]);
    }
  }

  // ── Launch ───────────────────────────────────────────────────────────────────
  async function handleLaunch() {
    if (!clientSlug) return;
    setPhase("running");
    setLog([]);

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
        setLog((prev) => [
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
      setLog((prev) => [
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

    setLog((prev) =>
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

  // ── Render ───────────────────────────────────────────────────────────────────
  const lastThinkingId = log.filter((e) => e.kind === "thinking").slice(-1)[0]?.id;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-3xl h-[85vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-4 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Sparkles className="w-4 h-4 text-violet-500" />
            Jarvis — Autonomous Campaign Agent
          </DialogTitle>
        </DialogHeader>

        {phase === "idle" ? (
          /* ── Setup form ── */
          <div className="px-6 py-6 space-y-4 overflow-y-auto">
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
        ) : (
          /* ── Agent running view ── */
          <div className="flex flex-col flex-1 overflow-hidden">
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

            {/* Terminal log panel */}
            <div className="flex-1 overflow-y-auto bg-zinc-950 text-zinc-100 font-mono text-sm p-4 space-y-2">
              {log.map((entry) => {
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

                if (entry.kind === "approval") {
                  return (
                    <div
                      key={entry.id}
                      className="border border-amber-500/60 rounded p-3 space-y-2 bg-amber-950/20"
                    >
                      <div className="text-amber-300 text-xs font-semibold uppercase tracking-wide">
                        Approval required
                      </div>
                      <div className="text-zinc-200 text-sm leading-relaxed">
                        {entry.question}
                      </div>
                      {!entry.answered ? (
                        <div className="flex gap-2 pt-1">
                          <Input
                            className="bg-zinc-900 border-zinc-600 text-zinc-100 text-sm h-8 flex-1 font-sans"
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
                            className="h-8 shrink-0"
                            onClick={() => submitApproval(entry.id)}
                          >
                            Confirm
                          </Button>
                        </div>
                      ) : (
                        <div className="text-zinc-500 text-xs pt-1">
                          Responded: {entry.response || "(submitted)"}
                        </div>
                      )}
                    </div>
                  );
                }

                if (entry.kind === "complete") {
                  return (
                    <div
                      key={entry.id}
                      className="border border-emerald-500/60 rounded p-3 space-y-2 bg-emerald-950/20"
                    >
                      <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                        <CheckCircle2 className="w-4 h-4" />
                        Campaign setup complete
                      </div>
                      <div className="text-zinc-300 text-sm leading-relaxed">
                        {entry.summary}
                      </div>
                      {entry.campaignId > 0 && (
                        <button
                          onClick={() => {
                            onClose();
                            setLocation(`/marketing/${entry.campaignId}`);
                          }}
                          className="text-emerald-400 text-xs hover:underline flex items-center gap-1 font-sans"
                        >
                          <ExternalLink className="w-3 h-3" />
                          View campaign
                        </button>
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
              <div ref={logEndRef} />
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
                {phase === "paused" && "Waiting for your input above..."}
                {phase === "done" && "Done."}
                {phase === "error" && "An error occurred."}
              </div>
              <Button variant="outline" size="sm" onClick={onClose}>
                {phase === "done" || phase === "error" ? "Close" : "Close"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
