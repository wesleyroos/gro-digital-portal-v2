import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import {
  Plus, Trash2, Search, Mail, Linkedin, Instagram, Send, CheckCheck,
  ChevronDown, ChevronRight, ExternalLink, Copy, Loader2, Wand2, UserPlus
} from "lucide-react";
import { toast } from "sonner";
import { Link } from "wouter";

type Channel = "email" | "linkedin" | "instagram";
type SendStatus = "draft" | "approved" | "sent" | "opened" | "clicked" | "replied";
type ProspectStatus = "new" | "in_sequence" | "replied" | "converted" | "unsubscribed";

const CHANNEL_ICONS: Record<Channel, React.ReactNode> = {
  email: <Mail className="h-3.5 w-3.5" />,
  linkedin: <Linkedin className="h-3.5 w-3.5" />,
  instagram: <Instagram className="h-3.5 w-3.5" />,
};

const CHANNEL_COLORS: Record<Channel, string> = {
  email: "bg-blue-50 text-blue-700 border-blue-200",
  linkedin: "bg-sky-50 text-sky-700 border-sky-200",
  instagram: "bg-pink-50 text-pink-700 border-pink-200",
};

const SEND_STATUS_COLORS: Record<SendStatus, string> = {
  draft: "bg-zinc-50 text-zinc-600 border-zinc-200",
  approved: "bg-amber-50 text-amber-700 border-amber-200",
  sent: "bg-blue-50 text-blue-700 border-blue-200",
  opened: "bg-indigo-50 text-indigo-700 border-indigo-200",
  clicked: "bg-violet-50 text-violet-700 border-violet-200",
  replied: "bg-green-50 text-green-700 border-green-200",
};

const PROSPECT_STATUS_COLORS: Record<ProspectStatus, string> = {
  new: "bg-zinc-50 text-zinc-600 border-zinc-200",
  in_sequence: "bg-blue-50 text-blue-700 border-blue-200",
  replied: "bg-green-50 text-green-700 border-green-200",
  converted: "bg-emerald-50 text-emerald-700 border-emerald-200",
  unsubscribed: "bg-red-50 text-red-600 border-red-200",
};

// ─── Prospects Tab ───────────────────────────────────────────────────────────

type DiscoverCandidate = {
  businessName: string;
  location: string;
  website: string;
  phone: string;
};

