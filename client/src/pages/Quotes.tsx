import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Copy, Trash2, ExternalLink, CheckCircle2, Pencil } from "lucide-react";
import { toast } from "sonner";

type Status = "draft" | "sent" | "signed";

const STATUS_BADGE: Record<Status, { label: string; variant: "default" | "secondary" | "outline" }> = {
  draft:  { label: "Draft",  variant: "secondary" },
  sent:   { label: "Sent",   variant: "default" },
  signed: { label: "Signed", variant: "outline" },
};

function QuoteLink(token: string) {
  return `${window.location.origin}/q/${token}`;
}

export default function Quotes() {
  const utils = trpc.useUtils();
  const { data: quotes = [], isLoading } = trpc.quote.list.useQuery();

  const createMutation = trpc.quote.create.useMutation({ onSuccess: () => { utils.quote.list.invalidate(); setShowCreate(false); resetForm(); } });
  const deleteMutation = trpc.quote.delete.useMutation({ onSuccess: () => utils.quote.list.invalidate() });
  const updateMutation = trpc.quote.update.useMutation({ onSuccess: () => utils.quote.list.invalidate() });

  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [htmlContent, setHtmlContent] = useState("");
  const [status, setStatus] = useState<"draft" | "sent">("draft");

  const [editId, setEditId] = useState<number | null>(null);

  function resetForm() {
    setTitle(""); setClientName(""); setClientEmail(""); setHtmlContent(""); setStatus("draft");
  }

  function openEdit(q: typeof quotes[number]) {
    setEditId(q.id);
    setTitle(q.title);
    setClientName(q.clientName);
    setClientEmail(q.clientEmail ?? "");
    setHtmlContent(q.htmlContent);
    setStatus((q.status === "signed" ? "sent" : q.status) as "draft" | "sent");
  }

  function closeEdit() {
    setEditId(null);
    resetForm();
  }

  function handleCreate() {
    if (!title.trim() || !clientName.trim() || !htmlContent.trim()) return;
    createMutation.mutate({ title: title.trim(), clientName: clientName.trim(), clientEmail: clientEmail.trim() || undefined, htmlContent, status });
  }

  function handleEdit() {
    if (!editId || !title.trim() || !clientName.trim() || !htmlContent.trim()) return;
    updateMutation.mutate(
      { id: editId, title: title.trim(), clientName: clientName.trim(), clientEmail: clientEmail.trim() || undefined, htmlContent },
      { onSuccess: () => { utils.quote.list.invalidate(); closeEdit(); } }
    );
  }

  function copyLink(token: string) {
    navigator.clipboard.writeText(QuoteLink(token));
    toast.success("Link copied");
  }

  function confirmDelete(id: number, title: string) {
    if (confirm(`Delete "${title}"? This cannot be undone.`)) {
      deleteMutation.mutate({ id });
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold">Quotes</h1>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="w-3.5 h-3.5 mr-1" />New Quote
        </Button>
      </div>

      {isLoading ? (
        <div className="rounded-lg border border-border animate-pulse h-32" />
      ) : quotes.length === 0 ? (
        <div className="rounded-lg border border-border bg-muted/20 px-6 py-12 text-center">
          <p className="text-sm text-muted-foreground">No quotes yet. Create one to get a shareable signing link.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="grid grid-cols-[1fr_140px_100px_120px_132px] bg-muted/50 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <span>Quote</span>
            <span>Client</span>
            <span className="text-center">Status</span>
            <span className="text-right">Created</span>
            <span />
          </div>
          <div className="divide-y divide-border bg-background">
            {quotes.map(q => {
              const s = (q.status ?? "draft") as Status;
              const badge = STATUS_BADGE[s];
              return (
                <div key={q.id} className="grid grid-cols-[1fr_140px_100px_120px_132px] items-center px-4 py-3 hover:bg-muted/30 group">
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{q.title}</p>
                    {q.signedBy && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <CheckCircle2 className="w-3 h-3 text-green-600" />
                        Signed by {q.signedBy}
                      </p>
                    )}
                  </div>
                  <span className="text-sm text-muted-foreground truncate">{q.clientName}</span>
                  <div className="flex justify-center">
                    <Select
                      value={s}
                      onValueChange={val => updateMutation.mutate({ id: q.id, status: val as Status })}
                    >
                      <SelectTrigger className="h-6 text-xs w-20 px-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="sent">Sent</SelectItem>
                        <SelectItem value="signed">Signed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <span className="text-xs text-muted-foreground text-right">
                    {new Date(q.createdAt).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => openEdit(q)}
                      className="p-1.5 rounded hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Edit"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => copyLink(q.token)}
                      className="p-1.5 rounded hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Copy signing link"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <a
                      href={QuoteLink(q.token)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Open quote"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                    <button
                      onClick={() => confirmDelete(q.id, q.title)}
                      className="p-1.5 rounded hover:bg-muted text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Edit dialog */}
      <Dialog open={editId !== null} onOpenChange={v => { if (!v) closeEdit(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col gap-0 p-0">
          <div className="px-6 pt-6 pb-4 border-b border-border flex-shrink-0">
            <DialogTitle>Edit Quote</DialogTitle>
          </div>
          <div className="flex-1 overflow-y-auto space-y-4 p-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Title</Label>
                <Input placeholder="e.g. Addex — Website Rebuild" value={title} onChange={e => setTitle(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Client name</Label>
                <Input placeholder="e.g. Inshaan Omar" value={clientName} onChange={e => setClientName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Client email <span className="text-muted-foreground">(optional)</span></Label>
                <Input type="email" placeholder="e.g. inshaan@addex.co.za" value={clientEmail} onChange={e => setClientEmail(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>HTML content</Label>
              <Textarea
                placeholder="Paste the full HTML of the quote here…"
                value={htmlContent}
                onChange={e => setHtmlContent(e.target.value)}
                className="font-mono text-xs min-h-[240px]"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 px-6 py-4 border-t border-border flex-shrink-0">
            <Button variant="outline" onClick={closeEdit}>Cancel</Button>
            <Button
              onClick={handleEdit}
              disabled={!title.trim() || !clientName.trim() || !htmlContent.trim() || updateMutation.isPending}
            >
              {updateMutation.isPending ? "Saving…" : "Save Changes"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create dialog */}
      <Dialog open={showCreate} onOpenChange={v => { setShowCreate(v); if (!v) resetForm(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col gap-0 p-0">
          <div className="px-6 pt-6 pb-4 border-b border-border flex-shrink-0">
            <DialogTitle>New Quote</DialogTitle>
          </div>
          <div className="flex-1 overflow-y-auto space-y-4 p-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Title</Label>
                <Input placeholder="e.g. Addex — Website Rebuild" value={title} onChange={e => setTitle(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={status} onValueChange={v => setStatus(v as "draft" | "sent")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="sent">Sent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Client name</Label>
                <Input placeholder="e.g. Inshaan Omar" value={clientName} onChange={e => setClientName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Client email <span className="text-muted-foreground">(optional)</span></Label>
                <Input type="email" placeholder="e.g. inshaan@addex.co.za" value={clientEmail} onChange={e => setClientEmail(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>HTML content</Label>
              <Textarea
                placeholder="Paste the full HTML of the quote here…"
                value={htmlContent}
                onChange={e => setHtmlContent(e.target.value)}
                className="font-mono text-xs min-h-[240px]"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 px-6 py-4 border-t border-border flex-shrink-0">
            <Button variant="outline" onClick={() => { setShowCreate(false); resetForm(); }}>Cancel</Button>
            <Button
              onClick={handleCreate}
              disabled={!title.trim() || !clientName.trim() || !htmlContent.trim() || createMutation.isPending}
            >
              {createMutation.isPending ? "Creating…" : "Create Quote"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
