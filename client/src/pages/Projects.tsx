import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { GitCommit, Clock, GitBranch, Activity, RefreshCw, Loader2 } from "lucide-react";
import { toast } from "sonner";

function timeAgo(date: string | Date | null) {
  if (!date) return "Never";
  const diff = Date.now() - new Date(date).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function statusColor(status: string) {
  if (status === "active") return "bg-emerald-500/15 text-emerald-700 border-emerald-200";
  if (status === "paused") return "bg-amber-500/15 text-amber-700 border-amber-200";
  return "bg-slate-100 text-slate-500 border-slate-200";
}

function statusDot(status: string) {
  if (status === "active") return "bg-emerald-500";
  if (status === "paused") return "bg-amber-400";
  return "bg-slate-400";
}

export default function Projects() {
  const { data: projects = [], isLoading, refetch } = trpc.projects.list.useQuery(undefined, {
    refetchInterval: 5_000,
  });

  const syncFromGitHub = trpc.projects.syncFromGitHub.useMutation({
    onSuccess: (data) => {
      toast.success(`Synced ${data.synced} repo${data.synced === 1 ? "" : "s"} from GitHub${data.skipped ? ` (${data.skipped} archived skipped)` : ""}`);
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const active = projects.filter(p => p.status === "active");
  const paused = projects.filter(p => p.status === "paused");
  const done = projects.filter(p => p.status === "done");

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Projects</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Synced from GitHub and updated by local git commits
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => syncFromGitHub.mutate()}
          disabled={syncFromGitHub.isPending}
        >
          {syncFromGitHub.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          Sync from GitHub
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Active", value: active.length, color: "text-emerald-600" },
          { label: "Paused", value: paused.length, color: "text-amber-600" },
          { label: "Done", value: done.length, color: "text-slate-500" },
        ].map(stat => (
          <Card key={stat.label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{stat.label}</p>
              <p className={`text-2xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Project list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-24 rounded-lg bg-muted/40 animate-pulse" />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center">
            <GitCommit className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
            <p className="font-medium">No projects yet</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
              Click <strong>Sync from GitHub</strong> to pull in all your repos, or commit locally with the git hook to register a new one.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
          {projects.map(project => (
            <Card key={project.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDot(project.status)}`} />
                    <p className="font-semibold text-sm truncate">{project.name}</p>
                  </div>
                  <Badge variant="outline" className={`text-[10px] px-1.5 py-0 shrink-0 ${statusColor(project.status)}`}>
                    {project.status}
                  </Badge>
                </div>

                {project.lastCommitMessage && (
                  <div className="flex items-start gap-1.5 mb-3">
                    <GitCommit className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
                    <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{project.lastCommitMessage}</p>
                  </div>
                )}

                <div className="flex flex-col gap-1 pt-2 border-t border-border/50">
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <GitBranch className="h-3 w-3" />
                      <span>{project.branch ?? "—"}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Activity className="h-3 w-3" />
                      <span>{project.commitCount}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-[11px] text-muted-foreground/60">
                    <Clock className="h-3 w-3" />
                    <span>{timeAgo(project.lastCommitAt ?? project.updatedAt)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