function ProspectsTab() {
  const utils = trpc.useUtils();
  const { data: prospects = [], isLoading } = trpc.outreach.prospect.list.useQuery();
  const { data: sequences = [] } = trpc.outreach.sequence.list.useQuery();

  const [discoverOpen, setDiscoverOpen] = useState(false);
  const [criteria, setCriteria] = useState("");
  const [candidates, setCandidates] = useState<DiscoverCandidate[]>([]);
  const [selectedCandidates, setSelectedCandidates] = useState<Set<number>>(new Set());
  const [sourceQuery, setSourceQuery] = useState("");

  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ businessName: "", contactName: "", contactEmail: "", contactPhone: "", website: "", linkedinUrl: "", instagramHandle: "", industry: "", location: "", notes: "" });

  const [enqueueOpen, setEnqueueOpen] = useState(false);
  const [enqueueProspectId, setEnqueueProspectId] = useState<number | null>(null);
  const [selectedSequenceId, setSelectedSequenceId] = useState<string>("");

  const discoverMutation = trpc.outreach.prospect.discover.useMutation({
    onSuccess: (data) => {
      setCandidates(data.candidates);
      setSourceQuery(data.sourceQuery ?? "");
      setSelectedCandidates(new Set());
    },
    onError: (e) => toast.error(e.message),
  });

  const createMutation = trpc.outreach.prospect.create.useMutation({
    onSuccess: () => { utils.outreach.prospect.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.outreach.prospect.delete.useMutation({
    onSuccess: () => utils.outreach.prospect.list.invalidate(),
    onError: (e) => toast.error(e.message),
  });

  const enqueueMutation = trpc.outreach.send.enqueueSequence.useMutation({
    onSuccess: (data) => {
      utils.outreach.send.list.invalidate();
      utils.outreach.prospect.list.invalidate();
      toast.success(`${data.count} draft sends created`);
      setEnqueueOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const markRepliedMutation = trpc.outreach.send.markReplied.useMutation({
    onSuccess: (data) => {
      utils.outreach.prospect.list.invalidate();
      toast.success(data.leadId ? "Marked replied — lead created" : "Marked replied");
    },
    onError: (e) => toast.error(e.message),
  });

  async function handleDiscover() {
    if (!criteria.trim()) return;
    discoverMutation.mutate({ criteria: criteria.trim() });
  }

  async function handleImport() {
    const toImport = Array.from(selectedCandidates).map(i => candidates[i]);
    for (const c of toImport) {
      await createMutation.mutateAsync({
        businessName: c.businessName,
        contactPhone: c.phone || undefined,
        website: c.website || undefined,
        location: c.location || undefined,
        source: "discovery",
        sourceQuery: sourceQuery || undefined,
      });
    }
    toast.success(`Imported ${toImport.length} prospects`);
    setDiscoverOpen(false);
    setCandidates([]);
    setCriteria("");
  }

  async function handleAddManual() {
    if (!addForm.businessName.trim()) return;
    await createMutation.mutateAsync({ ...addForm, source: "manual" });
    toast.success("Prospect added");
    setAddOpen(false);
    setAddForm({ businessName: "", contactName: "", contactEmail: "", contactPhone: "", website: "", linkedinUrl: "", instagramHandle: "", industry: "", location: "", notes: "" });
  }

  function toggleCandidate(i: number) {
    setSelectedCandidates(prev => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button onClick={() => setDiscoverOpen(true)} variant="default" size="sm">
          <Search className="h-4 w-4 mr-1.5" />
          Discover prospects
        </Button>
        <Button onClick={() => setAddOpen(true)} variant="outline" size="sm">
          <Plus className="h-4 w-4 mr-1.5" />
          Add manually
        </Button>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : prospects.length === 0 ? (
        <div className="text-sm text-muted-foreground py-8 text-center">No prospects yet. Discover or add some above.</div>
      ) : (
        <div className="border rounded-lg divide-y">
          {prospects.map(p => (
            <div key={p.id} className="flex items-center gap-3 px-4 py-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{p.businessName}</span>
                  <Badge variant="outline" className={`text-xs ${PROSPECT_STATUS_COLORS[p.status as ProspectStatus]}`}>
                    {p.status.replace("_", " ")}
                  </Badge>
                </div>
                <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                  {p.contactEmail && <span>{p.contactEmail}</span>}
                  {p.location && <span>{p.location}</span>}
                  {p.website && (
                    <a href={p.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-0.5 hover:text-foreground">
                      {p.website.replace(/^https?:\/\//, '')} <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => { setEnqueueProspectId(p.id); setSelectedSequenceId(""); setEnqueueOpen(true); }}
                >
                  Enqueue
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-destructive hover:text-destructive"
                  onClick={() => deleteMutation.mutate({ id: p.id })}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Discover dialog */}
      <Dialog open={discoverOpen} onOpenChange={setDiscoverOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Discover Prospects</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Textarea
                placeholder='e.g. "Coffee shops in Cape Town" or "Gyms in Johannesburg looking for social media marketing"'
                value={criteria}
                onChange={e => setCriteria(e.target.value)}
                rows={2}
                className="flex-1"
              />
              <Button onClick={handleDiscover} disabled={discoverMutation.isPending || !criteria.trim()}>
                {discoverMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </Button>
            </div>

            {candidates.length > 0 && (
              <>
                <div className="text-sm text-muted-foreground">{candidates.length} results — select to import:</div>
                <div className="border rounded-lg divide-y max-h-80 overflow-y-auto">
                  {candidates.map((c, i) => (
                    <label key={i} className="flex items-start gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/50">
                      <input
                        type="checkbox"
                        checked={selectedCandidates.has(i)}
                        onChange={() => toggleCandidate(i)}
                        className="mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm">{c.businessName}</div>
                        <div className="text-xs text-muted-foreground">{c.location}</div>
                        {c.website && <div className="text-xs text-muted-foreground">{c.website}</div>}
                        {c.phone && <div className="text-xs text-muted-foreground">{c.phone}</div>}
                      </div>
                    </label>
                  ))}
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">{selectedCandidates.size} selected</span>
                  <Button
                    onClick={handleImport}
                    disabled={selectedCandidates.size === 0 || createMutation.isPending}
                    size="sm"
                  >
                    Import selected
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Add manually dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Prospect</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {[
              { key: "businessName", label: "Business Name *" },
              { key: "contactName", label: "Contact Name" },
              { key: "contactEmail", label: "Email" },
              { key: "contactPhone", label: "Phone" },
              { key: "website", label: "Website" },
              { key: "linkedinUrl", label: "LinkedIn URL" },
              { key: "instagramHandle", label: "Instagram Handle" },
              { key: "industry", label: "Industry" },
              { key: "location", label: "Location" },
            ].map(f => (
              <div key={f.key}>
                <Label className="text-xs">{f.label}</Label>
                <Input
                  value={(addForm as Record<string, string>)[f.key]}
                  onChange={e => setAddForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                  className="h-8 mt-1"
                />
              </div>
            ))}
            <div>
              <Label className="text-xs">Notes</Label>
              <Textarea
                value={addForm.notes}
                onChange={e => setAddForm(prev => ({ ...prev, notes: e.target.value }))}
                rows={2}
                className="mt-1"
              />
            </div>
            <Button onClick={handleAddManual} disabled={!addForm.businessName.trim() || createMutation.isPending} className="w-full">
              Add Prospect
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Enqueue dialog */}
      <Dialog open={enqueueOpen} onOpenChange={setEnqueueOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enqueue in Sequence</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Select value={selectedSequenceId} onValueChange={setSelectedSequenceId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a sequence…" />
              </SelectTrigger>
              <SelectContent>
                {sequences.map(s => (
                  <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              className="w-full"
              disabled={!selectedSequenceId || enqueueMutation.isPending}
              onClick={() => {
                if (enqueueProspectId && selectedSequenceId) {
                  enqueueMutation.mutate({ prospectId: enqueueProspectId, sequenceId: Number(selectedSequenceId) });
                }
              }}
            >
              {enqueueMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Enqueue
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Sequences Tab ───────────────────────────────────────────────────────────

function SequencesTab() {
  const utils = trpc.useUtils();
  const { data: sequences = [], isLoading } = trpc.outreach.sequence.list.useQuery();
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [newSeqOpen, setNewSeqOpen] = useState(false);
  const [newSeqForm, setNewSeqForm] = useState({ name: "", description: "", targetDescription: "" });
  const [addStepFor, setAddStepFor] = useState<number | null>(null);
  const [stepForm, setStepForm] = useState({ channel: "email" as Channel, delayDays: "0", subjectTemplate: "", messageTemplate: "" });

  const createSeqMutation = trpc.outreach.sequence.create.useMutation({
    onSuccess: () => { utils.outreach.sequence.list.invalidate(); setNewSeqOpen(false); setNewSeqForm({ name: "", description: "", targetDescription: "" }); },
    onError: (e) => toast.error(e.message),
  });

  const deleteSeqMutation = trpc.outreach.sequence.delete.useMutation({
    onSuccess: () => utils.outreach.sequence.list.invalidate(),
    onError: (e) => toast.error(e.message),
  });

  function toggleExpand(id: number) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <Button onClick={() => setNewSeqOpen(true)} variant="default" size="sm">
        <Plus className="h-4 w-4 mr-1.5" />
        New sequence
      </Button>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : sequences.length === 0 ? (
        <div className="text-sm text-muted-foreground py-8 text-center">No sequences yet.</div>
      ) : (
        <div className="space-y-2">
          {sequences.map(seq => (
            <SequenceCard
              key={seq.id}
              seq={seq}
              expanded={expanded.has(seq.id)}
              onToggle={() => toggleExpand(seq.id)}
              onDelete={() => deleteSeqMutation.mutate({ id: seq.id })}
              onAddStep={() => { setAddStepFor(seq.id); setStepForm({ channel: "email", delayDays: "0", subjectTemplate: "", messageTemplate: "" }); }}
            />
          ))}
        </div>
      )}

      {/* New sequence dialog */}
      <Dialog open={newSeqOpen} onOpenChange={setNewSeqOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Sequence</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Name *</Label>
              <Input value={newSeqForm.name} onChange={e => setNewSeqForm(p => ({ ...p, name: e.target.value }))} className="h-8 mt-1" />
            </div>
            <div>
              <Label className="text-xs">Description</Label>
              <Textarea value={newSeqForm.description} onChange={e => setNewSeqForm(p => ({ ...p, description: e.target.value }))} rows={2} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Target description</Label>
              <Textarea value={newSeqForm.targetDescription} onChange={e => setNewSeqForm(p => ({ ...p, targetDescription: e.target.value }))} rows={2} className="mt-1" placeholder="Who is this sequence for?" />
            </div>
            <Button onClick={() => createSeqMutation.mutate(newSeqForm)} disabled={!newSeqForm.name.trim() || createSeqMutation.isPending} className="w-full">
              Create
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add step dialog */}
      <Dialog open={addStepFor !== null} onOpenChange={open => { if (!open) setAddStepFor(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Step</DialogTitle>
          </DialogHeader>
          {addStepFor !== null && (
            <AddStepForm
              sequenceId={addStepFor}
              onClose={() => setAddStepFor(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SequenceCard({ seq, expanded, onToggle, onDelete, onAddStep }: {
  seq: { id: number; name: string; description: string | null; targetDescription: string | null; isActive: boolean };
  expanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onAddStep: () => void;
}) {
  const { data: steps = [] } = trpc.outreach.sequence.steps.list.useQuery({ sequenceId: seq.id }, { enabled: expanded });
  const utils = trpc.useUtils();

  const deleteStepMutation = trpc.outreach.sequence.steps.delete.useMutation({
    onSuccess: () => utils.outreach.sequence.steps.list.invalidate({ sequenceId: seq.id }),
    onError: (e) => toast.error(e.message),
  });

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors" onClick={onToggle}>
          {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
          <div className="flex-1 min-w-0">
            <span className="font-medium text-sm">{seq.name}</span>
            {seq.description && <span className="text-xs text-muted-foreground ml-2">{seq.description}</span>}
          </div>
          <div className="flex items-center gap-2 shrink-0" onClick={e => e.stopPropagation()}>
            <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive" onClick={onDelete}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {expanded && (
          <div className="border-t px-4 py-3 space-y-2">
            {steps.map(step => (
              <div key={step.id} className="flex items-start gap-3 bg-muted/30 rounded-lg px-3 py-2.5">
                <Badge variant="outline" className={`text-xs shrink-0 flex items-center gap-1 ${CHANNEL_COLORS[step.channel as Channel]}`}>
                  {CHANNEL_ICONS[step.channel as Channel]}
                  {step.channel}
                </Badge>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-muted-foreground mb-1">Day {step.delayDays} — Step {step.stepNumber}</div>
                  {step.subjectTemplate && <div className="text-xs font-medium mb-1">Subject: {step.subjectTemplate}</div>}
                  <div className="text-xs text-muted-foreground line-clamp-2">{step.messageTemplate}</div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-destructive hover:text-destructive shrink-0"
                  onClick={() => deleteStepMutation.mutate({ id: step.id })}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" className="w-full h-8 text-xs mt-1" onClick={onAddStep}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add step
            </Button>
            <p className="text-xs text-muted-foreground">Variables: <code className="bg-muted px-1 rounded">{"{{businessName}}"}</code> <code className="bg-muted px-1 rounded">{"{{contactName}}"}</code> <code className="bg-muted px-1 rounded">{"{{location}}"}</code> <code className="bg-muted px-1 rounded">{"{{industry}}"}</code></p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AddStepForm({ sequenceId, onClose }: { sequenceId: number; onClose: () => void }) {
  const utils = trpc.useUtils();
  const { data: steps = [] } = trpc.outreach.sequence.steps.list.useQuery({ sequenceId });
  const [channel, setChannel] = useState<Channel>("email");
  const [delayDays, setDelayDays] = useState("0");
  const [subjectTemplate, setSubjectTemplate] = useState("");
  const [messageTemplate, setMessageTemplate] = useState("");

  const createStepMutation = trpc.outreach.sequence.steps.create.useMutation({
    onSuccess: () => {
      utils.outreach.sequence.steps.list.invalidate({ sequenceId });
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Channel</Label>
          <Select value={channel} onValueChange={v => setChannel(v as Channel)}>
            <SelectTrigger className="h-8 mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="email">Email</SelectItem>
              <SelectItem value="linkedin">LinkedIn</SelectItem>
              <SelectItem value="instagram">Instagram</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Delay (days)</Label>
          <Input value={delayDays} onChange={e => setDelayDays(e.target.value)} type="number" min="0" className="h-8 mt-1" />
        </div>
      </div>
      {channel === "email" && (
        <div>
          <Label className="text-xs">Subject template</Label>
          <Input value={subjectTemplate} onChange={e => setSubjectTemplate(e.target.value)} className="h-8 mt-1" placeholder="e.g. Growing {{businessName}}'s online presence" />
        </div>
      )}
      <div>
        <Label className="text-xs">Message template *</Label>
        <Textarea
          value={messageTemplate}
          onChange={e => setMessageTemplate(e.target.value)}
          rows={5}
          className="mt-1 font-mono text-xs"
          placeholder="Hi {{contactName}}, I noticed {{businessName}} is based in {{location}}…"
        />
      </div>
      <Button
        className="w-full"
        disabled={!messageTemplate.trim() || createStepMutation.isPending}
        onClick={() => createStepMutation.mutate({
          sequenceId,
          stepNumber: steps.length + 1,
          delayDays: Number(delayDays) || 0,
          channel,
          subjectTemplate: channel === "email" ? subjectTemplate || undefined : undefined,
          messageTemplate: messageTemplate.trim(),
        })}
      >
        Add Step
      </Button>
    </div>
  );
}

// ─── Sends Tab ───────────────────────────────────────────────────────────────

function SendsTab() {
  const utils = trpc.useUtils();
  const { data: sends = [], isLoading } = trpc.outreach.send.list.useQuery({});
  const { data: prospects = [] } = trpc.outreach.prospect.list.useQuery();
  const [statusFilter, setStatusFilter] = useState<SendStatus | "all">("all");
  const [generatingId, setGeneratingId] = useState<number | null>(null);
  const [inlineEdits, setInlineEdits] = useState<Record<number, { subject: string; message: string }>>({});

  const generateMutation = trpc.outreach.prospect.generateMessage.useMutation({
    onSuccess: (data, vars) => {
      setInlineEdits(prev => ({ ...prev, [vars.prospectId]: { subject: data.subject, message: data.message } }));
      setGeneratingId(null);
    },
    onError: (e) => { toast.error(e.message); setGeneratingId(null); },
  });

  const approveMutation = trpc.outreach.send.approveDraft.useMutation({
    onSuccess: () => utils.outreach.send.list.invalidate(),
    onError: (e) => toast.error(e.message),
  });

  const sendEmailMutation = trpc.outreach.send.sendEmail.useMutation({
    onSuccess: () => { utils.outreach.send.list.invalidate(); toast.success("Email sent!"); },
    onError: (e) => toast.error(e.message),
  });

  const markRepliedMutation = trpc.outreach.send.markReplied.useMutation({
    onSuccess: (data) => {
      utils.outreach.send.list.invalidate();
      utils.outreach.prospect.list.invalidate();
      toast.success(data.leadId ? "Marked replied — lead created" : "Marked replied");
    },
    onError: (e) => toast.error(e.message),
  });

  const filtered = statusFilter === "all" ? sends : sends.filter(s => s.status === statusFilter);
  const prospectMap = Object.fromEntries(prospects.map(p => [p.id, p]));

  const STATUS_TABS: Array<{ key: SendStatus | "all"; label: string }> = [
    { key: "all", label: "All" },
    { key: "draft", label: "Drafts" },
    { key: "approved", label: "Approved" },
    { key: "sent", label: "Sent" },
    { key: "replied", label: "Replied" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-1">
        {STATUS_TABS.map(t => (
          <Button
            key={t.key}
            variant={statusFilter === t.key ? "default" : "outline"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setStatusFilter(t.key)}
          >
            {t.label}
            {t.key !== "all" && (
              <span className="ml-1.5 bg-muted text-muted-foreground rounded px-1 py-0 text-[10px]">
                {sends.filter(s => s.status === t.key).length}
              </span>
            )}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-sm text-muted-foreground py-8 text-center">No sends.</div>
      ) : (
        <div className="border rounded-lg divide-y">
          {filtered.map(send => {
            const prospect = prospectMap[send.prospectId];
            const edit = inlineEdits[send.id];
            const isGenerating = generatingId === send.id;

            return (
              <div key={send.id} className="px-4 py-3 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className={`text-xs flex items-center gap-1 ${CHANNEL_COLORS[send.channel as Channel]}`}>
                    {CHANNEL_ICONS[send.channel as Channel]}
                    {send.channel}
                  </Badge>
                  <Badge variant="outline" className={`text-xs ${SEND_STATUS_COLORS[send.status as SendStatus]}`}>
                    {send.status}
                  </Badge>
                  <span className="text-sm font-medium">{prospect?.businessName ?? `Prospect #${send.prospectId}`}</span>
                  {prospect?.contactEmail && (
                    <span className="text-xs text-muted-foreground">{prospect.contactEmail}</span>
                  )}
                </div>

                {send.status === "draft" && (
                  <div className="space-y-2">
                    {send.channel === "email" && (
                      <Input
                        value={edit?.subject ?? send.subject ?? ""}
                        onChange={e => setInlineEdits(prev => ({ ...prev, [send.id]: { ...prev[send.id] ?? { message: send.message ?? "" }, subject: e.target.value } }))}
                        placeholder="Subject"
                        className="h-8 text-sm"
                      />
                    )}
                    <Textarea
                      value={edit?.message ?? send.message ?? ""}
                      onChange={e => setInlineEdits(prev => ({ ...prev, [send.id]: { subject: prev[send.id]?.subject ?? send.subject ?? "", message: e.target.value } }))}
                      rows={3}
                      className="text-sm"
                      placeholder="Message…"
                    />
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        disabled={isGenerating}
                        onClick={async () => {
                          setGeneratingId(send.id);
                          generateMutation.mutate({ prospectId: send.prospectId, stepId: send.stepId });
                        }}
                      >
                        {isGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Wand2 className="h-3.5 w-3.5 mr-1" />}
                        Generate AI copy
                      </Button>
                      <Button
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => approveMutation.mutate({
                          id: send.id,
                          subject: edit?.subject ?? send.subject ?? undefined,
                          message: edit?.message ?? send.message ?? undefined,
                        })}
                        disabled={approveMutation.isPending}
                      >
                        <CheckCheck className="h-3.5 w-3.5 mr-1" />
                        Approve
                      </Button>
                    </div>
                  </div>
                )}

                {send.status === "approved" && send.channel === "email" && (
                  <div className="space-y-1.5">
                    {send.subject && <div className="text-xs font-medium text-muted-foreground">Subject: {send.subject}</div>}
                    <div className="text-sm bg-muted/30 rounded p-2 text-sm line-clamp-3">{send.message}</div>
                    <Button
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => sendEmailMutation.mutate({ id: send.id })}
                      disabled={sendEmailMutation.isPending}
                    >
                      <Send className="h-3.5 w-3.5 mr-1" />
                      Send email
                    </Button>
                  </div>
                )}

                {send.status === "approved" && (send.channel === "linkedin" || send.channel === "instagram") && (
                  <div className="space-y-2">
                    <div className="relative bg-muted/30 rounded p-3 text-sm">
                      <pre className="whitespace-pre-wrap font-sans text-sm">{send.message}</pre>
                      <button
                        className="absolute top-2 right-2 text-muted-foreground hover:text-foreground"
                        onClick={() => { navigator.clipboard.writeText(send.message ?? ""); toast.success("Copied!"); }}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {send.channel === "linkedin" && prospect?.linkedinUrl && (
                      <a href={prospect.linkedinUrl} target="_blank" rel="noopener noreferrer">
                        <Button variant="outline" size="sm" className="h-7 text-xs">
                          Open LinkedIn profile <ExternalLink className="h-3 w-3 ml-1" />
                        </Button>
                      </a>
                    )}
                    {send.channel === "instagram" && prospect?.instagramHandle && (
                      <a href={`https://instagram.com/${prospect.instagramHandle.replace('@', '')}`} target="_blank" rel="noopener noreferrer">
                        <Button variant="outline" size="sm" className="h-7 text-xs">
                          Open Instagram profile <ExternalLink className="h-3 w-3 ml-1" />
                        </Button>
                      </a>
                    )}
                  </div>
                )}

                {(send.status === "sent" || send.status === "opened" || send.status === "clicked") && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => markRepliedMutation.mutate({ id: send.id })}
                    disabled={markRepliedMutation.isPending}
                  >
                    <UserPlus className="h-3.5 w-3.5 mr-1" />
                    Mark as replied
                  </Button>
                )}

                {send.status === "replied" && prospect?.leadId && (
                  <Link href={`/leads`}>
                    <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200 cursor-pointer hover:bg-green-100">
                      Lead created — view in Leads
                    </Badge>
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function Outreach() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Outreach</h1>
        <p className="text-sm text-muted-foreground mt-1">Discover prospects, build sequences, and track sends.</p>
      </div>

      <Tabs defaultValue="prospects">
        <TabsList>
          <TabsTrigger value="prospects">Prospects</TabsTrigger>
          <TabsTrigger value="sequences">Sequences</TabsTrigger>
          <TabsTrigger value="sends">Sends</TabsTrigger>
        </TabsList>
        <TabsContent value="prospects" className="mt-4">
          <ProspectsTab />
        </TabsContent>
        <TabsContent value="sequences" className="mt-4">
          <SequencesTab />
        </TabsContent>
        <TabsContent value="sends" className="mt-4">
          <SendsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
