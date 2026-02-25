import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Building2, ArrowRight, FileText, Plus, LayoutGrid, List } from "lucide-react";
import { useState } from "react";

type ViewMode = "card" | "list";

export default function Clients() {
  const { data: clients, isLoading } = trpc.invoice.clients.useQuery(undefined, { retry: false });
  const { data: tasks = [] } = trpc.task.list.useQuery(undefined, { retry: false });
  const [view, setView] = useState<ViewMode>(() =>
    (localStorage.getItem("clients-view") as ViewMode) ?? "card"
  );

  const openTaskSlugs = new Set(
    tasks.filter(t => t.status !== 'done' && t.clientSlug).map(t => t.clientSlug!)
  );

  const openTaskCount = tasks
    .filter(t => t.status !== 'done' && t.clientSlug)
    .reduce<Record<string, number>>((acc, t) => {
      acc[t.clientSlug!] = (acc[t.clientSlug!] ?? 0) + 1;
      return acc;
    }, {});

  function setViewMode(v: ViewMode) {
    setView(v);
    localStorage.setItem("clients-view", v);
  }

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
                      <p className="text-xs text-muted-foreground">{client.clientContact}</p>
                    )}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          /* List view */
          <div className="rounded-lg border border-border overflow-hidden shadow-sm">
            {/* Header */}
            <div className="grid grid-cols-[2fr_2fr_120px_32px] bg-muted/50 border-b border-border px-4 py-2.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Client</span>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Contact</span>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Open Tasks</span>
              <span />
            </div>
            {/* Rows */}
            <div className="divide-y divide-border bg-background">
              {clients.map((client) => {
                const count = openTaskCount[client.clientSlug] ?? 0;
                return (
                  <Link key={client.clientSlug} href={`/client/${client.clientSlug}`}>
                    <div className="grid grid-cols-[2fr_2fr_120px_32px] items-center px-4 py-3 hover:bg-muted/40 transition-colors cursor-pointer group">
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
    </div>
  );
}
