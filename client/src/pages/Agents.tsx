import { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import {
  Bot, CheckSquare, DollarSign, Wallet, Play, Pause,
  Activity, Plus, Clock, Circle, AlertCircle, RefreshCw,
  MessageSquare, Send, X,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

// ── Types ───────────────────────────────────────────────────────────────────
type PAgent = {
  id: string;
  name: string;
  role?: string;
  title?: string;
  status: string;
  lastHeartbeatAt?: string | null;
  budgetMonthlyCents?: number;
  spentMonthlyCents?: number;
};
type PIssue = {
  id: string;
  title: string;
  status: string;
  priority?: string;
  assigneeAgentId?: string | null;
};
type PComment = {
  id: string;
  body: string;
  createdAt?: string;
  actorType?: string;
  actorId?: string;
};
type PHeartbeatRun = {
  id: string;
  agentId?: string;
  status: string;
  startedAt?: string;
  finishedAt?: string;
};
type PCostSummary = {
  totalCents?: number;
  budgetCents?: number;
  [key: string]: unknown;
};

// ── Helpers ─────────────────────────────────────────────────────────────────
function cents(n?: number) {
  if (!n) return "R0";
  return `R${(n / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function timeAgo(iso?: string | null) {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function statusColor(status: string) {
  if (status === "active" || status === "running") return "bg-emerald-500";
  if (status === "paused") return "bg-amber-400";
  if (status === "error" || status === "failed") return "bg-red-500";
  return "bg-slate-400";
}

function priorityVariant(p?: string): "destructive" | "outline" | "secondary" {
  if (p === "high") return "destructive";
  if (p === "medium") return "outline";
  return "secondary";
}

// ── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, sub, accent }: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
}) {
  return (
    <Card className={accent ? `border-${accent}-200/80 bg-gradient-to-br from-${accent}-50 to-white` : ""}>
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-2">
          <Icon className="w-4 h-4 text-muted-foreground" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
        </div>
        <p className="text-xl sm:text-2xl font-bold font-mono">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

// ── Agent chat panel ─────────────────────────────────────────────────────────
type LocalMsg = { id: string; body: string; isMe: true; ts: number };

function AgentChat({ agent, companyId, onClose }: {
  agent: PAgent;
  companyId: string;
  onClose: () => void;
}) {
  const storageKey = `paperclip-chat-issue-${agent.id}`;
  const [chatIssueId, setChatIssueId] = useState<string | null>(
    () => localStorage.getItem(storageKey)
  );
  // Optimistic local messages (user's own, shown immediately)
  const [localMsgs, setLocalMsgs] = useState<LocalMsg[]>([]);
  const [draft, setDraft] = useState("");
  const pendingFirstMsg = useRef<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: serverComments = [] } = trpc.paperclip.issueComments.useQuery(
    { issueId: chatIssueId ?? "" },
    { enabled: !!chatIssueId, refetchInterval: 4000 },
  ) as { data: PComment[] };

  // Merge: server comments + local optimistic (dedup by body+time)
  const serverIds = new Set((serverComments as PComment[]).map(c => c.id));
  const allMessages = [
    ...(serverComments as PComment[]).map(c => ({
      id: c.id,
      body: c.body,
      isMe: c.actorType === "user" || c.actorType === "board",
      ts: c.createdAt ? new Date(c.createdAt).getTime() : 0,
    })),
    ...localMsgs.filter(m => !serverIds.has(m.id)),
  ].sort((a, b) => a.ts - b.ts);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [allMessages.length]);

  // Focus input on open
  useEffect(() => { inputRef.current?.focus(); }, []);

  const createIssue = trpc.paperclip.createIssue.useMutation({
    onSuccess: async (data: unknown) => {
      const issue = data as { id: string };
      localStorage.setItem(storageKey, issue.id);
      setChatIssueId(issue.id);
      // Now post the first message as a comment so it appears in the thread
      if (pendingFirstMsg.current) {
        addComment.mutate({ issueId: issue.id, body: pendingFirstMsg.current });
        wakeAgent.mutate({ agentId: agent.id });
        pendingFirstMsg.current = null;
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const addComment = trpc.paperclip.addComment.useMutation({
    onError: (e) => toast.error(e.message),
  });

  const wakeAgent = trpc.paperclip.wakeAgent.useMutation();

  function send() {
    const text = draft.trim();
    if (!text) return;
    setDraft("");

    // Show message optimistically right away
    const optimisticId = `local-${Date.now()}`;
    setLocalMsgs(prev => [...prev, { id: optimisticId, body: text, isMe: true, ts: Date.now() }]);

    if (!chatIssueId) {
      pendingFirstMsg.current = text;
      createIssue.mutate({
        companyId,
        title: `💬 Chat with ${agent.name}`,
        assigneeId: agent.id,
        priority: "medium",
      });
    } else {
      addComment.mutate({ issueId: chatIssueId, body: text });
      wakeAgent.mutate({ agentId: agent.id });
    }
  }

  return (
    <div className="border-t border-border mt-3 pt-3 flex flex-col gap-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <MessageSquare className="w-3 h-3" /> Chat with {agent.name}
        </span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="h-64 overflow-y-auto rounded-lg bg-muted/20 p-3 flex flex-col gap-2">
        {allMessages.length === 0 && (
          <p className="text-xs text-muted-foreground text-center m-auto">
            Send a message — {agent.name} will respond on the next run.
          </p>
        )}
        {allMessages.map(msg => (
          <div key={msg.id} className={`flex ${msg.isMe ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap break-words ${
              msg.isMe
                ? "bg-primary text-primary-foreground rounded-br-sm"
                : "bg-background border border-border text-foreground rounded-bl-sm"
            }`}>
              {msg.body}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="flex gap-1.5">
        <Input
          ref={inputRef}
          className="h-8 text-sm flex-1"
          placeholder={`Message ${agent.name}...`}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
        />
        <Button
          size="sm"
          className="h-8 w-8 p-0 shrink-0"
          onClick={send}
          disabled={!draft.trim()}
        >
          <Send className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ── Agent card ───────────────────────────────────────────────────────────────
function AgentCard({ agent, companyId, onWake, onPause, onResume, isPending }: {
  agent: PAgent;
  companyId: string;
  onWake: () => void;
  onPause: () => void;
  onResume: () => void;
  isPending: boolean;
}) {
  const budget = agent.budgetMonthlyCents ?? 0;
  const spent = agent.spentMonthlyCents ?? 0;
  const pct = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 0;
  const isPaused = agent.status === "paused";
  const [chatOpen, setChatOpen] = useState(false);

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Bot className="w-4.5 h-4.5 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-sm leading-tight">{agent.name}</p>
              <p className="text-xs text-muted-foreground">{agent.title ?? agent.role ?? "Agent"}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${statusColor(agent.status)}`} />
            <Badge variant="secondary" className="text-[10px] capitalize">{agent.status}</Badge>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3">
          <Clock className="w-3 h-3" />
          <span>{timeAgo(agent.lastHeartbeatAt)}</span>
        </div>

        {budget > 0 && (
          <div className="mb-3">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-muted-foreground">Budget</span>
              <span className="font-mono text-xs">{cents(spent)} / {cents(budget)}</span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${pct > 80 ? "bg-red-500" : pct > 50 ? "bg-amber-400" : "bg-emerald-500"}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )}

        <div className="flex gap-2 mt-3">
          {isPaused ? (
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 flex-1" onClick={onResume} disabled={isPending}>
              <Play className="w-3 h-3" /> Resume
            </Button>
          ) : (
            <>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 flex-1" onClick={onWake} disabled={isPending}>
                <RefreshCw className="w-3 h-3" /> Wake
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 flex-1" onClick={onPause} disabled={isPending}>
                <Pause className="w-3 h-3" /> Pause
              </Button>
            </>
          )}
          <Button
            size="sm"
            variant={chatOpen ? "default" : "outline"}
            className="h-7 gap-1.5 px-2.5 shrink-0 text-xs"
            onClick={() => setChatOpen(v => !v)}
          >
            <MessageSquare className="w-3 h-3" /> Chat
          </Button>
        </div>

        {chatOpen && (
          <AgentChat
            agent={agent}
            companyId={companyId}
            onClose={() => setChatOpen(false)}
          />
        )}
      </CardContent>
    </Card>
  );
}

// ── Create task form ─────────────────────────────────────────────────────────
function CreateTaskForm({ companyId, agents, onCreated }: {
  companyId: string;
  agents: PAgent[];
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "high">("medium");
  const createIssue = trpc.paperclip.createIssue.useMutation({
    onSuccess: () => { toast.success("Task created"); setTitle(""); onCreated(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="px-6 py-4 border-t border-border space-y-2">
      <Input
        className="h-8 text-xs"
        placeholder="Task title..."
        value={title}
        onChange={e => setTitle(e.target.value)}
        onKeyDown={e => e.key === "Enter" && title.trim() && createIssue.mutate({ companyId, title, assigneeId: assigneeId || undefined, priority })}
      />
      <div className="flex gap-2">
        <select
          className="flex-1 h-7 text-xs rounded-md border border-input bg-background px-2 text-muted-foreground"
          value={assigneeId}
          onChange={e => setAssigneeId(e.target.value)}
        >
          <option value="">Unassigned</option>
          {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select
          className="h-7 text-xs rounded-md border border-input bg-background px-2 text-muted-foreground"
          value={priority}
          onChange={e => setPriority(e.target.value as "low" | "medium" | "high")}
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
        <Button
          size="sm"
          className="h-7 w-7 p-0"
          disabled={!title.trim() || createIssue.isPending}
          onClick={() => createIssue.mutate({ companyId, title, assigneeId: assigneeId || undefined, priority })}
        >
          <Plus className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function Agents() {
  const utils = trpc.useUtils();
  const [showCreateTask, setShowCreateTask] = useState(false);

  const { data: companies = [], isError: companiesError } = trpc.paperclip.companies.useQuery(undefined, {
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const company = (companies as Array<{ id: string; name?: string }>)[0];
  const companyId = company?.id ?? "";

  const { data: agents = [] } = trpc.paperclip.agents.useQuery(
    { companyId },
    { enabled: !!companyId, refetchInterval: 15000 },
  ) as { data: PAgent[] };

  const { data: issues = [] } = trpc.paperclip.issues.useQuery(
    { companyId },
    { enabled: !!companyId, refetchInterval: 15000 },
  ) as { data: PIssue[] };

  const { data: costs } = trpc.paperclip.costs.useQuery(
    { companyId },
    { enabled: !!companyId, refetchInterval: 30000 },
  ) as { data: PCostSummary | undefined };

  const { data: runs = [] } = trpc.paperclip.heartbeatRuns.useQuery(
    { companyId },
    { enabled: !!companyId, refetchInterval: 15000 },
  ) as { data: PHeartbeatRun[] };

  const wakeAgent = trpc.paperclip.wakeAgent.useMutation({
    onSuccess: () => { utils.paperclip.agents.invalidate(); toast.success("Agent woken up"); },
    onError: (e) => toast.error(e.message),
  });
  const pauseAgent = trpc.paperclip.pauseAgent.useMutation({
    onSuccess: () => { utils.paperclip.agents.invalidate(); toast.success("Agent paused"); },
    onError: (e) => toast.error(e.message),
  });
  const resumeAgent = trpc.paperclip.resumeAgent.useMutation({
    onSuccess: () => { utils.paperclip.agents.invalidate(); toast.success("Agent resumed"); },
    onError: (e) => toast.error(e.message),
  });

  const activeTasks = issues.filter(i => i.status !== "done" && i.status !== "closed");
  const totalSpent = (costs as PCostSummary | undefined)?.totalCents ?? 0;
  const totalBudget = (costs as PCostSummary | undefined)?.budgetCents ?? agents.reduce((s, a) => s + (a.budgetMonthlyCents ?? 0), 0);
  const remaining = totalBudget - totalSpent;

  const agentMap = Object.fromEntries(agents.map(a => [a.id, a.name]));

  if (companiesError) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-bold tracking-tight">Agents</h1>
        <Card>
          <CardContent className="p-8 flex flex-col items-center gap-3 text-center">
            <AlertCircle className="w-8 h-8 text-muted-foreground" />
            <p className="font-medium">Paperclip not connected</p>
            <p className="text-sm text-muted-foreground max-w-sm">
              Set <code className="text-xs bg-muted px-1 rounded">PAPERCLIP_API_URL</code> and{" "}
              <code className="text-xs bg-muted px-1 rounded">PAPERCLIP_API_KEY</code> to connect.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Agents</h1>
          {company && <p className="text-sm text-muted-foreground mt-0.5">{(company as { name?: string }).name ?? "GD Operations"}</p>}
        </div>
      </div>

      {/* Stat row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard icon={Bot} label="Total Agents" value={agents.length} sub="Registered agents" />
        <StatCard icon={CheckSquare} label="Active Tasks" value={activeTasks.length} sub={`of ${issues.length} total`} />
        <StatCard icon={DollarSign} label="Monthly Spend" value={cents(totalSpent)} sub="This billing period" />
        <StatCard
          icon={Wallet}
          label="Budget Remaining"
          value={cents(remaining > 0 ? remaining : 0)}
          sub={totalBudget > 0 ? `of ${cents(totalBudget)} total` : "No budget set"}
          accent={remaining < totalBudget * 0.2 ? "amber" : undefined}
        />
      </div>

      {/* Agents grid */}
      {agents.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Agents</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {agents.map(agent => (
              <AgentCard
                key={agent.id}
                agent={agent}
                companyId={companyId}
                onWake={() => wakeAgent.mutate({ agentId: agent.id })}
                onPause={() => pauseAgent.mutate({ agentId: agent.id })}
                onResume={() => resumeAgent.mutate({ agentId: agent.id })}
                isPending={wakeAgent.isPending || pauseAgent.isPending || resumeAgent.isPending}
              />
            ))}
          </div>
        </div>
      )}

      {/* Tasks + Activity side by side on large screens */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6 items-start">

        {/* Active tasks */}
        <Card>
          <div className="px-6 py-4 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckSquare className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Active Tasks</span>
            </div>
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={() => setShowCreateTask(v => !v)}>
              <Plus className="w-3 h-3" /> New Task
            </Button>
          </div>
          {activeTasks.length === 0 ? (
            <CardContent className="p-6 text-center text-sm text-muted-foreground">No active tasks</CardContent>
          ) : (
            <div className="divide-y divide-border">
              {activeTasks.map(issue => (
                <div key={issue.id} className="px-6 py-3.5 flex items-center justify-between gap-3 hover:bg-muted/30 transition-colors">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{issue.title}</p>
                    {issue.assigneeAgentId && (
                      <p className="text-xs text-muted-foreground mt-0.5">{agentMap[issue.assigneeAgentId] ?? "Unknown agent"}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {issue.priority && (
                      <Badge variant={priorityVariant(issue.priority)} className="text-[10px] capitalize">{issue.priority}</Badge>
                    )}
                    <Badge variant="secondary" className="text-[10px] capitalize">{issue.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
          {showCreateTask && companyId && (
            <CreateTaskForm
              companyId={companyId}
              agents={agents}
              onCreated={() => { utils.paperclip.issues.invalidate(); setShowCreateTask(false); }}
            />
          )}
        </Card>

        {/* Heartbeat feed */}
        <Card>
          <div className="px-6 py-4 border-b border-border flex items-center gap-2">
            <Activity className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recent Activity</span>
          </div>
          {runs.length === 0 ? (
            <CardContent className="p-6 text-center text-sm text-muted-foreground">No heartbeat runs yet</CardContent>
          ) : (
            <div className="divide-y divide-border">
              {(runs as PHeartbeatRun[]).slice(0, 20).map(run => (
                <div key={run.id} className="px-6 py-3 flex items-center gap-3 hover:bg-muted/30 transition-colors">
                  <Circle className={`w-2 h-2 shrink-0 ${statusColor(run.status)} fill-current`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium truncate">
                      {run.agentId ? (agentMap[run.agentId] ?? "Unknown agent") : "System"}
                    </p>
                    <p className="text-[10px] text-muted-foreground capitalize">{run.status}</p>
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(run.startedAt)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
