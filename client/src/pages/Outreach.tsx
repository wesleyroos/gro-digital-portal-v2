import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Search, Loader2, ExternalLink, Trash2, Mail, Wand2, Send, CheckCheck, Plus, AlertTriangle, Gauge, Globe } from "lucide-react";
import { toast } from "sonner";
import { Link } from "wouter";

type ProspectStatus = "new" | "emailed" | "replied" | "converted";

const STATUS_COLORS: Record<ProspectStatus, string> = {
  new: "bg-zinc-50 text-zinc-600 border-zinc-200",
  emailed: "bg-blue-50 text-blue-700 border-blue-200",
  replied: "bg-green-50 text-green-700 border-green-200",
  converted: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

type Candidate = {
  businessName: string;
  address: string;
  phone: string;
  website: string;
  pageSpeedScore: number | null;
  contactEmail: string;
  issues: string[];
};

function ScoreBadge({ score, issues }: { score: number | null; issues: string[] }) {
  if (issues.includes("No website")) {
    return (
      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600 border border-zinc-200">
        <Globe className="h-3 w-3" /> No website
      </span>
    );
  }
  if (score !== null) {
    const color = score < 30 ? "bg-red-50 text-red-700 border-red-200" : "bg-amber-50 text-amber-700 border-amber-200";
    return (
      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${color}`}>
        <Gauge className="h-3 w-3" /> Score: {score}/100
      </span>
    );
  }
  return null;
}

function IssueBadges({ issues }: { issues: string[] }) {
  return (
    <>
      {issues.map((issue) => (
        <span key={issue} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200">
          <AlertTriangle className="h-3 w-3" /> {issue}
        </span>
      ))}
    </>
  );
}

// ── Discover Tab ─────────────────────────────────────────────────────────────

function DiscoverTab({ onImported }: { onImported: () => void }) {
  const [criteria, setCriteria] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const discover = trpc.outreach.discover.useMutation({
    onSuccess: (data) => {
      const list = (data.candidates ?? []) as Candidate[];
      setCandidates(list);
      setSelected(new Set(list.map((_, i) => i)));
      if (list.length === 0) toast.info("No businesses with issues found. Try a different search.");
    },
    onError: (e) => toast.error(e.message),
  });

  const importProspects = trpc.outreach.importProspects.useMutation({
    onSuccess: (data) => {
      toast.success(`Imported ${data.count} prospect${data.count !== 1 ? "s" : ""}`);
      setCandidates([]);
      setSelected(new Set());
      onImported();
    },
    onError: (e) => toast.error(e.message),
  });

  function toggleAll() {
    if (selected.size === candidates.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(candidates.map((_, i) => i)));
    }
  }

  function handleImport() {
    const toImport = candidates
      .filter((_, i) => selected.has(i))
      .map((c) => ({
        businessName: c.businessName,
        address: c.address,
        contactPhone: c.phone,
        contactEmail: c.contactEmail || undefined,
        website: c.website || undefined,
        pageSpeedScore: c.pageSpeedScore,
        issues: JSON.stringify(c.issues),
      }));
    importProspects.mutate({ prospects: toImport });
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground mb-3">
          Search for businesses. We'll check their website speed and only show ones that need help.
        </p>
        <div className="flex gap-2">
          <Input
            placeholder='e.g. "Gyms in Pretoria" or "Restaurants in Cape Town"'
            value={criteria}
            onChange={(e) => setCriteria(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && criteria.trim() && !discover.isPending) {
                discover.mutate({ criteria: criteria.trim() });
              }
            }}
            className="max-w-md"
          />
          <Button
            onClick={() => discover.mutate({ criteria: criteria.trim() })}
            disabled={!criteria.trim() || discover.isPending}
          >
            {discover.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Checking scores…
              </>
            ) : (
              <>
                <Search className="h-4 w-4 mr-2" />
                Discover
              </>
            )}
          </Button>
        </div>
        {discover.isPending && (
          <p className="text-xs text-muted-foreground mt-2">
            Fetching businesses and running PageSpeed checks — this takes 15–30 seconds…
          </p>
        )}
      </div>

      {candidates.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h3 className="font-medium text-sm">{candidates.length} businesses with issues found</h3>
              <button
                onClick={toggleAll}
                className="text-xs text-muted-foreground underline underline-offset-2"
              >
                {selected.size === candidates.length ? "Deselect all" : "Select all"}
              </button>
            </div>
            <Button
              size="sm"
              disabled={selected.size === 0 || importProspects.isPending}
              onClick={handleImport}
            >
              {importProspects.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              Import {selected.size} selected
            </Button>
          </div>

          <div className="divide-y border rounded-lg">
            {candidates.map((c, i) => (
              <label
                key={i}
                className={`flex items-start gap-3 p-3 cursor-pointer hover:bg-muted/30 transition-colors ${selected.has(i) ? "bg-muted/20" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={selected.has(i)}
                  onChange={() => {
                    const next = new Set(selected);
                    next.has(i) ? next.delete(i) : next.add(i);
                    setSelected(next);
                  }}
                  className="mt-1"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="font-medium text-sm">{c.businessName}</span>
                    <ScoreBadge score={c.pageSpeedScore} issues={c.issues} />
                    <IssueBadges issues={c.issues.filter((iss) => iss !== `Score: ${c.pageSpeedScore}/100`)} />
                  </div>
                  <p className="text-xs text-muted-foreground">{c.address}</p>
                  <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
                    {c.phone && <span>{c.phone}</span>}
                    {c.contactEmail && (
                      <span className="text-blue-600">{c.contactEmail}</span>
                    )}
                    {c.website && (
                      <a
                        href={c.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-1 hover:text-foreground"
                      >
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
      )}
    </div>
  );
}

// ── Prospect Card ─────────────────────────────────────────────────────────────

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
  status: ProspectStatus;
  lastEmailSubject: string | null;
  lastEmailBody: string | null;
  lastEmailSentAt: Date | string | null;
  notes: string | null;
  leadId: number | null;
};

function ProspectCard({ prospect, onRefresh }: { prospect: Prospect; onRefresh: () => void }) {
  const issues: string[] = prospect.issues ? JSON.parse(prospect.issues) : [];
  const [draft, setDraft] = useState<{ subject: string; body: string } | null>(null);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");

  const [editingEmail, setEditingEmail] = useState(false);
  const [emailInput, setEmailInput] = useState(prospect.contactEmail ?? "");

  const updateProspect = trpc.outreach.prospect.update.useMutation({
    onSuccess: () => { setEditingEmail(false); onRefresh(); },
    onError: (e) => toast.error(e.message),
  });

  const draftEmail = trpc.outreach.draftEmail.useMutation({
    onSuccess: (data) => {
      setDraft(data);
      setEditSubject(data.subject);
      setEditBody(data.body);
    },
    onError: (e) => toast.error(e.message),
  });

  const saveGmailDraft = trpc.outreach.saveGmailDraft.useMutation({
    onSuccess: () => {
      toast.success("Saved to Gmail drafts!");
      setDraft(null);
      onRefresh();
    },
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
    onSuccess: () => onRefresh(),
    onError: (e) => toast.error(e.message),
  });

  function handleDraft(isFollowUp = false) {
    draftEmail.mutate({ prospectId: prospect.id, isFollowUp });
  }

  function handleSaveDraft() {
    if (!editSubject.trim() || !editBody.trim()) return;
    saveGmailDraft.mutate({ prospectId: prospect.id, subject: editSubject, body: editBody });
  }

  return (
    <div className="border rounded-lg p-4 space-y-3 bg-card">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <h3 className="font-medium">{prospect.businessName}</h3>
            <Badge variant="outline" className={STATUS_COLORS[prospect.status]}>
              {prospect.status}
            </Badge>
            {prospect.pageSpeedScore !== null && (
              <ScoreBadge score={prospect.pageSpeedScore} issues={[]} />
            )}
            <IssueBadges issues={issues} />
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            {prospect.address && <span>{prospect.address}</span>}
            {prospect.contactPhone && <span>{prospect.contactPhone}</span>}
            {prospect.website && (
              <a href={prospect.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-foreground">
                {prospect.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
          {/* Email address row */}
          <div className="flex items-center gap-2 mt-1">
            {editingEmail ? (
              <>
                <Input
                  type="email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="contact@business.co.za"
                  className="h-7 text-xs max-w-[220px]"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") updateProspect.mutate({ id: prospect.id, contactEmail: emailInput });
                    if (e.key === "Escape") setEditingEmail(false);
                  }}
                />
                <Button size="sm" className="h-7 text-xs px-2" onClick={() => updateProspect.mutate({ id: prospect.id, contactEmail: emailInput })} disabled={updateProspect.isPending}>Save</Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={() => setEditingEmail(false)}>Cancel</Button>
              </>
            ) : prospect.contactEmail ? (
              <button onClick={() => { setEmailInput(prospect.contactEmail ?? ""); setEditingEmail(true); }} className="text-xs text-blue-600 hover:underline">
                {prospect.contactEmail}
              </button>
            ) : (
              <button onClick={() => { setEmailInput(""); setEditingEmail(true); }} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                <Mail className="h-3 w-3" /> Add email address
              </button>
            )}
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
          onClick={() => deleteMutation.mutate({ id: prospect.id })}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {/* Last email summary (if emailed) */}
      {prospect.status === "emailed" && prospect.lastEmailSubject && (
        <div className="text-xs bg-muted/40 rounded p-2 space-y-0.5">
          <p className="text-muted-foreground">Last email: <span className="text-foreground font-medium">{prospect.lastEmailSubject}</span></p>
          {prospect.lastEmailSentAt && (
            <p className="text-muted-foreground">
              Sent {new Date(prospect.lastEmailSentAt).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}
            </p>
          )}
        </div>
      )}

      {/* Draft composer */}
      {draft && (
        <div className="space-y-2 pt-1">
          <div>
            <Label className="text-xs">Subject</Label>
            <Input value={editSubject} onChange={(e) => setEditSubject(e.target.value)} className="mt-1 text-sm" />
          </div>
          <div>
            <Label className="text-xs">Body</Label>
            <Textarea
              value={editBody}
              onChange={(e) => setEditBody(e.target.value)}
              rows={8}
              className="mt-1 text-sm font-mono"
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              onClick={handleSaveDraft}
              disabled={saveGmailDraft.isPending || !prospect.contactEmail}
            >
              {saveGmailDraft.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              Save to Gmail drafts
            </Button>
            {!prospect.contactEmail && (
              <p className="text-xs text-amber-600 self-center">↑ Add an email address above first</p>
            )}
            <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>Discard</Button>
          </div>
        </div>
      )}

      {/* Action buttons */}
      {!draft && (
        <div className="flex flex-wrap gap-2">
          {(prospect.status === "new") && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleDraft(false)}
              disabled={draftEmail.isPending}
            >
              {draftEmail.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Wand2 className="h-4 w-4 mr-2" />}
              Draft email
            </Button>
          )}
          {prospect.status === "emailed" && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleDraft(true)}
                disabled={draftEmail.isPending}
              >
                {draftEmail.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Mail className="h-4 w-4 mr-2" />}
                Draft follow-up
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => markReplied.mutate({ prospectId: prospect.id })}
                disabled={markReplied.isPending}
              >
                <CheckCheck className="h-4 w-4 mr-2" />
                Mark replied
              </Button>
            </>
          )}
          {prospect.status === "replied" && (
            <Button
              size="sm"
              onClick={() => convertToLead.mutate({ prospectId: prospect.id })}
              disabled={convertToLead.isPending}
            >
              {convertToLead.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
              Convert to lead
            </Button>
          )}
          {prospect.status === "converted" && prospect.leadId && (
            <Link href="/leads">
              <Button size="sm" variant="outline">View lead →</Button>
            </Link>
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

  const statusOrder: ProspectStatus[] = ["replied", "emailed", "new", "converted"];
  const sorted = [...(prospects as Prospect[])].sort(
    (a, b) => statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status)
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{prospects.length} prospect{prospects.length !== 1 ? "s" : ""}</p>
        <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> Add manually
        </Button>
      </div>

      {sorted.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          No prospects yet. Use the Discover tab to find businesses with poor websites.
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map((p) => (
            <ProspectCard key={p.id} prospect={p} onRefresh={refetch} />
          ))}
        </div>
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
                <Input
                  className="mt-1"
                  value={form[field as keyof typeof form]}
                  onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
                  required={field === "businessName"}
                />
              </div>
            ))}
            <div>
              <Label className="text-xs">Notes</Label>
              <Textarea className="mt-1" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={3} />
            </div>
            <Button
              className="w-full"
              disabled={!form.businessName.trim() || createProspect.isPending}
              onClick={() => createProspect.mutate({ ...form })}
            >
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
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Outreach</h1>
        <p className="text-muted-foreground text-sm mt-1">Find businesses with poor web presence and send targeted outreach.</p>
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
          <DiscoverTab onImported={() => {
            prospectsQuery.refetch();
            setActiveTab("prospects");
          }} />
        </TabsContent>

        <TabsContent value="prospects">
          <ProspectsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
