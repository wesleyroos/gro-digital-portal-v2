import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { GitCommit, FolderOpen, Clock, GitBranch, Activity } from "lucide-react";

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
  const { data: projects = [], isLoading } = trpc.projects.list.useQuery(undefined, {
    refetchInterval: 30_000,
  });

  const active = projects.filter(p => p.status === "active");
  const paused = projects.filter(p => p.status === "paused");
  const done = projects.filter(p => p.status === "done");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Projects</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Active builds — auto-updated on every git commit
        </p>
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
              Projects appear here automatically when you commit from any repo with the GD git hook installed.
            </p>
            <div className="mt-4 text-left inline-block bg-muted rounded-lg px-4 py-3 text-xs font-mono text-muted-foreground">
              Run: <span className="text-foreground">gd-hook-install</span> in any project folder
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {projects.map(project => (
            <Card key={project.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${statusDot(project.status)}`} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-sm">{project.name}</p>
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${statusColor(project.status)}`}>
                          {project.status}
                        </Badge>
                      </div>
                      {project.currentFocus && (
                        <p className="text-sm text-muted-foreground mt-0.5 truncate">
                          {project.currentFocus}
                        </p>
                      )}
                      {project.lastCommitMessage && (
                        <div className="flex items-center gap-1.5 mt-2">
                          <GitCommit className="h-3 w-3 text-muted-foreground shrink-0" />
                          <p className="text-xs text-muted-foreground truncate">{project.lastCommitMessage}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1.5 shrink-0 text-right">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      <span>{timeAgo(project.updatedAt)}</span>
                    </div>
                    {project.branch && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <GitBranch className="h-3 w-3" />
                        <span>{project.branch}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Activity className="h-3 w-3" />
                      <span>{project.commitCount} commits</span>
                    </div>
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-border/50 flex items-center gap-1.5 text-xs text-muted-foreground/60">
                  <FolderOpen className="h-3 w-3" />
                  <span className="font-mono truncate">{project.repoPath}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
