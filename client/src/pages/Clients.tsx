import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Building2, ArrowRight, FileText, Plus, LayoutGrid, List, BarChart2, Link2, ExternalLink, Trash2, AlertTriangle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type ViewMode = "card" | "list";

type ClientRow = {
  clientSlug: string;
  clientName: string;
  clientContact?: string | null;
  analyticsToken?: string | null;
};

export default function Clients() {
  const utils = trpc.useUtils();
  const { data: clients, isLoading } = trpc.invoice.clients.useQuery(undefined, { retry: false });
  const { data: tasks = [] } = trpc.task.list.useQuery(undefined, { retry: false });
  const [view, setView] = useState<ViewMode>(() =>
    (localStorage.getItem("clients-view") as ViewMode) ?? "card"
  );

  const [analyticsSheet, setAnalyticsSheet] = useState<{ open: boolean; client: ClientRow | null }>({
    open: false,
    client: null,
  });
  const [embedUrl, setEmbedUrl] = useState("");

  const openTaskSlugs = new Set(
    tasks.filter(t => t.status !== 'done' && t.clientSlug).map(t => t.clientSlug!)
  );

  const openTaskCount = tasks
    .filter(t => t.status !== 'done' && t.clientSlug)
    .reduce<Record<string, number>>((acc, t) => {
      acc[t.clientSlug!] = (acc[t.clientSlug!] ?? 0) + 1;
      return acc;
    }, {});

  const setAnalyticsMutation = trpc.client.setAnalytics.useMutation({
    onSuccess: (result) => {
      utils.invoice.clients.invalidate();
      // Update the sheet client state with new token
      setAnalyticsSheet(prev => prev.client
        ? { ...prev, client: { ...prev.client, analyticsToken: result.token } }
        : prev
      );
      toast.success("Analytics configured");
      setEmbedUrl("");
    },
    onError: () => toast.error("Failed to save analytics URL"),
  });

  const clearAnalyticsMutation = trpc.client.clearAnalytics.useMutation({
    onSuccess: () => {
      utils.invoice.clients.invalidate();
      setAnalyticsSheet(prev => prev.client
        ? { ...prev, client: { ...prev.client, analyticsToken: null } }
        : prev
      );
      toast.success("Analytics removed");
    },
    onError: () => toast.error("Failed to remove analytics"),
  });

  function setViewMode(v: ViewMode) {
    setView(v);
    localStorage.setItem("clients-view", v);
  }

  function openAnalytics(e: React.MouseEvent, client: ClientRow) {
    e.preventDefault();
    e.stopPropagation();
    setEmbedUrl("");
    setAnalyticsSheet({ open: true, client });
  }

  function copyAnalyticsLink(token: string) {
    const url = `${window.location.origin}/analytics/${token}`;
    navigator.clipboard.writeText(url).then(() => toast.success("Link copied")).catch(() => toast.error("Failed to copy"));
  }

  function embedUrlWarning(raw: string): string | null {
    if (!raw.trim()) return null;
    const urlToCheck = raw.trim().startsWith("<")
      ? (raw.match(/src="([^"]+)"/) ?? [])[1] ?? raw
      : raw.trim();
    try {
      const parsed = new URL(urlToCheck);
      if (parsed.origin === window.location.origin) {
        return "This URL points to your own app — it should start with plausible.io (or your Plausible instance).";
      }
    } catch {
      // not a valid URL yet, ignore
    }
    return null;
  }

  function openAnalyticsLink(token: string) {
    window.open(`/analytics/${token}`, "_blank");
  }

  const sheetClient = analyticsSheet.client;
  const hasAnalytics = !!sheetClient?.analyticsToken;

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Clients</h1>
          {clients && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {clients.length} active client{clients.length !== 1 ? "s" : ""}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex items-center border border-border rounded-lg p-0.5 bg-muted/40">
            <button
              onClick={() => setViewMode("card")}
              className={`p-1.5 rounded-md transition-colors ${view === "card" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              title="Card view"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`p-1.5 rounded-md transition-colors ${view === "list" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              title="List view"
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>
          <Link href="/invoice/new">
            <Button size="sm" className="gap-1.5 text-xs">
              <Plus className="w-3.5 h-3.5" />
              New Invoice
            </Button>
          </Link>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="shadow-sm animate-pulse">
              <CardContent className="p-6">
                <div className="w-10 h-10 bg-muted rounded-lg mb-4" />
                <div className="h-4 bg-muted rounded w-3/4 mb-2" />
                <div className="h-3 bg-muted rounded w-1/2" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : clients && clients.length > 0 ? (
        view === "card" ? (
          /* Card view */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {clients.map((client) => (
              <Link key={client.clientSlug} href={`/client/${client.clientSlug}`}>
                <Card className="shadow-sm hover:shadow-md transition-shadow cursor-pointer group border-primary/20 bg-primary/[0.02]">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="relative w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                        <Building2 className="w-5 h-5 text-primary" />
                        {openTaskSlugs.has(client.clientSlug) && (
                          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-background" />
                        )}
                      </div>
                      <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                    <h4 className="text-sm font-semibold text-foreground mb-1">{client.clientName}</h4>
                    {client.clientContact && (
                      <p className="text-xs text-muted-foreground mb-3">{client.clientContact}</p>
                    )}
                    <button
                      onClick={(e) => openAnalytics(e, client)}
                      className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md border transition-colors mt-1 ${
                        client.analyticsToken
                          ? "bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100"
                          : "bg-muted/60 text-muted-foreground border-border hover:bg-muted"
                      }`}
                    >
                      <BarChart2 className="w-3 h-3" />
                      Analytics
                      {client.analyticsToken && (
                        <span className="text-[9px] font-bold bg-indigo-600 text-white px-1.5 py-0.5 rounded-full leading-none">
                          Enabled
                        </span>
                      )}
                    </button>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          /* List view */
          <div className="rounded-lg border border-border overflow-hidden shadow-sm">
            {/* Header */}
            <div className="grid grid-cols-[2fr_2fr_120px_100px_32px] bg-muted/50 border-b border-border px-4 py-2.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Client</span>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Contact</span>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Open Tasks</span>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Analytics</span>
              <span />
            </div>
            {/* Rows */}
            <div className="divide-y divide-border bg-background">
              {clients.map((client) => {
                const count = openTaskCount[client.clientSlug] ?? 0;
                return (
                  <Link key={client.clientSlug} href={`/client/${client.clientSlug}`}>
                    <div className="grid grid-cols-[2fr_2fr_120px_100px_32px] items-center px-4 py-3 hover:bg-muted/40 transition-colors cursor-pointer group">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-7 h-7 bg-primary/10 rounded-md flex items-center justify-center shrink-0">
                          <Building2 className="w-3.5 h-3.5 text-primary" />
                        </div>
                        <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors truncate">
                          {client.clientName}
                        </span>
                      </div>
                      <span className="text-sm text-muted-foreground truncate pr-4">
                        {client.clientContact ?? "–"}
                      </span>
                      <div>
                        {count > 0 ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600">
                            <span className="w-1.5 h-1.5 bg-red-500 rounded-full" />
                            {count} open
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground/50">–</span>
                        )}
                      </div>
                      <div>
                        <button
                          onClick={(e) => openAnalytics(e, client)}
                          className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded border transition-colors ${
                            client.analyticsToken
                              ? "bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100"
                              : "bg-muted/60 text-muted-foreground border-border hover:bg-muted"
                          }`}
                        >
                          <BarChart2 className="w-3 h-3" />
                          {client.analyticsToken ? "View" : "Setup"}
                          {client.analyticsToken && (
                            <span className="text-[9px] font-bold bg-indigo-600 text-white px-1.5 py-0.5 rounded-full leading-none">
                              Enabled
                            </span>
                          )}
                        </button>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors justify-self-end" />
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )
      ) : (
        <Card className="shadow-sm">
          <CardContent className="p-10 text-center">
            <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No clients yet. Create an invoice to get started.</p>
          </CardContent>
        </Card>
      )}

      {/* Analytics management sheet */}
      <Sheet
        open={analyticsSheet.open}
        onOpenChange={(v) => {
          setAnalyticsSheet(prev => ({ ...prev, open: v }));
          if (!v) setEmbedUrl("");
        }}
      >
        <SheetContent className="w-full sm:max-w-md flex flex-col">
          <SheetHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0">
            <SheetTitle className="flex items-center gap-2">
              <BarChart2 className="w-4 h-4" />
              Analytics — {sheetClient?.clientName}
            </SheetTitle>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            {hasAnalytics ? (
              <>
                <div className="rounded-lg border border-indigo-200 bg-indigo-50/50 p-4 space-y-3">
                  <p className="text-xs font-semibold text-indigo-700 uppercase tracking-wide">Analytics Active</p>
                  <p className="text-xs text-muted-foreground">Share the link below with your client to give them access to their analytics dashboard.</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs bg-background border border-border rounded px-2 py-1.5 text-muted-foreground truncate">
                      {`${window.location.origin}/analytics/${sheetClient?.analyticsToken}`}
                    </code>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 w-8 p-0 shrink-0"
                      title="Copy link"
                      onClick={() => copyAnalyticsLink(sheetClient!.analyticsToken!)}
                    >
                      <Link2 className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 w-8 p-0 shrink-0"
                      title="Open analytics page"
                      onClick={() => openAnalyticsLink(sheetClient!.analyticsToken!)}
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Update embed URL</Label>
                  <Input
                    placeholder="https://plausible.io/grodigital.co.za?embed=true&theme=light"
                    value={embedUrl}
                    onChange={e => setEmbedUrl(e.target.value)}
                  />
                  {embedUrlWarning(embedUrl) && (
                    <div className="flex items-start gap-1.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2.5 py-2">
                      <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                      {embedUrlWarning(embedUrl)}
                    </div>
                  )}
                  <p className="text-[11px] text-muted-foreground">
                    Paste the Plausible embed URL or the full embed code — either works.
                  </p>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Configure a Plausible analytics dashboard for <strong>{sheetClient?.clientName}</strong>. A unique shareable link will be generated.
                </p>
                <div className="space-y-1.5">
                  <Label className="text-xs">Plausible embed URL</Label>
                  <Input
                    placeholder="https://plausible.io/grodigital.co.za?embed=true&theme=light"
                    value={embedUrl}
                    onChange={e => setEmbedUrl(e.target.value)}
                    autoFocus
                  />
                  {embedUrlWarning(embedUrl) && (
                    <div className="flex items-start gap-1.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2.5 py-2">
                      <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                      {embedUrlWarning(embedUrl)}
                    </div>
                  )}
                  <p className="text-[11px] text-muted-foreground">
                    In Plausible, go to your site → Shared links → Create a shared link with embed enabled. Paste the embed URL or the full embed code — either works.
                  </p>
                </div>
              </>
            )}
          </div>

          <div className="shrink-0 px-6 py-4 border-t border-border flex items-center justify-between gap-2">
            {hasAnalytics && (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive gap-1.5 text-xs"
                onClick={() => {
                  if (sheetClient) clearAnalyticsMutation.mutate({ clientSlug: sheetClient.clientSlug });
                }}
                disabled={clearAnalyticsMutation.isPending}
              >
                <Trash2 className="w-3.5 h-3.5" />
                Remove
              </Button>
            )}
            <div className="flex gap-2 ml-auto">
              <Button variant="outline" size="sm" onClick={() => setAnalyticsSheet(prev => ({ ...prev, open: false }))}>
                {hasAnalytics && !embedUrl ? "Close" : "Cancel"}
              </Button>
              {(!hasAnalytics || embedUrl) && (
                <Button
                  size="sm"
                  disabled={!embedUrl.trim() || setAnalyticsMutation.isPending}
                  onClick={() => {
                    if (sheetClient && embedUrl.trim()) {
                      setAnalyticsMutation.mutate({ clientSlug: sheetClient.clientSlug, analyticsEmbed: embedUrl.trim() });
                    }
                  }}
                >
                  {setAnalyticsMutation.isPending ? "Saving…" : hasAnalytics ? "Update" : "Enable Analytics"}
                </Button>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
