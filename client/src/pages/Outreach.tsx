import { trpc } from "@/lib/trpc";
import { useState, useRef } from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  useDroppable,
  useDraggable,
  type DragEndEvent,
} from "@dnd-kit/core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import {
  Search, Loader2, ExternalLink, Trash2, Mail, Wand2, Send,
  CheckCheck, Plus, AlertTriangle, Gauge, Globe, Phone, MapPin, Building2,
  Star, Link2, FolderSearch, Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Link } from "wouter";

type ProspectStatus = "new" | "emailed" | "replied" | "converted";

type Prospect = {
  id: number;
  businessName: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  website: string | null;
  address: string | null;
  industry: string | null;
  pageSpeedScore: number | null;
  issues: string | null;
  businessContext: string | null;
  leadScore: number | null;
  googleRating: string | null;
  googleReviewCount: number | null;
  status: ProspectStatus;
  lastEmailSubject: string | null;
  lastEmailBody: string | null;
  lastEmailSentAt: Date | string | null;
  notes: string | null;
  leadId: number | null;
};

type Candidate = {
  businessName: string;
  address: string;
  phone: string;
  website: string;
  pageSpeedScore: number | null;
  contactEmail: string;
  issues: string[];
  businessContext: string;
  leadScore: number;
  googleRating: number | null;
  googleReviewCount: number | null;
};

type Directory = { title: string; url: string; description: string };

// ── Column config ─────────────────────────────────────────────────────────────

const COLUMNS: { status: ProspectStatus; label: string; color: string; headerBg: string }[] = [
  { status: "new",       label: "New",       color: "text-zinc-600",   headerBg: "bg-zinc-100 border-zinc-200" },
  { status: "emailed",   label: "Contacted", color: "text-blue-700",   headerBg: "bg-blue-50 border-blue-200" },
  { status: "replied",   label: "Replied",   color: "text-green-700",  headerBg: "bg-green-50 border-green-200" },
  { status: "converted", label: "Converted", color: "text-emerald-700",headerBg: "bg-emerald-50 border-emerald-200" },
];

