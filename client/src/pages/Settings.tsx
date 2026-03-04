import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { RefreshCw, ExternalLink, Instagram, Facebook } from "lucide-react";

// --- Railway Status types ---
type PageStatus = "OPERATIONAL" | "HASISSUES" | "UNDERMAINTENANCE" | "MAJOROUTAGE" | string;

type Incident = {
  id: string;
  name: string;
  started: string;
  status: string;
  impact: string;
  url: string;
  updatedAt: string;
};

type Maintenance = {
  id: string;
  name: string;
  start: string;
  status: string;
  duration: string;
  url: string;
  updatedAt: string;
};

type Summary = {
  page: { name: string; url: string; status: PageStatus };
  activeIncidents: Incident[];
  activeMaintenances: Maintenance[];
};

type Component = {
  id: string;
  name: string;
  status: string;
  description: string;
  isParent: boolean;
  children: Component[];
};

const STATUS_COLORS: Record<string, string> = {
  OPERATIONAL: "bg-emerald-50 text-emerald-700 border-emerald-200",
  DEGRADEDPERFORMANCE: "bg-amber-50 text-amber-700 border-amber-200",
  PARTIALOUTAGE: "bg-orange-50 text-orange-700 border-orange-200",
  MAJOROUTAGE: "bg-red-50 text-red-700 border-red-200",
  UNDERMAINTENANCE: "bg-blue-50 text-blue-700 border-blue-200",
  HASISSUES: "bg-amber-50 text-amber-700 border-amber-200",
  INVESTIGATING: "bg-amber-50 text-amber-700 border-amber-200",
  IDENTIFIED: "bg-orange-50 text-orange-700 border-orange-200",
  MONITORING: "bg-blue-50 text-blue-700 border-blue-200",
  RESOLVED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  NOTSTARTEDYET: "bg-gray-50 text-gray-600 border-gray-200",
  INPROGRESS: "bg-blue-50 text-blue-700 border-blue-200",
  COMPLETED: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

function statusLabel(s: string) {
  return s.replace(/([A-Z])/g, " $1").trim();
}

function statusBadge(status: string) {
  const cls = STATUS_COLORS[status] ?? "bg-gray-50 text-gray-600 border-gray-200";
  return (
    <Badge variant="outline" className={`text-[10px] px-2 py-0.5 font-medium ${cls}`}>
      {statusLabel(status)}
    </Badge>
  );
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("en-ZA", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function RailwayStatus() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [components, setComponents] = useState<Component[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);

  async function fetch_() {
    setLoading(true);
    try {
      const [sumRes, compRes] = await Promise.all([
        fetch("https://status.railway.com/summary.json"),
        fetch("https://status.railway.com/v2/components.json"),
      ]);
      const sumData = await sumRes.json();
      const compData = await compRes.json();
      setSummary(sumData);
      const compArray = Array.isArray(compData) ? compData : (compData?.components ?? []);
      setComponents(compArray);
      setLastFetched(new Date());
    } catch {
      toast.error("Failed to fetch Railway status");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetch_();
    const interval = setInterval(fetch_, 60_000);
    return () => clearInterval(interval);
  }, []);

  const pageStatus = summary?.page.status ?? "OPERATIONAL";
  const incidents = summary?.activeIncidents ?? [];
  const maintenances = summary?.activeMaintenances ?? [];
  const allGood = pageStatus === "OPERATIONAL" && incidents.length === 0;

  return (
    <div className="space-y-5">
      {/* Overall status */}
      <Card className="shadow-sm">
        <CardContent className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Overall Status</p>
              {loading && !summary ? (
                <div className="h-5 w-32 rounded bg-muted animate-pulse" />
              ) : (
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${allGood ? "bg-emerald-500" : "bg-amber-500"}`} />
                  {statusBadge(pageStatus)}
                  <a href="https://status.railway.com" target="_blank" rel="noopener noreferrer"
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
                    status.railway.com <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              {lastFetched && (
                <p className="text-[10px] text-muted-foreground">
                  Updated {lastFetched.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}
                </p>
              )}
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={fetch_} disabled={loading}>
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Active incidents */}
      {incidents.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Active Incidents</p>
          <div className="space-y-2">
            {incidents.map(inc => (
              <Card key={inc.id} className="shadow-sm border-amber-200">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <a href={inc.url} target="_blank" rel="noopener noreferrer"
                      className="font-medium text-sm hover:text-primary transition-colors flex items-center gap-1">
                      {inc.name} <ExternalLink className="w-3 h-3 shrink-0" />
                    </a>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {statusBadge(inc.impact)}
                      {statusBadge(inc.status)}
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Started {formatTime(inc.started)} · Updated {formatTime(inc.updatedAt)}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Active maintenances */}
      {maintenances.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Scheduled Maintenance</p>
          <div className="space-y-2">
            {maintenances.map(m => (
              <Card key={m.id} className="shadow-sm border-blue-200">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <a href={m.url} target="_blank" rel="noopener noreferrer"
                      className="font-medium text-sm hover:text-primary transition-colors flex items-center gap-1">
                      {m.name} <ExternalLink className="w-3 h-3 shrink-0" />
                    </a>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {statusBadge(m.status)}
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Starts {formatTime(m.start)} · Duration {m.duration} min
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Components */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Components</p>
        <Card className="shadow-sm">
          <CardContent className="p-0">
            {loading && components.length === 0 ? (
              <div className="p-6 space-y-3">
                {[1, 2, 3].map(i => <div key={i} className="h-4 rounded bg-muted animate-pulse" />)}
              </div>
            ) : (
              <table className="w-full">
                <tbody className="divide-y divide-border">
                  {components.map(c => (
                    <tr key={c.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-5 py-3 text-sm font-medium">{c.name}</td>
                      <td className="px-4 py-3 text-right">{statusBadge(c.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>

      {allGood && !loading && (
        <p className="text-sm text-emerald-600 font-medium text-center py-2">All Railway systems operational</p>
      )}
    </div>
  );
}

// --- Client connections matrix ---

function IgCell({ clientSlug, clientName }: { clientSlug: string; clientName: string }) {
  const { data, refetch } = trpc.instagram.getStatus.useQuery({ clientSlug });
  const disconnect = trpc.instagram.disconnect.useMutation({
    onSuccess: () => { refetch(); toast.success(`Instagram disconnected for ${clientName}`); },
    onError: () => toast.error("Failed to disconnect"),
  });
  const refreshUserId = trpc.instagram.refreshUserId.useMutation({
    onSuccess: ({ id, username }) => { refetch(); toast.success(`ID refreshed: ${id} (@${username})`); },
    onError: (e) => toast.error(`Refresh failed: ${e.message}`),
  });

  if (!data) return <div className="h-4 w-24 rounded bg-muted animate-pulse" />;

  if (data.connected) {
    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
          <span className="text-xs font-medium text-emerald-700">Connected</span>
        </div>
        {data.username && (
          <p className="text-[11px] text-muted-foreground">@{data.username}</p>
        )}
        <div className="flex gap-1.5 mt-0.5">
          <Button variant="outline" size="sm" className="h-6 text-[11px] px-2"
            onClick={() => refreshUserId.mutate({ clientSlug })} disabled={refreshUserId.isPending}>
            Fix ID
          </Button>
          <Button variant="outline" size="sm" className="h-6 text-[11px] px-2"
            onClick={() => disconnect.mutate({ clientSlug })} disabled={disconnect.isPending}>
            Disconnect
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Button size="sm" variant="outline" className="h-7 text-xs"
      onClick={() => { window.location.href = `/api/auth/instagram/init/${encodeURIComponent(clientSlug)}`; }}>
      Connect
    </Button>
  );
}

function FbCell({ clientSlug, clientName }: { clientSlug: string; clientName: string }) {
  const { data, refetch } = trpc.facebook.getStatus.useQuery({ clientSlug });
  const disconnect = trpc.facebook.disconnect.useMutation({
    onSuccess: () => { refetch(); toast.success(`Facebook disconnected for ${clientName}`); },
    onError: () => toast.error("Failed to disconnect"),
  });

  if (!data) return <div className="h-4 w-24 rounded bg-muted animate-pulse" />;

  if (data.connected) {
    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
          <span className="text-xs font-medium text-emerald-700">Connected</span>
        </div>
        {data.pageName && (
          <p className="text-[11px] text-muted-foreground">{data.pageName}</p>
        )}
        <div className="mt-0.5">
          <Button variant="outline" size="sm" className="h-6 text-[11px] px-2"
            onClick={() => disconnect.mutate({ clientSlug })} disabled={disconnect.isPending}>
            Disconnect
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Button size="sm" variant="outline" className="h-7 text-xs"
      onClick={() => { window.location.href = `/api/auth/facebook/init/${encodeURIComponent(clientSlug)}`; }}>
      Connect
    </Button>
  );
}

function ClientConnectionsMatrix() {
  const { data: clients } = trpc.invoice.clients.useQuery();

  if (!clients) {
    return (
      <div className="space-y-2 p-4">
        {[1, 2, 3].map(i => <div key={i} className="h-10 rounded bg-muted animate-pulse" />)}
      </div>
    );
  }

  if (clients.length === 0) {
    return <p className="text-sm text-muted-foreground p-4">No clients found.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground w-1/3">
              Client
            </th>
            <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground w-1/3">
              <div className="flex items-center gap-1.5">
                <Instagram className="w-3.5 h-3.5 text-pink-500" />
                Instagram
              </div>
            </th>
            <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground w-1/3">
              <div className="flex items-center gap-1.5">
                <Facebook className="w-3.5 h-3.5 text-blue-600" />
                Facebook
              </div>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {clients.map(client => (
            <tr key={client.clientSlug} className="hover:bg-muted/20 transition-colors">
              <td className="px-5 py-4">
                <p className="text-sm font-medium">{client.clientName}</p>
                <p className="text-[11px] text-muted-foreground">{client.clientSlug}</p>
              </td>
              <td className="px-5 py-4">
                <IgCell clientSlug={client.clientSlug} clientName={client.clientName} />
              </td>
              <td className="px-5 py-4">
                <FbCell clientSlug={client.clientSlug} clientName={client.clientName} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Settings() {
  const [location] = useLocation();

  const { data: googleStatus, isLoading, refetch } = trpc.google.status.useQuery();

  const disconnect = trpc.google.disconnect.useMutation({
    onSuccess: () => {
      refetch();
      toast.success("Google account disconnected");
    },
  });

  // Facebook multi-page selection state
  const [fbSelectState, setFbSelectState] = useState<string | null>(null);
  const [fbSelectClient, setFbSelectClient] = useState<string | null>(null);
  const { data: pendingPages } = trpc.facebook.getPendingPages.useQuery(
    { state: fbSelectState! },
    { enabled: !!fbSelectState }
  );
  const confirmPage = trpc.facebook.confirmPage.useMutation({
    onSuccess: () => {
      toast.success("Facebook Page connected");
      setFbSelectState(null);
      setFbSelectClient(null);
      window.history.replaceState({}, "", window.location.pathname);
    },
    onError: (e) => toast.error(`Failed to connect page: ${e.message}`),
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("google") === "connected") {
      toast.success("Google account connected");
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (params.get("instagram") === "error") {
      toast.error("Instagram connection failed");
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (params.get("facebook") === "connected") {
      toast.success("Facebook Page connected");
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (params.get("facebook") === "error") {
      toast.error("Facebook connection failed");
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (params.get("facebook") === "select") {
      const state = params.get("state");
      const client = params.get("client");
      if (state) { setFbSelectState(state); setFbSelectClient(client); }
    }
  }, [location]);

  return (
    <div>
      <h1 className="text-xl font-bold tracking-tight mb-6">Settings</h1>

      <Tabs defaultValue="integrations">
        <TabsList className="mb-6">
          <TabsTrigger value="integrations">Integrations</TabsTrigger>
          <TabsTrigger value="railway">Railway Status</TabsTrigger>
        </TabsList>

        <TabsContent value="integrations">
          <div className="space-y-6 max-w-3xl">
            {/* Google Account — personal integration, kept separate */}
            <div className="rounded-xl border bg-card p-6">
              <h2 className="text-base font-semibold mb-1">Google Account</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Connect your Google account to enable Calendar and Gmail integrations.
              </p>
              {isLoading ? (
                <div className="h-9 w-48 rounded-md bg-muted animate-pulse" />
              ) : googleStatus?.connected ? (
                <div className="flex items-center gap-3">
                  <Badge variant="default" className="bg-green-500 hover:bg-green-500 text-white">
                    Connected
                  </Badge>
                  <span className="text-sm text-muted-foreground">{googleStatus.email}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => disconnect.mutate()}
                    disabled={disconnect.isPending}
                  >
                    Disconnect
                  </Button>
                </div>
              ) : (
                <Button onClick={() => { window.location.href = "/api/auth/google/init"; }}>
                  Connect Google Account
                </Button>
              )}
            </div>

            {/* Client social media connections matrix */}
            <div className="rounded-xl border bg-card overflow-hidden">
              <div className="px-6 py-4 border-b border-border">
                <h2 className="text-base font-semibold mb-0.5">Social Media Connections</h2>
                <p className="text-sm text-muted-foreground">
                  Connect each client's social accounts to enable campaign auto-posting.
                </p>
              </div>
              <ClientConnectionsMatrix />
            </div>
          </div>

          {/* Facebook multi-page selection dialog */}
          {fbSelectState && pendingPages && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
              <div className="bg-card rounded-xl border shadow-xl p-6 w-full max-w-sm">
                <h3 className="text-base font-semibold mb-1">Select a Facebook Page</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Multiple pages found for {fbSelectClient ?? "this client"}. Choose one:
                </p>
                <div className="space-y-2">
                  {pendingPages.pages.map(page => (
                    <Button
                      key={page.id}
                      variant="outline"
                      className="w-full justify-start"
                      onClick={() => confirmPage.mutate({ state: fbSelectState, pageId: page.id })}
                      disabled={confirmPage.isPending}
                    >
                      {page.name}
                    </Button>
                  ))}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-3 w-full"
                  onClick={() => { setFbSelectState(null); setFbSelectClient(null); window.history.replaceState({}, "", window.location.pathname); }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="railway">
          <div className="max-w-2xl">
            <RailwayStatus />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
