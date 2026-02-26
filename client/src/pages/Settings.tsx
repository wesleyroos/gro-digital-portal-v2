import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { RefreshCw, ExternalLink } from "lucide-react";

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

export default function Settings() {
  const [location] = useLocation();

  const { data: googleStatus, isLoading, refetch } = trpc.google.status.useQuery();

  const disconnect = trpc.google.disconnect.useMutation({
    onSuccess: () => {
      refetch();
      toast.success("Google account disconnected");
    },
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("google") === "connected") {
      toast.success("Google account connected");
      window.history.replaceState({}, "", window.location.pathname);
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
          <div className="max-w-lg">
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
                <Button
                  onClick={() => {
                    window.location.href = "/api/auth/google/init";
                  }}
                >
                  Connect Google Account
                </Button>
              )}
            </div>
          </div>
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