const STATUS_BADGE: Record<ProspectStatus, string> = {
  new:       "bg-zinc-100 text-zinc-600 border-zinc-200",
  emailed:   "bg-blue-50 text-blue-700 border-blue-200",
  replied:   "bg-green-50 text-green-700 border-green-200",
  converted: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

// ── Shared helpers ────────────────────────────────────────────────────────────

function ScoreBadge({ score, issues }: { score: number | null; issues: string[] }) {
  if (issues.includes("No website")) {
    return (
      <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full bg-zinc-100 text-zinc-600 border border-zinc-200">
        <Globe className="h-3 w-3" /> No website
      </span>
    );
  }
  if (score !== null) {
    const color = score < 30 ? "bg-red-50 text-red-700 border-red-200" : "bg-amber-50 text-amber-700 border-amber-200";
    return (
      <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full border ${color}`}>
        <Gauge className="h-3 w-3" /> {score}/100
      </span>
    );
  }
  return null;
}

function IssueBadges({ issues }: { issues: string[] }) {
  return (
    <>
      {issues.map((issue) => (
        <span key={issue} className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200">
          <AlertTriangle className="h-3 w-3" /> {issue}
        </span>
      ))}
    </>
  );
}

function LeadScoreBadge({ score }: { score: number }) {
  const color = score >= 70
    ? "bg-green-50 text-green-700 border-green-200"
    : score >= 40
    ? "bg-amber-50 text-amber-700 border-amber-200"
    : "bg-red-50 text-red-700 border-red-200";
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full border font-medium ${color}`}>
      <Sparkles className="h-3 w-3" /> {score}
    </span>
  );
}

// ── Prospect detail modal ─────────────────────────────────────────────────────

function ProspectModal({
  prospect,
  onClose,
  onRefresh,
}: {
  prospect: Prospect;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const issues: string[] = prospect.issues ? JSON.parse(prospect.issues) : [];
  const [draft, setDraft] = useState<{ subject: string; body: string } | null>(null);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editingEmail, setEditingEmail] = useState(false);
  const [emailInput, setEmailInput] = useState(prospect.contactEmail ?? "");
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesInput, setNotesInput] = useState(prospect.notes ?? "");

  const updateProspect = trpc.outreach.prospect.update.useMutation({
    onSuccess: () => { setEditingEmail(false); setEditingNotes(false); onRefresh(); },
    onError: (e) => toast.error(e.message),
  });

  const draftEmail = trpc.outreach.draftEmail.useMutation({
    onSuccess: (data) => { setDraft(data); setEditSubject(data.subject); setEditBody(data.body); },
    onError: (e) => toast.error(e.message),
  });

  const saveGmailDraft = trpc.outreach.saveGmailDraft.useMutation({
    onSuccess: () => { toast.success("Saved to Gmail drafts!"); setDraft(null); onRefresh(); },
    onError: (e) => toast.error(e.message),
  });

  const markReplied = trpc.outreach.markReplied.useMutation({
    onSuccess: () => { toast.success("Marked as replied"); onRefresh(); },
    onError: (e) => toast.error(e.message),
  });

  const convertToLead = trpc.outreach.convertToLead.useMutation({
    onSuccess: () => { toast.success("Converted to lead!"); onRefresh(); },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.outreach.prospect.delete.useMutation({
    onSuccess: () => { onClose(); onRefresh(); },
    onError: (e) => toast.error(e.message),
  });

  const hunterLookup = trpc.outreach.hunterLookup.useMutation({
    onSuccess: (data) => {
      if (data.found) {
        toast.success(`Found: ${data.email}${data.contactName ? ` (${data.contactName})` : ""}`);
        onRefresh();
      } else {
        toast.info("No emails found via Hunter.io for this domain");
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const col = COLUMNS.find((c) => c.status === prospect.status)!;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between gap-2 pr-6">
            <div>
              <DialogTitle className="text-lg">{prospect.businessName}</DialogTitle>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className={`inline-block text-xs px-2 py-0.5 rounded-full border font-medium ${STATUS_BADGE[prospect.status]}`}>
                  {col.label}
                </span>
                {prospect.leadScore != null && <LeadScoreBadge score={prospect.leadScore} />}
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {/* Details */}
          <div className="space-y-1.5 text-sm">
            {prospect.address && (
              <div className="flex items-start gap-2 text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>{prospect.address}</span>
              </div>
            )}
            {prospect.contactPhone && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Phone className="h-3.5 w-3.5 shrink-0" />
                <span>{prospect.contactPhone}</span>
              </div>
            )}
            {prospect.website && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Globe className="h-3.5 w-3.5 shrink-0" />
                <a href={prospect.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-foreground hover:underline">
                  {prospect.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}
            {prospect.industry && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Building2 className="h-3.5 w-3.5 shrink-0" />
                <span>{prospect.industry}</span>
              </div>
            )}
            {(prospect.googleReviewCount != null || prospect.googleRating != null) && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Star className="h-3.5 w-3.5 shrink-0" />
                <span>
                  {prospect.googleRating != null && `${prospect.googleRating} stars`}
                  {prospect.googleRating != null && prospect.googleReviewCount != null && " · "}
                  {prospect.googleReviewCount != null && `${prospect.googleReviewCount} reviews`}
                </span>
              </div>
            )}
          </div>

          {/* Issues */}
          {issues.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">Issues found</p>
              <div className="flex flex-wrap gap-1.5">
                <ScoreBadge score={prospect.pageSpeedScore} issues={issues} />
                <IssueBadges issues={issues.filter((i) => !i.startsWith("Score:"))} />
              </div>
            </div>
          )}

          {/* Business context */}
          {prospect.businessContext && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">About this business</p>
              <p className="text-sm text-muted-foreground leading-relaxed">{prospect.businessContext}</p>
            </div>
          )}

          {/* Email */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Email address</p>
            {editingEmail ? (
              <div className="flex gap-2">
                <Input
                  type="email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="contact@business.co.za"
                  className="h-8 text-sm"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") updateProspect.mutate({ id: prospect.id, contactEmail: emailInput.trim() });
                    if (e.key === "Escape") setEditingEmail(false);
                  }}
                />
                <Button size="sm" className="h-8" onClick={() => updateProspect.mutate({ id: prospect.id, contactEmail: emailInput.trim() })} disabled={updateProspect.isPending}>Save</Button>
                <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditingEmail(false)}>Cancel</Button>
              </div>
            ) : prospect.contactEmail ? (
              <button onClick={() => { setEmailInput(prospect.contactEmail ?? ""); setEditingEmail(true); }} className="text-sm text-blue-600 hover:underline">
                {prospect.contactEmail}
              </button>
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                <button onClick={() => { setEmailInput(""); setEditingEmail(true); }} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5" /> Add email address
                </button>
                {prospect.website && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => hunterLookup.mutate({ prospectId: prospect.id })}
                    disabled={hunterLookup.isPending}
                  >
                    {hunterLookup.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Search className="h-3 w-3 mr-1" />}
                    Find via Hunter.io
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Last email */}
          {prospect.lastEmailSubject && (
            <div className="bg-muted/40 rounded-md p-3 space-y-1 text-sm">
              <p className="text-xs font-medium text-muted-foreground">Last email</p>
              <p className="font-medium">{prospect.lastEmailSubject}</p>
              {prospect.lastEmailSentAt && (
                <p className="text-xs text-muted-foreground">
                  {new Date(prospect.lastEmailSentAt).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}
                </p>
              )}
              {prospect.lastEmailBody && (
                <p className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-4 mt-1">{prospect.lastEmailBody}</p>
              )}
            </div>
          )}

          {/* Notes */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Notes</p>
            {editingNotes ? (
              <div className="space-y-2">
                <Textarea
                  value={notesInput}
                  onChange={(e) => setNotesInput(e.target.value)}
                  rows={3}
                  className="text-sm"
                  autoFocus
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => updateProspect.mutate({ id: prospect.id, notes: notesInput })} disabled={updateProspect.isPending}>Save</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingNotes(false)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <button onClick={() => setEditingNotes(true)} className="text-sm text-left w-full text-muted-foreground hover:text-foreground">
                {prospect.notes || <span className="italic">Add notes…</span>}
              </button>
            )}
          </div>

          {/* Draft composer */}
          {draft && (
            <div className="space-y-2 border-t pt-4">
              <p className="text-xs font-medium text-muted-foreground">Email draft</p>
              <div>
                <Label className="text-xs">Subject</Label>
                <Input value={editSubject} onChange={(e) => setEditSubject(e.target.value)} className="mt-1 text-sm" />
              </div>
              <div>
                <Label className="text-xs">Body</Label>
                <Textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} rows={9} className="mt-1 text-sm font-mono" />
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  size="sm"
                  onClick={() => saveGmailDraft.mutate({ prospectId: prospect.id, subject: editSubject, body: editBody })}
                  disabled={saveGmailDraft.isPending || !prospect.contactEmail}
                >
                  {saveGmailDraft.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                  Save to Gmail drafts
                </Button>
                {!prospect.contactEmail && <p className="text-xs text-amber-600">Add an email address first</p>}
                <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>Discard</Button>
              </div>
            </div>
          )}

          {/* Actions */}
          {!draft && (
            <div className="border-t pt-4 flex flex-wrap gap-2">
              {prospect.status === "new" && (
                <Button size="sm" variant="outline" onClick={() => draftEmail.mutate({ prospectId: prospect.id })} disabled={draftEmail.isPending}>
                  {draftEmail.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Wand2 className="h-4 w-4 mr-2" />}
                  Draft email
                </Button>
              )}
              {prospect.status === "emailed" && (
                <>
                  <Button size="sm" variant="outline" onClick={() => draftEmail.mutate({ prospectId: prospect.id, isFollowUp: true })} disabled={draftEmail.isPending}>
                    {draftEmail.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Mail className="h-4 w-4 mr-2" />}
                    Draft follow-up
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => markReplied.mutate({ prospectId: prospect.id })} disabled={markReplied.isPending}>
                    <CheckCheck className="h-4 w-4 mr-2" /> Mark replied
                  </Button>
                </>
              )}
              {prospect.status === "replied" && (
                <Button size="sm" onClick={() => convertToLead.mutate({ prospectId: prospect.id })} disabled={convertToLead.isPending}>
                  {convertToLead.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                  Convert to lead
                </Button>
              )}
              {prospect.status === "converted" && prospect.leadId && (
                <Link href="/leads" onClick={onClose}>
                  <Button size="sm" variant="outline">View lead →</Button>
                </Link>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground hover:text-destructive ml-auto"
                onClick={() => deleteMutation.mutate({ id: prospect.id })}
                disabled={deleteMutation.isPending}
              >
                <Trash2 className="h-4 w-4 mr-1.5" /> Delete
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Kanban card ───────────────────────────────────────────────────────────────

function KanbanCardContent({ prospect, isDragging = false }: { prospect: Prospect; isDragging?: boolean }) {
  const issues: string[] = prospect.issues ? JSON.parse(prospect.issues) : [];
  return (
    <div className={`w-full text-left bg-card border rounded-lg p-3 space-y-2 group transition-all
      ${isDragging ? "shadow-xl rotate-1 opacity-90 cursor-grabbing" : "hover:shadow-md hover:border-foreground/20 cursor-grab"}`}>
      <div className="flex items-start justify-between gap-1">
        <p className="font-medium text-sm leading-snug group-hover:text-primary transition-colors select-none">
          {prospect.businessName}
        </p>
        {prospect.leadScore != null && <LeadScoreBadge score={prospect.leadScore} />}
      </div>
      {prospect.address && (
        <p className="text-xs text-muted-foreground line-clamp-1 select-none">{prospect.address}</p>
      )}
      <div className="flex flex-wrap gap-1">
        <ScoreBadge score={prospect.pageSpeedScore} issues={issues} />
        <IssueBadges issues={issues.filter((i) => !i.startsWith("Score:"))} />
      </div>
      {prospect.contactEmail ? (
        <p className="text-xs text-blue-600 truncate select-none">{prospect.contactEmail}</p>
      ) : (
        <p className="text-xs text-muted-foreground/60 italic select-none">No email</p>
      )}
      {prospect.status === "emailed" && prospect.lastEmailSubject && (
        <p className="text-xs text-muted-foreground truncate select-none">✉ {prospect.lastEmailSubject}</p>
      )}
    </div>
  );
}

function DraggableCard({ prospect, onClick }: { prospect: Prospect; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: prospect.id });
  const dragStartPos = useRef<{ x: number; y: number } | null>(null);

  return (
    <div
      ref={setNodeRef}
      style={{ opacity: isDragging ? 0.3 : 1 }}
      {...listeners}
      {...attributes}
      onPointerDown={(e) => {
        dragStartPos.current = { x: e.clientX, y: e.clientY };
        if (listeners?.onPointerDown) listeners.onPointerDown(e);
      }}
      onClick={(e) => {
        if (dragStartPos.current) {
          const dx = Math.abs(e.clientX - dragStartPos.current.x);
          const dy = Math.abs(e.clientY - dragStartPos.current.y);
          if (dx < 5 && dy < 5) onClick();
        }
      }}
    >
      <KanbanCardContent prospect={prospect} />
    </div>
  );
}

function DroppableColumn({
  col,
  prospects,
  onCardClick,
  isOver,
}: {
  col: typeof COLUMNS[number];
  prospects: Prospect[];
  onCardClick: (p: Prospect) => void;
  isOver: boolean;
}) {
  const { setNodeRef } = useDroppable({ id: col.status });

  return (
    <div className="flex-shrink-0 w-64">
      <div className={`flex items-center justify-between px-3 py-2 rounded-t-lg border ${col.headerBg} mb-2`}>
        <span className={`text-xs font-semibold uppercase tracking-wide ${col.color}`}>{col.label}</span>
        <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${col.headerBg} ${col.color} border`}>
          {prospects.length}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={`space-y-2 min-h-[120px] rounded-lg transition-colors p-1 -m-1
          ${isOver ? "bg-primary/5 ring-2 ring-primary/20" : ""}`}
      >
        {prospects.length === 0 ? (
          <div className={`border-2 border-dashed rounded-lg p-4 text-center text-xs transition-colors
            ${isOver ? "border-primary/30 text-primary/50" : "border-muted text-muted-foreground/50"}`}>
            Drop here
          </div>
        ) : (
          prospects.map((p) => (
            <DraggableCard key={p.id} prospect={p} onClick={() => onCardClick(p)} />
          ))
        )}
      </div>
    </div>
  );
}

// ── Kanban board ──────────────────────────────────────────────────────────────

function KanbanBoard({ prospects, onRefresh }: { prospects: Prospect[]; onRefresh: () => void }) {
  const [selected, setSelected] = useState<Prospect | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [overId, setOverId] = useState<ProspectStatus | null>(null);

  const updateStatus = trpc.outreach.prospect.update.useMutation({
    onSuccess: onRefresh,
    onError: (e) => toast.error(e.message),
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const activeProspect = activeId ? prospects.find((p) => p.id === activeId) : null;

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    setOverId(null);
    if (!over) return;
    const newStatus = over.id as ProspectStatus;
    const prospect = prospects.find((p) => p.id === active.id);
    if (!prospect || prospect.status === newStatus) return;
    updateStatus.mutate({ id: prospect.id, status: newStatus });
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        onDragStart={({ active }) => setActiveId(active.id as number)}
        onDragOver={({ over }) => setOverId(over ? over.id as ProspectStatus : null)}
        onDragEnd={handleDragEnd}
        onDragCancel={() => { setActiveId(null); setOverId(null); }}
      >
        <div className="flex gap-4 overflow-x-auto pb-4 -mx-1 px-1">
          {COLUMNS.map((col) => (
            <DroppableColumn
              key={col.status}
              col={col}
              prospects={prospects.filter((p) => p.status === col.status)}
              onCardClick={setSelected}
              isOver={overId === col.status}
            />
          ))}
        </div>

        <DragOverlay>
          {activeProspect && <KanbanCardContent prospect={activeProspect} isDragging />}
        </DragOverlay>
      </DndContext>

      {selected && (
        <ProspectModal
          prospect={selected}
          onClose={() => setSelected(null)}
          onRefresh={() => { setSelected(null); onRefresh(); }}
        />
      )}
    </>
  );
}

// ── Candidate list (shared between discovery modes) ────────────────────────────

function CandidateList({
  candidates,
  selected,
  onToggle,
  onSelectAll,
  onImport,
  importing,
}: {
  candidates: Candidate[];
  selected: Set<number>;
  onToggle: (i: number) => void;
  onSelectAll: () => void;
  onImport: () => void;
  importing: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="font-medium text-sm">{candidates.length} businesses found</h3>
          <button
            onClick={onSelectAll}
            className="text-xs text-muted-foreground underline underline-offset-2"
          >
            {selected.size === candidates.length ? "Deselect all" : "Select all"}
          </button>
        </div>
        <Button size="sm" disabled={selected.size === 0 || importing} onClick={onImport}>
          {importing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
          Import {selected.size} selected
        </Button>
      </div>

      <div className="divide-y border rounded-lg">
        {candidates.map((c, i) => (
          <label key={i} className={`flex items-start gap-3 p-3 cursor-pointer hover:bg-muted/30 transition-colors ${selected.has(i) ? "bg-muted/20" : ""}`}>
            <input
              type="checkbox"
              checked={selected.has(i)}
              onChange={() => onToggle(i)}
              className="mt-1"
            />
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="font-medium text-sm">{c.businessName}</span>
                <LeadScoreBadge score={c.leadScore} />
                <ScoreBadge score={c.pageSpeedScore} issues={c.issues} />
                <IssueBadges issues={c.issues.filter((iss) => !iss.startsWith("Score:"))} />
              </div>
              <p className="text-xs text-muted-foreground">{c.address}</p>
              {c.businessContext && (
                <p className="text-xs text-muted-foreground/80 mt-0.5 line-clamp-2">{c.businessContext}</p>
              )}
              <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
                {c.phone && <span>{c.phone}</span>}
                {c.googleRating != null && (
                  <span className="flex items-center gap-1">
                    <Star className="h-3 w-3" /> {c.googleRating}
                    {c.googleReviewCount != null && ` (${c.googleReviewCount})`}
                  </span>
                )}
                {c.contactEmail && <span className="text-blue-600">{c.contactEmail}</span>}
                {c.website && (
                  <a href={c.website} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="flex items-center gap-1 hover:text-foreground">
                    {c.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}

// ── Discover Tab ─────────────────────────────────────────────────────────────

function DiscoverTab({ onImported }: { onImported: () => void }) {
  const [discoverMode, setDiscoverMode] = useState<"places" | "directory" | "find">("places");

  // Places mode state
  const [criteria, setCriteria] = useState("");
  const [placeCandidates, setPlaceCandidates] = useState<Candidate[]>([]);
  const [placeSelected, setPlaceSelected] = useState<Set<number>>(new Set());

  // Directory mode state
  const [directoryUrl, setDirectoryUrl] = useState("");
  const [dirCandidates, setDirCandidates] = useState<Candidate[]>([]);
  const [dirSelected, setDirSelected] = useState<Set<number>>(new Set());

  // Find directories mode state
  const [findCriteria, setFindCriteria] = useState("");
  const [directories, setDirectories] = useState<Directory[]>([]);

  const discover = trpc.outreach.discover.useMutation({
    onSuccess: (data) => {
      const list = (data.candidates ?? []) as Candidate[];
      setPlaceCandidates(list);
      setPlaceSelected(new Set(list.map((_, i) => i)));
      if (list.length === 0) toast.info("No businesses found. Try a different search.");
    },
    onError: (e) => toast.error(e.message),
  });

  const crawlDirectory = trpc.outreach.crawlDirectory.useMutation({
    onSuccess: (data) => {
      const list = (data.candidates ?? []) as Candidate[];
      setDirCandidates(list);
      setDirSelected(new Set(list.map((_, i) => i)));
      if (list.length === 0) toast.info("No businesses extracted from that page.");
    },
    onError: (e) => toast.error(e.message),
  });

  const findDirectories = trpc.outreach.findDirectories.useMutation({
    onSuccess: (data) => {
      setDirectories(data.directories ?? []);
      if ((data.directories ?? []).length === 0) toast.info("No directories found. Try different criteria.");
    },
    onError: (e) => toast.error(e.message),
  });

  const importProspects = trpc.outreach.importProspects.useMutation({
    onSuccess: (data) => {
      toast.success(`Imported ${data.count} prospect${data.count !== 1 ? "s" : ""}`);
      setPlaceCandidates([]);
      setDirCandidates([]);
      setPlaceSelected(new Set());
      setDirSelected(new Set());
      onImported();
    },
    onError: (e) => toast.error(e.message),
  });

  function buildImportPayload(candidates: Candidate[], sel: Set<number>) {
    return candidates
      .filter((_, i) => sel.has(i))
      .map((c) => ({
        businessName: c.businessName,
        address: c.address || undefined,
        contactPhone: c.phone || undefined,
        contactEmail: c.contactEmail || undefined,
        website: c.website || undefined,
        pageSpeedScore: c.pageSpeedScore,
        issues: JSON.stringify(c.issues),
        businessContext: c.businessContext || undefined,
        leadScore: c.leadScore,
        googleRating: c.googleRating != null ? String(c.googleRating) : undefined,
        googleReviewCount: c.googleReviewCount ?? undefined,
      }));
  }

  function toggleCandidate(sel: Set<number>, i: number, setSel: (s: Set<number>) => void) {
    const next = new Set(sel);
    next.has(i) ? next.delete(i) : next.add(i);
    setSel(next);
  }

  return (
    <div className="space-y-6">
      {/* Mode selector */}
      <div className="flex gap-1 border rounded-lg p-1 w-fit">
        <button
          onClick={() => setDiscoverMode("places")}
          className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md transition-colors ${discoverMode === "places" ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"}`}
        >
          <Search className="h-3.5 w-3.5" /> Search Places
        </button>
        <button
          onClick={() => setDiscoverMode("directory")}
          className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md transition-colors ${discoverMode === "directory" ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"}`}
        >
          <Link2 className="h-3.5 w-3.5" /> Crawl Directory
        </button>
        <button
          onClick={() => setDiscoverMode("find")}
          className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md transition-colors ${discoverMode === "find" ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"}`}
        >
          <FolderSearch className="h-3.5 w-3.5" /> Find Directories
        </button>
      </div>

      {/* Search Places */}
      {discoverMode === "places" && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Search for businesses by type and location. Each result is enriched with PageSpeed scores, Firecrawl content analysis, and a lead quality score.
          </p>
          <div className="flex gap-2">
            <Input
              placeholder='e.g. "Gyms in Pretoria" or "Restaurants in Cape Town"'
              value={criteria}
              onChange={(e) => setCriteria(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && criteria.trim() && !discover.isPending)
                  discover.mutate({ criteria: criteria.trim() });
              }}
              className="max-w-md"
            />
            <Button onClick={() => discover.mutate({ criteria: criteria.trim() })} disabled={!criteria.trim() || discover.isPending}>
              {discover.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Enriching…</> : <><Search className="h-4 w-4 mr-2" />Discover</>}
            </Button>
          </div>
          {discover.isPending && (
            <p className="text-xs text-muted-foreground">Fetching businesses, running PageSpeed checks, and scraping websites for context — this takes 20–40 seconds…</p>
          )}
          {placeCandidates.length > 0 && (
            <CandidateList
              candidates={placeCandidates}
              selected={placeSelected}
              onToggle={(i) => toggleCandidate(placeSelected, i, setPlaceSelected)}
              onSelectAll={() => setPlaceSelected(placeSelected.size === placeCandidates.length ? new Set() : new Set(placeCandidates.map((_, i) => i)))}
              onImport={() => importProspects.mutate({ prospects: buildImportPayload(placeCandidates, placeSelected) })}
              importing={importProspects.isPending}
            />
          )}
        </div>
      )}

      {/* Crawl Directory */}
      {discoverMode === "directory" && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Paste a URL to any directory or listing page (Yellow Pages, TripAdvisor, industry listings, etc.) and we'll extract all the businesses from it.
          </p>
          <div className="flex gap-2">
            <Input
              placeholder="https://www.yellowpages.co.za/find/gyms/pretoria"
              value={directoryUrl}
              onChange={(e) => setDirectoryUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && directoryUrl.trim() && !crawlDirectory.isPending)
                  crawlDirectory.mutate({ url: directoryUrl.trim() });
              }}
              className="max-w-lg"
            />
            <Button onClick={() => crawlDirectory.mutate({ url: directoryUrl.trim() })} disabled={!directoryUrl.trim() || crawlDirectory.isPending}>
              {crawlDirectory.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Crawling…</> : <><Link2 className="h-4 w-4 mr-2" />Crawl</>}
            </Button>
          </div>
          {crawlDirectory.isPending && (
            <p className="text-xs text-muted-foreground">Scraping directory page and enriching each business — this may take a minute…</p>
          )}
          {dirCandidates.length > 0 && (
            <CandidateList
              candidates={dirCandidates}
              selected={dirSelected}
              onToggle={(i) => toggleCandidate(dirSelected, i, setDirSelected)}
              onSelectAll={() => setDirSelected(dirSelected.size === dirCandidates.length ? new Set() : new Set(dirCandidates.map((_, i) => i)))}
              onImport={() => importProspects.mutate({ prospects: buildImportPayload(dirCandidates, dirSelected) })}
              importing={importProspects.isPending}
            />
          )}
        </div>
      )}

      {/* Find Directories */}
      {discoverMode === "find" && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Describe the type of business you're targeting and we'll suggest relevant directory pages to crawl.
          </p>
          <div className="flex gap-2">
            <Input
              placeholder='e.g. "Gyms in Pretoria" or "Cape Town restaurants"'
              value={findCriteria}
              onChange={(e) => setFindCriteria(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && findCriteria.trim() && !findDirectories.isPending)
                  findDirectories.mutate({ criteria: findCriteria.trim() });
              }}
              className="max-w-md"
            />
            <Button onClick={() => findDirectories.mutate({ criteria: findCriteria.trim() })} disabled={!findCriteria.trim() || findDirectories.isPending}>
              {findDirectories.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Finding…</> : <><FolderSearch className="h-4 w-4 mr-2" />Find</>}
            </Button>
          </div>
          {directories.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Suggested directories — click a URL to crawl it</p>
              <div className="divide-y border rounded-lg">
                {directories.map((dir, i) => (
                  <div key={i} className="p-3 space-y-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{dir.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{dir.description}</p>
                        <p className="text-xs text-blue-600 truncate mt-1">{dir.url}</p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="shrink-0"
                        onClick={() => {
                          setDiscoverMode("directory");
                          setDirectoryUrl(dir.url);
                          crawlDirectory.mutate({ url: dir.url });
                        }}
                      >
                        <Link2 className="h-3.5 w-3.5 mr-1.5" /> Crawl
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Prospects Tab ─────────────────────────────────────────────────────────────

function ProspectsTab() {
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({
    businessName: "", contactName: "", contactEmail: "", contactPhone: "",
    website: "", address: "", industry: "", notes: "",
  });

  const { data: prospects = [], refetch } = trpc.outreach.prospect.list.useQuery();

  const createProspect = trpc.outreach.prospect.create.useMutation({
    onSuccess: () => {
      toast.success("Prospect added");
      setAddOpen(false);
      setForm({ businessName: "", contactName: "", contactEmail: "", contactPhone: "", website: "", address: "", industry: "", notes: "" });
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{prospects.length} prospect{prospects.length !== 1 ? "s" : ""}</p>
        <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> Add manually
        </Button>
      </div>

      {prospects.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">
          No prospects yet. Use the Discover tab to find businesses.
        </div>
      ) : (
        <KanbanBoard prospects={prospects as Prospect[]} onRefresh={refetch} />
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add prospect manually</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {(["businessName", "contactName", "contactEmail", "contactPhone", "website", "address", "industry"] as const).map((field) => (
              <div key={field}>
                <Label className="text-xs capitalize">{field.replace(/([A-Z])/g, " $1").toLowerCase()}</Label>
                <Input className="mt-1" value={form[field as keyof typeof form]} onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))} required={field === "businessName"} />
              </div>
            ))}
            <div>
              <Label className="text-xs">Notes</Label>
              <Textarea className="mt-1" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={3} />
            </div>
            <Button className="w-full" disabled={!form.businessName.trim() || createProspect.isPending} onClick={() => createProspect.mutate({ ...form })}>
              {createProspect.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Add prospect
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Outreach() {
  const [activeTab, setActiveTab] = useState("discover");
  const prospectsQuery = trpc.outreach.prospect.list.useQuery();

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Outreach</h1>
        <p className="text-muted-foreground text-sm mt-1">Find and enrich prospects, then send AI-personalized outreach.</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="discover">Discover</TabsTrigger>
          <TabsTrigger value="prospects">
            Prospects
            {(prospectsQuery.data?.length ?? 0) > 0 && (
              <span className="ml-1.5 text-xs bg-muted rounded-full px-1.5 py-0.5">
                {prospectsQuery.data?.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="discover">
          <DiscoverTab onImported={() => { prospectsQuery.refetch(); setActiveTab("prospects"); }} />
        </TabsContent>

        <TabsContent value="prospects">
          <ProspectsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
