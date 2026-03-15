import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckSquare, Square, Pencil, Trash2, Plus, Bug, Sparkles, ArrowRight, CheckCircle2, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";

function toDateStr(d: Date | string | null | undefined): string {
  if (!d) return "";
  if (typeof d === "string") return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

type Status = "todo" | "in_progress" | "blocked" | "done";
type Priority = "low" | "medium" | "high";

const STATUS_OPTIONS: { key: Status; label: string; color: string; bg: string }[] = [
  { key: "todo", label: "Todo", color: "text-slate-600", bg: "bg-slate-100" },
  { key: "in_progress", label: "In Progress", color: "text-blue-600", bg: "bg-blue-100" },
  { key: "blocked", label: "Blocked", color: "text-red-600", bg: "bg-red-100" },
  { key: "done", label: "Done", color: "text-emerald-600", bg: "bg-emerald-100" },
];

const PRIORITY_OPTIONS: { key: Priority; label: string; color: string }[] = [
  { key: "low", label: "Low", color: "text-slate-500" },
  { key: "medium", label: "Medium", color: "text-amber-600" },
  { key: "high", label: "High", color: "text-red-600" },
];

type TaskFormData = {
  text: string;
  status: Status;
  priority: string;
  dueDate: string;
  clientSlug: string;
  notes: string;
};

const emptyForm = (): TaskFormData => ({
  text: "",
  status: "todo",
  priority: "",
  dueDate: "",
  clientSlug: "",
  notes: "",
});

function StatusBadge({ status }: { status: string }) {
  const opt = STATUS_OPTIONS.find(s => s.key === status) ?? STATUS_OPTIONS[0];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${opt.bg} ${opt.color}`}>
      {opt.label}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: string | null }) {
  if (!priority) return null;
  const opt = PRIORITY_OPTIONS.find(p => p.key === priority);
  if (!opt) return null;
  return (
    <span className={`inline-flex items-center text-[10px] font-semibold ${opt.color}`}>
      {opt.label}
    </span>
  );
}

// Extract URL from notes field (appended as "\n\nURL: ...")
function extractUrl(notes: string | null | undefined): string | null {
  if (!notes) return null;
  const match = notes.match(/URL:\s*(\S+)\s*$/m);
  return match ? match[1] : null;
}

function stripUrlFromNotes(notes: string | null | undefined): string {
  if (!notes) return "";
  return notes.replace(/\n\nURL:\s*\S+\s*$/, "").trim();
}

export default function Tasks() {
  const utils = trpc.useUtils();
  const { data: tasks = [], isLoading } = trpc.task.list.useQuery();
  const { data: clients = [] } = trpc.invoice.clients.useQuery();

  type Task = (typeof tasks)[0];

  const [activeTab, setActiveTab] = useState<"tasks" | "feedback">("tasks");
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [clientFilter, setClientFilter] = useState<string>("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [form, setForm] = useState<TaskFormData>(emptyForm());
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [triageConfirm, setTriageConfirm] = useState<number | null>(null);
  const [selectedFeedback, setSelectedFeedback] = useState<Task | null>(null);
  const [resolvedExpanded, setResolvedExpanded] = useState(true);

  const createMutation = trpc.task.create.useMutation({
    onSuccess: () => {
      utils.task.list.invalidate();
      setDialogOpen(false);
      setForm(emptyForm());
      toast.success("Task added");
    },
    onError: () => toast.error("Failed to add task"),
  });

  const updateMutation = trpc.task.update.useMutation({
    onSuccess: () => {
      utils.task.list.invalidate();
      setDialogOpen(false);
      setEditingTask(null);
      setForm(emptyForm());
      toast.success("Task updated");
    },
    onError: () => toast.error("Failed to update task"),
  });

  const setDoneMutation = trpc.task.setDone.useMutation({
    onSuccess: () => utils.task.list.invalidate(),
  });

  const deleteMutation = trpc.task.delete.useMutation({
    onSuccess: () => {
      utils.task.list.invalidate();
      setDeleteConfirm(null);
      toast.success("Task deleted");
    },
    onError: () => toast.error("Failed to delete task"),
  });

  function openAdd() {
    setEditingTask(null);
    setForm(emptyForm());
    setDialogOpen(true);
  }

  function openEdit(task: Task) {
    setEditingTask(task);
    setForm({
      text: task.text,
      status: (task.status as Status) ?? "todo",
      priority: task.priority ?? "",
      dueDate: toDateStr(task.dueDate),
      clientSlug: task.clientSlug ?? "",
      notes: task.notes ?? "",
    });
    setDialogOpen(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const client = clients.find(c => c.clientSlug === form.clientSlug);
    const payload = {
      text: form.text.trim(),
      clientSlug: client?.clientSlug ?? null,
      clientName: client?.clientName ?? null,
      status: form.status,
      dueDate: form.dueDate || null,
      priority: form.priority || null,
      notes: form.notes.trim() || null,
    };
    if (editingTask) {
      updateMutation.mutate({ id: editingTask.id, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  function toggleDone(task: Task) {
    const isDone = task.status === "done";
    setDoneMutation.mutate({ id: task.id, done: !isDone });
  }

  function triage(task: Task) {
    setDoneMutation.mutate({ id: task.id, done: false });
    setTriageConfirm(null);
    toast.success("Moved to Tasks");
  }

  function resolve(task: Task) {
    updateMutation.mutate({
      id: task.id,
      text: task.text,
      clientSlug: task.clientSlug ?? null,
      clientName: task.clientName ?? null,
      status: "resolved",
      dueDate: task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 10) : null,
      priority: task.priority ?? null,
      notes: task.notes ?? null,
    });
    toast.success("Marked as resolved");
  }

  const today = new Date().toISOString().split("T")[0];

  // Separate feedback tasks from normal tasks
  const feedbackTasks = tasks.filter(t => t.status === "bug" || t.status === "feature" || t.status === "resolved");
  const bugTasks = feedbackTasks.filter(t => t.status === "bug");
  const featureTasks = feedbackTasks.filter(t => t.status === "feature");
  const resolvedTasks = feedbackTasks.filter(t => t.status === "resolved");

  const filtered = tasks.filter(t => {
    // Exclude feedback tasks from normal task list
    if (t.status === "bug" || t.status === "feature" || t.status === "resolved") return false;
    if (statusFilter === "active") {
      if (t.status !== "todo" && t.status !== "in_progress") return false;
    } else if (statusFilter !== "all" && t.status !== statusFilter) return false;
    if (clientFilter && t.clientSlug !== clientFilter) return false;
    return true;
  });

  const normalTasks = tasks.filter(t => t.status !== "bug" && t.status !== "feature");
  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tasks</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {normalTasks.filter(t => t.status !== "done").length} open
            {normalTasks.length > 0 && ` · ${normalTasks.length} total`}
          </p>
        </div>
        {activeTab === "tasks" && (
          <Button onClick={openAdd} size="sm" className="gap-1.5">
            <Plus className="w-3.5 h-3.5" />
            Add Task
          </Button>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1 w-fit">
        <button
          onClick={() => setActiveTab("tasks")}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
            activeTab === "tasks"
              ? "bg-background shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Tasks
        </button>
        <button
          onClick={() => setActiveTab("feedback")}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 ${
            activeTab === "feedback"
              ? "bg-background shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Feedback
          {(bugTasks.length + featureTasks.length) > 0 && (
            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold">
              {bugTasks.length + featureTasks.length}
            </span>
          )}
        </button>
      </div>

      {activeTab === "tasks" ? (
        <>
          {/* Filter bar */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1">
              {[{ key: "all", label: "All" }, { key: "active", label: "Active" }, ...STATUS_OPTIONS.map(s => ({ key: s.key, label: s.label }))].map(s => (
                <button
                  key={s.key}
                  onClick={() => setStatusFilter(s.key)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                    statusFilter === s.key
                      ? "bg-background shadow-sm text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
            {clients.length > 0 && (
              <select
                className="h-8 text-xs rounded-md border border-input bg-background px-2 text-muted-foreground"
                value={clientFilter}
                onChange={e => setClientFilter(e.target.value)}
              >
                <option value="">All clients</option>
                {clients.map(c => (
                  <option key={c.clientSlug} value={c.clientSlug}>{c.clientName}</option>
                ))}
              </select>
            )}
          </div>

          {/* Task list */}
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-14 rounded-lg bg-muted/40 animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground text-sm">
              {normalTasks.length === 0 ? "No tasks yet. Add one to get started." : "No tasks match the current filter."}
            </div>
          ) : (
            <div className="divide-y divide-border border border-border rounded-lg overflow-hidden">
              {filtered.map(task => {
                const isDone = task.status === "done";
                const dueDateStr = toDateStr(task.dueDate);
                const isOverdue = dueDateStr && dueDateStr < today && !isDone;
                return (
                  <div key={task.id} className="flex items-start gap-3 px-4 py-3 bg-background hover:bg-muted/30 group transition-colors">
                    <button
                      className={`mt-0.5 shrink-0 transition-colors ${isDone ? "text-emerald-600 hover:text-muted-foreground" : "text-muted-foreground hover:text-emerald-600"}`}
                      onClick={() => toggleDone(task)}
                    >
                      {isDone ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                    </button>
                    <div className="flex-1 min-w-0 space-y-1">
                      <p className={`text-sm font-medium leading-snug ${isDone ? "line-through text-muted-foreground" : "text-foreground"}`}>
                        {task.text}
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={task.status} />
                        {task.priority && <PriorityBadge priority={task.priority} />}
                        {dueDateStr && (
                          <span className={`text-[10px] font-medium ${isOverdue ? "text-red-600" : "text-muted-foreground"}`}>
                            {isOverdue ? "Overdue · " : ""}{dueDateStr}
                          </span>
                        )}
                        {task.clientName && (
                          <span className="text-[10px] text-muted-foreground">{task.clientName}</span>
                        )}
                        {task.notes && (
                          <span className="text-[10px] text-muted-foreground italic truncate max-w-[200px]">
                            {task.notes}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5">
                      <button
                        className="text-muted-foreground hover:text-foreground transition-colors"
                        onClick={() => openEdit(task)}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      {deleteConfirm === task.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            className="text-[10px] text-red-600 font-semibold hover:text-red-700"
                            onClick={() => deleteMutation.mutate({ id: task.id })}
                          >
                            Delete
                          </button>
                          <button
                            className="text-[10px] text-muted-foreground hover:text-foreground"
                            onClick={() => setDeleteConfirm(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          className="text-muted-foreground hover:text-destructive transition-colors"
                          onClick={() => setDeleteConfirm(task.id)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : (
        /* Feedback tab */
        <div className="space-y-8">
          {feedbackTasks.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground text-sm">
              No feedback submitted yet.
            </div>
          ) : (
            <>
              {/* Bugs section */}
              {bugTasks.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Bug className="w-4 h-4 text-red-500" />
                    <h2 className="text-sm font-semibold text-foreground">Bugs</h2>
                    <span className="text-xs text-muted-foreground">({bugTasks.length})</span>
                  </div>
                  <div className="divide-y divide-border border border-border rounded-lg overflow-hidden">
                    {bugTasks.map(task => (
                      <FeedbackRow
                        key={task.id}
                        task={task}
                        triageConfirm={triageConfirm}
                        deleteConfirm={deleteConfirm}
                        onOpen={() => setSelectedFeedback(task)}
                        onResolve={() => resolve(task)}
                        onTriage={() => triage(task)}
                        onTriageConfirm={() => setTriageConfirm(task.id)}
                        onTriageCancel={() => setTriageConfirm(null)}
                        onDeleteConfirm={() => setDeleteConfirm(task.id)}
                        onDeleteCancel={() => setDeleteConfirm(null)}
                        onDelete={() => deleteMutation.mutate({ id: task.id })}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Features section */}
              {featureTasks.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    <h2 className="text-sm font-semibold text-foreground">Feature Requests</h2>
                    <span className="text-xs text-muted-foreground">({featureTasks.length})</span>
                  </div>
                  <div className="divide-y divide-border border border-border rounded-lg overflow-hidden">
                    {featureTasks.map(task => (
                      <FeedbackRow
                        key={task.id}
                        task={task}
                        triageConfirm={triageConfirm}
                        deleteConfirm={deleteConfirm}
                        onOpen={() => setSelectedFeedback(task)}
                        onResolve={() => resolve(task)}
                        onTriage={() => triage(task)}
                        onTriageConfirm={() => setTriageConfirm(task.id)}
                        onTriageCancel={() => setTriageConfirm(null)}
                        onDeleteConfirm={() => setDeleteConfirm(task.id)}
                        onDeleteCancel={() => setDeleteConfirm(null)}
                        onDelete={() => deleteMutation.mutate({ id: task.id })}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Resolved section */}
              {resolvedTasks.length > 0 && (
                <div>
                  <button
                    className="flex items-center gap-2 mb-3 w-full text-left group"
                    onClick={() => setResolvedExpanded(v => !v)}
                  >
                    {resolvedExpanded
                      ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                      : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
                    <h2 className="text-sm font-semibold text-muted-foreground group-hover:text-foreground transition-colors">Resolved</h2>
                    <span className="text-xs text-muted-foreground">({resolvedTasks.length})</span>
                  </button>
                  {resolvedExpanded && (
                    <div className="divide-y divide-border border border-border rounded-lg overflow-hidden opacity-75">
                      {resolvedTasks.map(task => (
                        <FeedbackRow
                          key={task.id}
                          task={task}
                          triageConfirm={triageConfirm}
                          deleteConfirm={deleteConfirm}
                          onOpen={() => setSelectedFeedback(task)}
                          onResolve={() => resolve(task)}
                          onTriage={() => triage(task)}
                          onTriageConfirm={() => setTriageConfirm(task.id)}
                          onTriageCancel={() => setTriageConfirm(null)}
                          onDeleteConfirm={() => setDeleteConfirm(task.id)}
                          onDeleteCancel={() => setDeleteConfirm(null)}
                          onDelete={() => deleteMutation.mutate({ id: task.id })}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Feedback detail modal */}
      {selectedFeedback && (
        <FeedbackDetailModal
          task={selectedFeedback}
          onClose={() => setSelectedFeedback(null)}
          onResolve={() => { resolve(selectedFeedback); setSelectedFeedback(null); }}
          onTriage={() => { triage(selectedFeedback); setSelectedFeedback(null); }}
          onDelete={() => { deleteMutation.mutate({ id: selectedFeedback.id }); setSelectedFeedback(null); }}
        />
      )}

      {/* Add / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={open => { setDialogOpen(open); if (!open) setEditingTask(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingTask ? "Edit Task" : "Add Task"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Task *</label>
              <Textarea
                autoFocus
                placeholder="Describe the task..."
                value={form.text}
                onChange={e => setForm(f => ({ ...f, text: e.target.value }))}
                className="min-h-[80px] text-sm"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Status</label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v as Status }))}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map(s => (
                      <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Priority</label>
                <Select
                  value={form.priority || "none"}
                  onValueChange={v => setForm(f => ({ ...f, priority: v === "none" ? "" : v }))}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {PRIORITY_OPTIONS.map(p => (
                      <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Due date</label>
                <Input
                  type="date"
                  className="h-8 text-xs"
                  value={form.dueDate}
                  onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Client</label>
                <select
                  className="w-full h-8 text-xs rounded-md border border-input bg-background px-2 text-muted-foreground"
                  value={form.clientSlug}
                  onChange={e => setForm(f => ({ ...f, clientSlug: e.target.value }))}
                >
                  <option value="">No client</option>
                  {clients.map(c => (
                    <option key={c.clientSlug} value={c.clientSlug}>{c.clientName}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Notes</label>
              <Textarea
                placeholder="Optional notes..."
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                className="min-h-[60px] text-sm"
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" size="sm" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={!form.text.trim() || isPending}>
                {editingTask ? "Save changes" : "Add task"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function formatTimestamp(d: Date | string | null | undefined): string {
  if (!d) return "";
  return new Date(d).toLocaleString("en-ZA", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

type FeedbackRowProps = {
  task: { id: number; text: string; status: string; notes: string | null; clientName: string | null; createdAt: Date | string | null };
  triageConfirm: number | null;
  deleteConfirm: number | null;
  onOpen: () => void;
  onResolve: () => void;
  onTriage: () => void;
  onTriageConfirm: () => void;
  onTriageCancel: () => void;
  onDeleteConfirm: () => void;
  onDeleteCancel: () => void;
  onDelete: () => void;
};

function FeedbackRow({
  task,
  triageConfirm,
  deleteConfirm,
  onOpen,
  onResolve,
  onTriage,
  onTriageConfirm,
  onTriageCancel,
  onDeleteConfirm,
  onDeleteCancel,
  onDelete,
}: FeedbackRowProps) {
  const url = extractUrl(task.notes);
  const description = stripUrlFromNotes(task.notes);
  const timestamp = formatTimestamp(task.createdAt);

  return (
    <div
      className="flex items-start gap-3 px-4 py-3 bg-background hover:bg-muted/30 group transition-colors cursor-pointer"
      onClick={onOpen}
    >
      <div className="flex-1 min-w-0 space-y-1.5">
        <p className="text-sm font-medium leading-snug text-foreground">{task.text}</p>
        {description && (
          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{description}</p>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {task.clientName && (
            <span className="text-[10px] text-muted-foreground font-medium">{task.clientName}</span>
          )}
          {url && (
            <span className="text-[10px] text-primary truncate max-w-[200px]" title={url}>
              {url.replace(/^https?:\/\/[^/]+/, "") || url}
            </span>
          )}
          {timestamp && (
            <span className="text-[10px] text-muted-foreground">{timestamp}</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5">
        <button
          className="text-muted-foreground hover:text-emerald-600 transition-colors"
          title="Mark as resolved"
          onClick={e => { e.stopPropagation(); onResolve(); }}
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
        </button>
        {triageConfirm === task.id ? (
          <div className="flex items-center gap-1">
            <button
              className="text-[10px] text-primary font-semibold hover:text-primary/80"
              onClick={e => { e.stopPropagation(); onTriage(); }}
            >
              Move
            </button>
            <button
              className="text-[10px] text-muted-foreground hover:text-foreground"
              onClick={e => { e.stopPropagation(); onTriageCancel(); }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            className="text-muted-foreground hover:text-primary transition-colors"
            title="Move to Tasks"
            onClick={e => { e.stopPropagation(); onTriageConfirm(); }}
          >
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        )}
        {deleteConfirm === task.id ? (
          <div className="flex items-center gap-1">
            <button
              className="text-[10px] text-red-600 font-semibold hover:text-red-700"
              onClick={e => { e.stopPropagation(); onDelete(); }}
            >
              Delete
            </button>
            <button
              className="text-[10px] text-muted-foreground hover:text-foreground"
              onClick={e => { e.stopPropagation(); onDeleteCancel(); }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            className="text-muted-foreground hover:text-destructive transition-colors"
            onClick={e => { e.stopPropagation(); onDeleteConfirm(); }}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

type FeedbackDetailModalProps = {
  task: { id: number; text: string; status: string; notes: string | null; clientName: string | null; createdAt: Date | string | null };
  onClose: () => void;
  onResolve: () => void;
  onTriage: () => void;
  onDelete: () => void;
};

function FeedbackDetailModal({ task, onClose, onResolve, onTriage, onDelete }: FeedbackDetailModalProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const url = extractUrl(task.notes);
  const description = stripUrlFromNotes(task.notes);
  const timestamp = formatTimestamp(task.createdAt);
  const isBug = task.status === "bug";
  const isResolved = task.status === "resolved";

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            {isResolved
              ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              : isBug
              ? <Bug className="w-4 h-4 text-red-500 shrink-0" />
              : <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />}
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {isResolved ? "Resolved" : isBug ? "Bug Report" : "Feature Request"}
            </span>
          </div>
          <DialogTitle className="text-base leading-snug">{task.text}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-1">
          {description && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Description</p>
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{description}</p>
            </div>
          )}

          {url && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Page URL</p>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline break-all"
              >
                {url}
              </a>
            </div>
          )}

          <div className="flex flex-wrap gap-x-6 gap-y-2 pt-1 border-t border-border">
            {task.clientName && (
              <div>
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Submitted by</p>
                <p className="text-xs text-foreground mt-0.5">{task.clientName}</p>
              </div>
            )}
            {timestamp && (
              <div>
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Submitted at</p>
                <p className="text-xs text-foreground mt-0.5">{timestamp}</p>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          {confirmDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Delete this item?</span>
              <Button variant="destructive" size="sm" onClick={onDelete}>Delete</Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>Cancel</Button>
            </div>
          ) : (
            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />
              Delete
            </Button>
          )}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
            {!isResolved && (
              <Button variant="outline" size="sm" className="text-emerald-700 border-emerald-200 hover:bg-emerald-50" onClick={onResolve}>
                <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                Mark as Resolved
              </Button>
            )}
            <Button size="sm" onClick={onTriage}>
              <ArrowRight className="w-3.5 h-3.5 mr-1.5" />
              Move to Tasks
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
