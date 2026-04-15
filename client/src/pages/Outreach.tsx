import { trpc } from "@/lib/trpc";
import { useState, useRef, useEffect } from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  useDroppable,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import {
  Search, Loader2, ExternalLink, Trash2, Mail, Wand2, Send,
  CheckCheck, Plus, AlertTriangle, Gauge, Globe, Phone, MapPin, Building2,
  Star, Link2, FolderSearch, Sparkles, Bot, StopCircle, RefreshCw,
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

type Directory = { title: string; url: string; description: string; isSearchQuery?: boolean; query?: string };

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
  const [editingWebsite, setEditingWebsite] = useState(false);
  const [websiteInput, setWebsiteInput] = useState(prospect.website ?? "");
  const [editingContactName, setEditingContactName] = useState(false);
  const [contactNameInput, setContactNameInput] = useState(prospect.contactName ?? "");
  const [editingPhone, setEditingPhone] = useState(false);
  const [phoneInput, setPhoneInput] = useState(prospect.contactPhone ?? "");
  const [editingAddress, setEditingAddress] = useState(false);
  const [addressInput, setAddressInput] = useState(prospect.address ?? "");

  const updateProspect = trpc.outreach.prospect.update.useMutation({
    onSuccess: (_data, vars) => {
      if (vars.contactEmail !== undefined) setEditingEmail(false);
      if (vars.notes !== undefined) setEditingNotes(false);
      if (vars.website !== undefined) setEditingWebsite(false);
      if (vars.contactName !== undefined) setEditingContactName(false);
      if (vars.contactPhone !== undefined) setEditingPhone(false);
      if (vars.address !== undefined) setEditingAddress(false);
      onRefresh();
    },
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

  const refreshChecks = trpc.outreach.prospect.refreshChecks.useMutation({
    onSuccess: () => { toast.success("Website checks refreshed"); onRefresh(); },
    onError: (e) => toast.error(e.message),
  });

  const hunterKey = `hunter_searched:${prospect.id}`;
  const [hunterSearchedAt, setHunterSearchedAt] = useState<string | null>(() => localStorage.getItem(hunterKey));

  const hunterLookup = trpc.outreach.hunterLookup.useMutation({
    onSuccess: (data) => {
      const ts = new Date().toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
      localStorage.setItem(hunterKey, ts);
      setHunterSearchedAt(ts);
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
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col p-0 gap-0">
        <div className="px-6 pt-6 pb-4 border-b">
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
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Details */}
          <div className="space-y-1.5 text-sm">
            <div className="flex items-start gap-2 text-muted-foreground">
              <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              {editingAddress ? (
                <div className="flex gap-2 flex-1">
                  <Input value={addressInput} onChange={(e) => setAddressInput(e.target.value)} className="h-7 text-sm" autoFocus
                    onKeyDown={(e) => { if (e.key === "Enter") updateProspect.mutate({ id: prospect.id, address: addressInput.trim() || null }); if (e.key === "Escape") setEditingAddress(false); }} />
                  <Button size="sm" className="h-7 text-xs" onClick={() => updateProspect.mutate({ id: prospect.id, address: addressInput.trim() || null })} disabled={updateProspect.isPending}>Save</Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingAddress(false)}>Cancel</Button>
                </div>
              ) : prospect.address ? (
                <div className="flex items-center gap-2">
                  <span>{prospect.address}</span>
                  <button onClick={() => { setAddressInput(prospect.address ?? ""); setEditingAddress(true); }} className="text-xs text-muted-foreground hover:text-foreground underline shrink-0">edit</button>
                </div>
              ) : (
                <button onClick={() => { setAddressInput(""); setEditingAddress(true); }} className="text-sm italic hover:text-foreground">Add address</button>
              )}
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Phone className="h-3.5 w-3.5 shrink-0" />
              {editingPhone ? (
                <div className="flex gap-2 flex-1">
                  <Input value={phoneInput} onChange={(e) => setPhoneInput(e.target.value)} placeholder="010 000 0000" className="h-7 text-sm" autoFocus
                    onKeyDown={(e) => { if (e.key === "Enter") updateProspect.mutate({ id: prospect.id, contactPhone: phoneInput.trim() || null }); if (e.key === "Escape") setEditingPhone(false); }} />
                  <Button size="sm" className="h-7 text-xs" onClick={() => updateProspect.mutate({ id: prospect.id, contactPhone: phoneInput.trim() || null })} disabled={updateProspect.isPending}>Save</Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingPhone(false)}>Cancel</Button>
                </div>
              ) : prospect.contactPhone ? (
                <div className="flex items-center gap-2">
                  <span>{prospect.contactPhone}</span>
                  <button onClick={() => { setPhoneInput(prospect.contactPhone ?? ""); setEditingPhone(true); }} className="text-xs text-muted-foreground hover:text-foreground underline shrink-0">edit</button>
                </div>
              ) : (
                <button onClick={() => { setPhoneInput(""); setEditingPhone(true); }} className="text-sm italic hover:text-foreground">Add phone</button>
              )}
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Globe className="h-3.5 w-3.5 shrink-0" />
              {editingWebsite ? (
                <div className="flex gap-2 flex-1">
                  <Input
                    value={websiteInput}
                    onChange={(e) => setWebsiteInput(e.target.value)}
                    placeholder="https://example.co.za"
                    className="h-7 text-sm"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") updateProspect.mutate({ id: prospect.id, website: websiteInput.trim() });
                      if (e.key === "Escape") setEditingWebsite(false);
                    }}
                  />
                  <Button size="sm" className="h-7 text-xs" onClick={() => updateProspect.mutate({ id: prospect.id, website: websiteInput.trim() })} disabled={updateProspect.isPending}>Save</Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingWebsite(false)}>Cancel</Button>
                </div>
              ) : prospect.website ? (
                <div className="flex items-center gap-2">
                  <a href={prospect.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-foreground hover:underline">
                    {prospect.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                  <button onClick={() => { setWebsiteInput(prospect.website ?? ""); setEditingWebsite(true); }} className="text-xs text-muted-foreground hover:text-foreground underline">edit</button>
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <button onClick={() => { setWebsiteInput(""); setEditingWebsite(true); }} className="text-sm italic hover:text-foreground text-left">Add website</button>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { label: "Google", url: `https://www.google.com/search?q=${encodeURIComponent(prospect.businessName)}` },
                      { label: "Maps", url: `https://www.google.com/maps/search/${encodeURIComponent(prospect.businessName + (prospect.address ? " " + prospect.address : ""))}` },
                      { label: "Facebook", url: `https://www.facebook.com/search/top?q=${encodeURIComponent(prospect.businessName)}` },
                    ].map(({ label, url }) => (
                      <a key={label} href={url} target="_blank" rel="noopener noreferrer"
                        className="text-xs px-2 py-0.5 rounded border border-muted hover:border-foreground/30 hover:bg-muted transition-colors text-muted-foreground hover:text-foreground flex items-center gap-1">
                        {label} <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
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
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs font-medium text-muted-foreground">Issues found</p>
              <button
                onClick={() => refreshChecks.mutate({ id: prospect.id })}
                disabled={refreshChecks.isPending}
                className="text-xs text-muted-foreground hover:text-foreground underline flex items-center gap-1 disabled:opacity-50"
                title="Re-run PageSpeed and SSL checks against the current website"
              >
                {refreshChecks.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                Re-check
              </button>
            </div>
            {issues.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                <ScoreBadge score={prospect.pageSpeedScore} issues={issues} />
                <IssueBadges issues={issues.filter((i) => !i.startsWith("Score:"))} />
              </div>
            ) : (
              <p className="text-xs italic text-muted-foreground">No issues detected.</p>
            )}
          </div>


          {/* Business context */}
          {prospect.businessContext && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">About this business</p>
              <p className="text-sm text-muted-foreground leading-relaxed">{prospect.businessContext}</p>
            </div>
          )}

          {/* Contact name */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Contact name</p>
            {editingContactName ? (
              <div className="flex gap-2">
                <Input
                  value={contactNameInput}
                  onChange={(e) => setContactNameInput(e.target.value)}
                  placeholder="e.g. Kevin Smith"
                  className="h-8 text-sm"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") updateProspect.mutate({ id: prospect.id, contactName: contactNameInput.trim() || null });
                    if (e.key === "Escape") setEditingContactName(false);
                  }}
                />
                <Button size="sm" className="h-8" onClick={() => updateProspect.mutate({ id: prospect.id, contactName: contactNameInput.trim() || null })} disabled={updateProspect.isPending}>Save</Button>
                <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditingContactName(false)}>Cancel</Button>
              </div>
            ) : (
              <button onClick={() => { setContactNameInput(prospect.contactName ?? ""); setEditingContactName(true); }} className="text-sm text-left hover:text-foreground">
                {prospect.contactName || <span className="text-muted-foreground italic">Add contact name</span>}
              </button>
            )}
          </div>

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
              <div className="space-y-1.5">
                <button onClick={() => { setEmailInput(prospect.contactEmail ?? ""); setEditingEmail(true); }} className="text-sm text-blue-600 hover:underline block">
                  {prospect.contactEmail}
                </button>
                {prospect.website && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => hunterLookup.mutate({ prospectId: prospect.id })}
                      disabled={hunterLookup.isPending}
                    >
                      {hunterLookup.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Search className="h-3 w-3 mr-1" />}
                      {hunterSearchedAt ? "Search Hunter.io again" : "Enhance via Hunter.io"}
                    </Button>
                    {hunterSearchedAt && (
                      <span className="text-xs text-muted-foreground">Searched {hunterSearchedAt}</span>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                <button onClick={() => { setEmailInput(""); setEditingEmail(true); }} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5" /> Add email address
                </button>
                {prospect.website && (
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => hunterLookup.mutate({ prospectId: prospect.id })}
                      disabled={hunterLookup.isPending}
                    >
                      {hunterLookup.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Search className="h-3 w-3 mr-1" />}
                      {hunterSearchedAt ? "Search Hunter.io again" : "Find via Hunter.io"}
                    </Button>
                    {hunterSearchedAt && (
                      <span className="text-xs text-muted-foreground">Searched {hunterSearchedAt} — no result</span>
                    )}
                  </div>
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

        </div>

        {/* Sticky footer — always visible regardless of scroll */}
        <div className="border-t px-6 py-3 flex flex-wrap gap-2 bg-background shrink-0">
          {!draft && (
            <>
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
            </>
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

function SortableCard({ prospect, onClick }: { prospect: Prospect; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging, transform, transition } = useSortable({ id: prospect.id });
  const dragStartPos = useRef<{ x: number; y: number } | null>(null);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: transform ? `translate3d(${transform.x}px,${transform.y}px,0)` : undefined, transition, opacity: isDragging ? 0.3 : 1 }}
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
      <KanbanCardContent prospect={prospect} isDragging={isDragging} />
    </div>
  );
}

function DroppableColumn({
  col,
  prospects,
  onCardClick,
  isOver,
  onSort,
}: {
  col: typeof COLUMNS[number];
  prospects: Prospect[];
  onCardClick: (p: Prospect) => void;
  isOver: boolean;
  onSort: (by: "score" | "email") => void;
}) {
  const { setNodeRef } = useDroppable({ id: col.status });

  return (
    <div className="flex-shrink-0 w-64">
      <div className={`flex items-center justify-between px-3 py-2 rounded-t-lg border ${col.headerBg} mb-2`}>
        <span className={`text-xs font-semibold uppercase tracking-wide ${col.color}`}>{col.label}</span>
        <div className="flex items-center gap-1.5">
          <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${col.headerBg} ${col.color} border`}>
            {prospects.length}
          </span>
          <button onClick={() => onSort("score")} title="Sort by lead score" className="text-xs text-muted-foreground hover:text-foreground transition-colors px-1">↓ Score</button>
          <button onClick={() => onSort("email")} title="Email first" className="text-xs text-muted-foreground hover:text-foreground transition-colors px-1">✉</button>
        </div>
      </div>
      <div
        ref={setNodeRef}
        className={`space-y-2 min-h-[120px] rounded-lg transition-colors p-1 -m-1
          ${isOver ? "bg-primary/5 ring-2 ring-primary/20" : ""}`}
      >
        <SortableContext items={prospects.map((p) => p.id)} strategy={verticalListSortingStrategy}>
          {prospects.length === 0 ? (
            <div className={`border-2 border-dashed rounded-lg p-4 text-center text-xs transition-colors
              ${isOver ? "border-primary/30 text-primary/50" : "border-muted text-muted-foreground/50"}`}>
              Drop here
            </div>
          ) : (
            prospects.map((p) => (
              <SortableCard key={p.id} prospect={p} onClick={() => onCardClick(p)} />
            ))
          )}
        </SortableContext>
      </div>
    </div>
  );
}

// ── Kanban board ──────────────────────────────────────────────────────────────

function KanbanBoard({ prospects, onRefresh }: { prospects: Prospect[]; onRefresh: () => void }) {
  const [selected, setSelected] = useState<Prospect | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [overId, setOverId] = useState<ProspectStatus | null>(null);
  const [columnOrders, setColumnOrders] = useState<Record<string, number[]>>(() => {
    try { return JSON.parse(localStorage.getItem("prospect_column_orders") ?? "{}"); } catch { return {}; }
  });

  function getOrdered(status: ProspectStatus): Prospect[] {
    const col = prospects.filter((p) => p.status === status);
    const order = columnOrders[status];
    if (!order?.length) return col;
    const mapped = order.map((id) => col.find((p) => p.id === id)).filter(Boolean) as Prospect[];
    const rest = col.filter((p) => !order.includes(p.id));
    return [...mapped, ...rest];
  }

  function saveOrder(status: ProspectStatus, ordered: Prospect[]) {
    const next = { ...columnOrders, [status]: ordered.map((p) => p.id) };
    setColumnOrders(next);
    localStorage.setItem("prospect_column_orders", JSON.stringify(next));
  }

  function sortColumn(status: ProspectStatus, by: "score" | "email") {
    const col = prospects.filter((p) => p.status === status);
    const sorted = [...col].sort((a, b) => {
      if (by === "email") {
        if (a.contactEmail && !b.contactEmail) return -1;
        if (!a.contactEmail && b.contactEmail) return 1;
      }
      return (b.leadScore ?? 0) - (a.leadScore ?? 0);
    });
    saveOrder(status, sorted);
  }

  const updateStatus = trpc.outreach.prospect.update.useMutation({
    onSuccess: onRefresh,
    onError: (e) => toast.error(e.message),
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const activeProspect = activeId ? prospects.find((p) => p.id === activeId) : null;

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    setOverId(null);
    if (!over) return;

    const dragged = prospects.find((p) => p.id === active.id);
    if (!dragged) return;

    // Cross-column move: over.id is a status string
    if (typeof over.id === "string") {
      const newStatus = over.id as ProspectStatus;
      if (dragged.status !== newStatus) updateStatus.mutate({ id: dragged.id, status: newStatus });
      return;
    }

    // Within-column reorder: over.id is a prospect id number
    const overProspect = prospects.find((p) => p.id === over.id);
    if (!overProspect || dragged.status !== overProspect.status) return;
    const ordered = getOrdered(dragged.status);
    const oldIdx = ordered.findIndex((p) => p.id === active.id);
    const newIdx = ordered.findIndex((p) => p.id === over.id);
    if (oldIdx === newIdx) return;
    saveOrder(dragged.status, arrayMove(ordered, oldIdx, newIdx));
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        onDragStart={({ active }) => setActiveId(active.id as number)}
        onDragOver={({ over }) => setOverId(over && typeof over.id === "string" ? over.id as ProspectStatus : null)}
        onDragEnd={handleDragEnd}
        onDragCancel={() => { setActiveId(null); setOverId(null); }}
      >
        <div className="flex gap-4 overflow-x-auto pb-4 -mx-1 px-1">
          {COLUMNS.map((col) => (
            <DroppableColumn
              key={col.status}
              col={col}
              prospects={getOrdered(col.status)}
              onCardClick={setSelected}
              isOver={overId === col.status}
              onSort={(by) => sortColumn(col.status, by)}
            />
          ))}
        </div>

        <DragOverlay>
          {activeProspect && <KanbanCardContent prospect={activeProspect} isDragging />}
        </DragOverlay>
      </DndContext>

      {selected && (
        <ProspectModal
          prospect={prospects.find((p) => p.id === selected.id) ?? selected}
          onClose={() => setSelected(null)}
          onRefresh={() => { onRefresh(); }}
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

// ── Search history ────────────────────────────────────────────────────────────

function useSearchHistory(key: string, max = 8) {
  const storageKey = `outreach_history_${key}`;
  const [history, setHistory] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(storageKey) ?? "[]"); } catch { return []; }
  });
  const push = (val: string) => {
    if (!val.trim()) return;
    setHistory((prev) => {
      const next = [val, ...prev.filter((v) => v !== val)].slice(0, max);
      localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });
  };
  return { history, push };
}

function SearchHistory({ history, onSelect }: { history: string[]; onSelect: (v: string) => void }) {
  if (history.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {history.map((v) => (
        <button
          key={v}
          onClick={() => onSelect(v)}
          className="text-xs px-2 py-0.5 rounded-full border border-border bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors truncate max-w-[220px]"
        >
          {v}
        </button>
      ))}
    </div>
  );
}

// ── Agent Mode ───────────────────────────────────────────────────────────────

type AgentBusiness = {
  businessName: string; address: string; phone: string; website: string;
  pageSpeedScore: number | null; contactEmail: string; issues: string[];
  businessContext: string; leadScore: number;
  googleRating: number | null; googleReviewCount: number | null;
};
type AgentLog = { icon: string; message: string; ts: Date };

function AgentMode({ onImported }: { onImported: () => void }) {
  const [criteria, setCriteria] = useState("");
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [businesses, setBusinesses] = useState<AgentBusiness[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const esRef = useRef<EventSource | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const agentHistory = useSearchHistory("agent");

  const importProspects = trpc.outreach.importProspects.useMutation({
    onSuccess: (data) => { toast.success(`Imported ${data.count} prospects`); onImported(); },
    onError: (e) => toast.error(e.message),
  });

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  useEffect(() => () => { esRef.current?.close(); }, []);

  function addLog(icon: string, message: string) {
    setLogs((prev) => [...prev, { icon, message, ts: new Date() }]);
  }

  function runAgent() {
    if (!criteria.trim() || running) return;
    agentHistory.push(criteria.trim());
    setRunning(true);
    setDone(false);
    setLogs([]);
    setBusinesses([]);
    setSelected(new Set());

    esRef.current?.close();
    const es = new EventSource(`/api/outreach/agent?criteria=${encodeURIComponent(criteria.trim())}`);
    esRef.current = es;

    es.onmessage = (e) => {
      const event = JSON.parse(e.data) as { type: string; icon?: string; message?: string; business?: AgentBusiness; count?: number };
      if (event.type === "log") addLog(event.icon ?? "•", event.message ?? "");
      if (event.type === "business" && event.business) {
        setBusinesses((prev) => {
          const next = [...prev, event.business!].sort((a, b) => (b.leadScore ?? 0) - (a.leadScore ?? 0));
          // rebuild selected to select all
          setSelected(new Set(next.map((_, i) => i)));
          return next;
        });
      }
      if (event.type === "done") { setDone(true); setRunning(false); es.close(); }
      if (event.type === "error") { addLog("❌", event.message ?? "Unknown error"); setRunning(false); es.close(); }
    };
    es.onerror = () => { if (running) addLog("❌", "Connection lost"); setRunning(false); es.close(); };
  }

  function stopAgent() {
    esRef.current?.close();
    setRunning(false);
    addLog("⏹", "Stopped by user");
  }

  function handleImport() {
    const toImport = businesses
      .filter((_, i) => selected.has(i))
      .map((b) => ({
        businessName: b.businessName,
        address: b.address || undefined,
        contactPhone: b.phone || undefined,
        contactEmail: b.contactEmail || undefined,
        website: b.website || undefined,
        pageSpeedScore: b.pageSpeedScore,
        issues: JSON.stringify(b.issues),
        businessContext: b.businessContext || undefined,
        leadScore: b.leadScore,
        googleRating: b.googleRating != null ? String(b.googleRating) : undefined,
        googleReviewCount: b.googleReviewCount ?? undefined,
      }));
    importProspects.mutate({ prospects: toImport });
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-muted-foreground mb-3">
          One search. The agent automatically finds businesses across Google Places and SA directories, enriches each one, and reports everything in real time.
        </p>
        <div className="flex gap-2">
          <Input
            placeholder='e.g. "industrial suppliers Gauteng" or "gyms in Cape Town"'
            value={criteria}
            onChange={(e) => setCriteria(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !running) runAgent(); }}
            className="max-w-md"
            disabled={running}
          />
          {running ? (
            <Button variant="destructive" onClick={stopAgent}>
              <StopCircle className="h-4 w-4 mr-2" /> Stop
            </Button>
          ) : (
            <Button onClick={runAgent} disabled={!criteria.trim()}>
              <Bot className="h-4 w-4 mr-2" /> Run Agent
            </Button>
          )}
        </div>
        <SearchHistory history={agentHistory.history} onSelect={(v) => { setCriteria(v); }} />
      </div>

      {(logs.length > 0 || businesses.length > 0) && (
        <div className="grid grid-cols-5 gap-4 min-h-[400px]">
          {/* Live log */}
          <div className="col-span-2 border rounded-lg bg-zinc-950 p-3 overflow-y-auto max-h-[520px] flex flex-col gap-0.5">
            {logs.map((log, i) => (
              <div key={i} className="flex items-start gap-2 text-xs font-mono leading-relaxed">
                <span className="shrink-0 opacity-40 tabular-nums">{log.ts.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
                <span className="shrink-0">{log.icon}</span>
                <span className="text-zinc-300 break-words min-w-0">{log.message}</span>
              </div>
            ))}
            {running && (
              <div className="flex items-center gap-2 text-xs font-mono text-zinc-500 mt-1">
                <Loader2 className="h-3 w-3 animate-spin" /> working...
              </div>
            )}
            <div ref={logEndRef} />
          </div>

          {/* Businesses */}
          <div className="col-span-3 overflow-y-auto max-h-[520px] space-y-2 pr-1">
            {businesses.length === 0 && running && (
              <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Searching...
              </div>
            )}
            {businesses.map((b, i) => (
              <label key={i} className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${selected.has(i) ? "bg-muted/30 border-primary/30" : "hover:bg-muted/20"}`}>
                <input
                  type="checkbox"
                  checked={selected.has(i)}
                  onChange={() => {
                    setSelected((prev) => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; });
                  }}
                  className="mt-1 shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="font-medium text-sm">{b.businessName}</span>
                    <LeadScoreBadge score={b.leadScore} />
                    <ScoreBadge score={b.pageSpeedScore} issues={b.issues} />
                    <IssueBadges issues={b.issues.filter((iss) => !iss.startsWith("Score:"))} />
                  </div>
                  {b.address && <p className="text-xs text-muted-foreground">{b.address}</p>}
                  {b.businessContext && <p className="text-xs text-muted-foreground/80 mt-0.5 line-clamp-2">{b.businessContext}</p>}
                  <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
                    {b.phone && <span>{b.phone}</span>}
                    {b.googleRating != null && (
                      <span className="flex items-center gap-1"><Star className="h-3 w-3" /> {b.googleRating}{b.googleReviewCount != null && ` (${b.googleReviewCount})`}</span>
                    )}
                    {b.contactEmail && <span className="text-blue-600">{b.contactEmail}</span>}
                    {b.website && (
                      <a href={b.website} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="flex items-center gap-1 hover:text-foreground">
                        {b.website.replace(/^https?:\/\//, "").replace(/\/$/, "")} <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>
              </label>
            ))}
          </div>
        </div>
      )}

      {businesses.length > 0 && (
        <div className="flex items-center justify-between pt-2 border-t">
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">{businesses.length} businesses found</span>
            <button
              onClick={() => setSelected(selected.size === businesses.length ? new Set() : new Set(businesses.map((_, i) => i)))}
              className="text-xs text-muted-foreground underline underline-offset-2"
            >
              {selected.size === businesses.length ? "Deselect all" : "Select all"}
            </button>
          </div>
          <Button disabled={selected.size === 0 || importProspects.isPending} onClick={handleImport}>
            {importProspects.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
            Import {selected.size} selected
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Discover Tab ─────────────────────────────────────────────────────────────

function DiscoverTab({ onImported }: { onImported: () => void }) {
  const [discoverMode, setDiscoverMode] = useState<"places" | "directory" | "find" | "agent">("places");

  // Places mode state
  const [criteria, setCriteria] = useState("");
  const [placeCandidates, setPlaceCandidates] = useState<Candidate[]>([]);
  const [placeSelected, setPlaceSelected] = useState<Set<number>>(new Set());
  const placesHistory = useSearchHistory("places");

  // Directory mode state
  const [directoryUrl, setDirectoryUrl] = useState("");
  const [dirCandidates, setDirCandidates] = useState<Candidate[]>([]);
  const [dirSelected, setDirSelected] = useState<Set<number>>(new Set());
  const directoryHistory = useSearchHistory("directory");

  // Find directories mode state
  const [findCriteria, setFindCriteria] = useState("");
  const [directories, setDirectories] = useState<Directory[]>([]);
  const findHistory = useSearchHistory("find");

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
        <button
          onClick={() => setDiscoverMode("agent")}
          className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md transition-colors ${discoverMode === "agent" ? "bg-primary text-primary-foreground shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"}`}
        >
          <Bot className="h-3.5 w-3.5" /> Agent
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
                if (e.key === "Enter" && criteria.trim() && !discover.isPending) {
                  placesHistory.push(criteria.trim());
                  discover.mutate({ criteria: criteria.trim() });
                }
              }}
              className="max-w-md"
            />
            <Button onClick={() => { placesHistory.push(criteria.trim()); discover.mutate({ criteria: criteria.trim() }); }} disabled={!criteria.trim() || discover.isPending}>
              {discover.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Enriching…</> : <><Search className="h-4 w-4 mr-2" />Discover</>}
            </Button>
          </div>
          <SearchHistory history={placesHistory.history} onSelect={(v) => setCriteria(v)} />
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
                if (e.key === "Enter" && directoryUrl.trim() && !crawlDirectory.isPending) {
                  directoryHistory.push(directoryUrl.trim());
                  crawlDirectory.mutate({ url: directoryUrl.trim() });
                }
              }}
              className="max-w-lg"
            />
            <Button onClick={() => { directoryHistory.push(directoryUrl.trim()); crawlDirectory.mutate({ url: directoryUrl.trim() }); }} disabled={!directoryUrl.trim() || crawlDirectory.isPending}>
              {crawlDirectory.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Crawling…</> : <><Link2 className="h-4 w-4 mr-2" />Crawl</>}
            </Button>
          </div>
          <SearchHistory history={directoryHistory.history} onSelect={(v) => setDirectoryUrl(v)} />
          {crawlDirectory.isPending && (
            <p className="text-xs text-muted-foreground">Scraping directory page, looking up each business on Google Places, and enriching — this may take a minute…</p>
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
            Describe the type of business you're targeting and we'll suggest Google searches to find real directory pages. Open the search, find a listing page, then paste its URL into "Crawl Directory".
          </p>
          <div className="flex gap-2">
            <Input
              placeholder='e.g. "Gyms in Pretoria" or "Cape Town restaurants"'
              value={findCriteria}
              onChange={(e) => setFindCriteria(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && findCriteria.trim() && !findDirectories.isPending) {
                  findHistory.push(findCriteria.trim());
                  findDirectories.mutate({ criteria: findCriteria.trim() });
                }
              }}
              className="max-w-md"
            />
            <Button onClick={() => { findHistory.push(findCriteria.trim()); findDirectories.mutate({ criteria: findCriteria.trim() }); }} disabled={!findCriteria.trim() || findDirectories.isPending}>
              {findDirectories.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Finding…</> : <><FolderSearch className="h-4 w-4 mr-2" />Find</>}
            </Button>
          </div>
          <SearchHistory history={findHistory.history} onSelect={(v) => setFindCriteria(v)} />
          {directories.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Suggested searches — open in Google, find a good listing page, then paste the URL into "Crawl Directory"</p>
              <div className="divide-y border rounded-lg">
                {directories.map((dir, i) => (
                  <div key={i} className="p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{dir.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{dir.description}</p>
                        {dir.query && <p className="text-xs text-zinc-400 font-mono mt-1 truncate">{dir.query}</p>}
                      </div>
                      <a
                        href={dir.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0"
                      >
                        <Button size="sm" variant="outline">
                          <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Search
                        </Button>
                      </a>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Find a page with a list of businesses, copy its URL, then switch to "Crawl Directory" and paste it in.</p>
            </div>
          )}
        </div>
      )}

      {/* Agent mode */}
      {discoverMode === "agent" && (
        <AgentMode onImported={onImported} />
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
