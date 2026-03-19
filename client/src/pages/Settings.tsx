import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { RefreshCw, ExternalLink, Instagram, Facebook, Copy } from "lucide-react";

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

function LiCell({ clientSlug, clientName }: { clientSlug: string; clientName: string }) {
  const { data, refetch } = trpc.linkedin.getStatus.useQuery({ clientSlug });
  const disconnect = trpc.linkedin.disconnect.useMutation({
    onSuccess: () => { refetch(); toast.success(`LinkedIn disconnected for ${clientName}`); },
    onError: () => toast.error("Failed to disconnect"),
  });
  const setTarget = trpc.linkedin.setPostTarget.useMutation({
    onSuccess: () => { refetch(); toast.success("Post target updated"); },
    onError: () => toast.error("Failed to update target"),
  });

  if (!data) return <div className="h-4 w-24 rounded bg-muted animate-pulse" />;

  if (data.connected) {
    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
          <span className="text-xs font-medium text-emerald-700">Connected</span>
        </div>
        {data.orgName && (
          <select
            className="text-[11px] rounded border border-input bg-background px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-[#0a66c2]"
            value={data.postTarget}
            onChange={e => setTarget.mutate({ clientSlug, target: e.target.value as 'personal' | 'organization' })}
            disabled={setTarget.isPending}
          >
            <option value="personal">Personal profile</option>
            <option value="organization">{data.orgName}</option>
          </select>
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
      onClick={() => { window.location.href = `/api/auth/linkedin/init/${encodeURIComponent(clientSlug)}`; }}>
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
            <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground w-1/4">
              Client
            </th>
            <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground w-1/4">
              <div className="flex items-center gap-1.5">
                <Instagram className="w-3.5 h-3.5 text-pink-500" />
                Instagram
              </div>
            </th>
            <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground w-1/4">
              <div className="flex items-center gap-1.5">
                <Facebook className="w-3.5 h-3.5 text-blue-600" />
                Facebook
              </div>
            </th>
            <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground w-1/4">
              <div className="flex items-center gap-1.5">
                <span className="w-3.5 h-3.5 rounded-sm font-bold text-[#0a66c2] text-[11px] flex items-center justify-center">in</span>
                LinkedIn
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
              <td className="px-5 py-4">
                <LiCell clientSlug={client.clientSlug} clientName={client.clientName} />
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
    if (params.get("linkedin") === "connected") {
      toast.success("LinkedIn connected");
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (params.get("linkedin") === "error") {
      toast.error("LinkedIn connection failed");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [location]);

  return (
    <div>
      <h1 className="text-xl font-bold tracking-tight mb-6">Settings</h1>

      <Tabs defaultValue="integrations">
        <TabsList className="mb-6">
          <TabsTrigger value="integrations">Integrations</TabsTrigger>
          <TabsTrigger value="ai">AI</TabsTrigger>
          <TabsTrigger value="railway">Railway Status</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
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

        <TabsContent value="ai">
          <div className="space-y-6 max-w-3xl">
            <AiModelCard />
          </div>
        </TabsContent>

        <TabsContent value="railway">
          <div className="max-w-2xl">
            <RailwayStatus />
          </div>
        </TabsContent>

        <TabsContent value="logs">
          <LogsViewer />
        </TabsContent>
      </Tabs>
    </div>
  );
}

const AI_MODELS = [
  { value: "claude-opus-4-6", label: "Claude Opus 4.6", description: "Most capable — best for complex campaigns" },
  { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", description: "Balanced — recommended for most tasks" },
  { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5", description: "Fastest — lower cost, great for simple content" },
];

function AiModelCard() {
  const { data, isLoading } = trpc.settings.getAiModel.useQuery();
  const setModel = trpc.settings.setAiModel.useMutation({
    onSuccess: (res) => toast.success(`AI model updated to ${AI_MODELS.find(m => m.value === res.model)?.label ?? res.model}`),
    onError: () => toast.error("Failed to update AI model"),
  });

  return (
    <div className="rounded-xl border bg-card p-6">
      <h2 className="text-base font-semibold mb-1">Campaign AI Model</h2>
      <p className="text-sm text-muted-foreground mb-4">
        Choose which Claude model powers campaign content generation — subject lines, email HTML, and image prompts.
      </p>
      {isLoading ? (
        <div className="h-9 w-64 rounded-md bg-muted animate-pulse" />
      ) : (
        <div className="flex items-center gap-3">
          <Select
            value={data?.model ?? "claude-sonnet-4-6"}
            onValueChange={(val) => setModel.mutate({ model: val as "claude-opus-4-6" | "claude-sonnet-4-6" | "claude-haiku-4-5-20251001" })}
            disabled={setModel.isPending}
          >
            <SelectTrigger className="w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AI_MODELS.map(m => (
                <SelectItem key={m.value} value={m.value}>
                  <div>
                    <span className="font-medium">{m.label}</span>
                    <span className="text-muted-foreground text-xs ml-2">{m.description}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}

// ── Log level styles ──
const LEVEL_STYLES: Record<string, { text: string; row: string }> = {
  error: { text: "text-red-400",   row: "bg-red-950/20" },
  warn:  { text: "text-amber-400", row: "bg-amber-950/10" },
  info:  { text: "text-blue-400",  row: "" },
  log:   { text: "text-zinc-400",  row: "" },
};

function LogsViewer() {
  const [since, setSince] = useState<number>(0);
  const [entries, setEntries] = useState<{ ts: number; level: string; msg: string }[]>([]);
  const [filter, setFilter] = useState<"all" | "error" | "warn">("all");
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastTsRef = useRef<number>(0);
  const loadedRef = useRef(false);

  const { data, refetch } = trpc.system.getLogs.useQuery(
    { since },
    { refetchInterval: 3000 }
  );

  useEffect(() => {
    if (!data) return;
    if (data.length === 0) return;
    setEntries(prev => {
      if (!loadedRef.current) {
        loadedRef.current = true;
        return data;
      }
      const newEntries = data.filter(e => e.ts > lastTsRef.current);
      if (newEntries.length === 0) return prev;
      return [...prev, ...newEntries].slice(-600);
    });
    const maxTs = Math.max(...data.map(e => e.ts));
    if (maxTs > lastTsRef.current) {
      lastTsRef.current = maxTs;
      setSince(maxTs);
    }
  }, [data]);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries, autoScroll]);

  const visible = filter === "all" ? entries : entries.filter(e => e.level === filter);

  function fmt(ts: number) {
    return new Date(ts).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  }

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-muted/30">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs font-medium text-muted-foreground">Live · {entries.length} entries</span>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-1">
          {(["all", "warn", "error"] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`h-6 px-2.5 rounded text-[11px] font-medium transition-colors ${
                filter === f ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {f === "all" ? "All" : f === "warn" ? "Warn" : "Error"}
            </button>
          ))}
        </div>
        <button
          onClick={() => setAutoScroll(v => !v)}
          className={`h-6 px-2.5 rounded text-[11px] font-medium transition-colors ${
            autoScroll ? "bg-violet-100 text-violet-700" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Auto-scroll {autoScroll ? "on" : "off"}
        </button>
        <Button
          variant="ghost" size="sm" className="h-6 w-6 p-0" title="Copy logs"
          onClick={() => {
            const text = visible.map(e => `[${new Date(e.ts).toISOString()}] [${e.level.toUpperCase()}] ${e.msg}`).join("\n");
            navigator.clipboard.writeText(text);
          }}
        >
          <Copy className="w-3 h-3" />
        </Button>
        <Button
          variant="ghost" size="sm" className="h-6 w-6 p-0" title="Refresh"
          onClick={() => { setEntries([]); lastTsRef.current = 0; loadedRef.current = false; setSince(0); refetch(); }}
        >
          <RefreshCw className="w-3 h-3" />
        </Button>
      </div>

      <div
        ref={scrollRef}
        onScroll={e => {
          const el = e.currentTarget;
          setAutoScroll(el.scrollHeight - el.scrollTop - el.clientHeight < 40);
        }}
        className="h-[calc(100vh-260px)] min-h-64 overflow-y-auto font-mono text-[11px] leading-5 bg-zinc-950"
      >
        {visible.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-zinc-500 text-xs">
            No log entries yet.
          </div>
        ) : (
          visible.map((entry, i) => {
            const s = LEVEL_STYLES[entry.level] ?? LEVEL_STYLES.log;
            return (
              <div key={i} className={`flex gap-3 px-4 py-0.5 hover:bg-white/5 ${s.row}`}>
                <span className="shrink-0 text-zinc-500 tabular-nums select-none">{fmt(entry.ts)}</span>
                <span className={`shrink-0 w-10 ${s.text} uppercase select-none`}>{entry.level}</span>
                <span className="text-zinc-200 whitespace-pre-wrap break-all">{entry.msg}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
