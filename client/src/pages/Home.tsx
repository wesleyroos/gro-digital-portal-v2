import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertCircle, CheckCircle2, Repeat, CalendarDays, Wrench,
  Building2, Target, Plus, ArrowUpRight, Pencil, Check, X,
} from "lucide-react";
import { Input } from "@/components/ui/input";

function fmt(n: number) {
  return `R${n.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtShort(n: number) {
  return `R${n.toLocaleString("en-ZA", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export default function Home() {
  const { data: me } = trpc.auth.me.useQuery();
  const isLoggedIn = !!me;

  const { data: clients } = trpc.invoice.clients.useQuery(undefined, { enabled: isLoggedIn, retry: false });
  const { data: metrics } = trpc.invoice.metrics.useQuery(undefined, { enabled: isLoggedIn, retry: false });
  const { data: tasks = [] } = trpc.task.list.useQuery(undefined, { enabled: isLoggedIn, retry: false, refetchInterval: 15000 });
  const { data: leads = [] } = trpc.lead.list.useQuery(undefined, { enabled: isLoggedIn, retry: false });

  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const [editTaskText, setEditTaskText] = useState("");

  const utils = trpc.useUtils();
  const setTaskDone = trpc.task.setDone.useMutation({ onSuccess: () => utils.task.list.invalidate() });
  const updateTask = trpc.task.update.useMutation({ onSuccess: () => { utils.task.list.invalidate(); setEditingTaskId(null); } });

  function startEditTask(task: { id: number; text: string }) {
    setEditingTaskId(task.id);
    setEditTaskText(task.text);
  }

  function saveEditTask(task: { id: number; clientSlug?: string | null; clientName?: string | null }) {
    const text = editTaskText.trim();
    if (!text) return;
    updateTask.mutate({ id: task.id, text, clientSlug: task.clientSlug, clientName: task.clientName });
  }

  const openTasks = tasks.filter(t => !t.done);
  const pipelineMonthly = leads.reduce((sum, l) => sum + (l.monthlyValue ? parseFloat(l.monthlyValue) : 0), 0);
  const pipelineOnceOff = leads.reduce((sum, l) => sum + (l.onceOffValue ? parseFloat(l.onceOffValue) : 0), 0);

  return (
    <div className="space-y-6">

      {/* ── Top stat row ── */}
      {metrics && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <Card className="shadow-sm border-blue-200/80 bg-gradient-to-br from-blue-50 to-white">
            <CardContent className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <Repeat className="w-3.5 h-3.5 text-blue-500" />
                <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-500">ARR</p>
              </div>
              <p className="text-3xl font-bold font-mono text-foreground tracking-tight">{fmt(metrics.arr)}</p>
              <p className="text-xs text-muted-foreground mt-1.5">annualised recurring revenue</p>
            </CardContent>
          </Card>
          <Card className="shadow-sm">
            <CardContent className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <Repeat className="w-3.5 h-3.5 text-muted-foreground" />
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">MRR</p>
              </div>
              <p className="text-3xl font-bold font-mono text-foreground tracking-tight">{fmt(metrics.mrr)}</p>
              <p className="text-xs text-muted-foreground mt-1.5">monthly subscriptions</p>
            </CardContent>
          </Card>
          <Card className="shadow-sm">
            <CardContent className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <CalendarDays className="w-3.5 h-3.5 text-muted-foreground" />
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Annual</p>
              </div>
              <p className="text-3xl font-bold font-mono text-foreground tracking-tight">{fmt(metrics.annualRecurring)}</p>
              <p className="text-xs text-muted-foreground mt-1.5">annual subscriptions</p>
            </CardContent>
          </Card>
          <Card className="shadow-sm border-emerald-200/80 bg-gradient-to-br from-emerald-50 to-white">
            <CardContent className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <Wrench className="w-3.5 h-3.5 text-emerald-600" />
                <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600">Project Fees</p>
              </div>
              <p className="text-3xl font-bold font-mono text-foreground tracking-tight">{fmt(metrics.projectsCollected + metrics.projectsOutstanding)}</p>
              <p className="text-xs text-muted-foreground mt-1.5">Apr {metrics.fyStartYear} – Mar {metrics.fyStartYear + 1}</p>
            </CardContent>
          </Card>
          <Card className={`shadow-sm ${metrics.projectsOutstanding > 0 ? 'border-amber-200/80 bg-gradient-to-br from-amber-50 to-white' : ''}`}>
            <CardContent className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <AlertCircle className={`w-3.5 h-3.5 ${metrics.projectsOutstanding > 0 ? 'text-amber-500' : 'text-muted-foreground'}`} />
                <p className={`text-[10px] font-semibold uppercase tracking-wider ${metrics.projectsOutstanding > 0 ? 'text-amber-500' : 'text-muted-foreground'}`}>Outstanding</p>
              </div>
              <p className={`text-3xl font-bold font-mono tracking-tight ${metrics.projectsOutstanding > 0 ? 'text-amber-600' : 'text-foreground'}`}>{fmt(metrics.projectsOutstanding)}</p>
              <p className="text-xs text-muted-foreground mt-1.5">{metrics.projectsOutstanding > 0 ? 'awaiting payment' : 'all invoices paid'}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Two-column body ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-6 items-start">

        {/* ── Left column ── */}
        <div className="space-y-4">
          {metrics && (
            <>
              {/* Recurring by client */}
              {metrics.recurringClients.length > 0 && (
                <Card className="shadow-sm">
                  <CardContent className="p-0">
                    <div className="px-6 py-4 border-b border-border flex items-center gap-2">
                      <Repeat className="w-3.5 h-3.5 text-blue-500" />
                      <h3 className="text-xs font-semibold uppercase tracking-widest text-blue-600">Recurring by Client</h3>
                    </div>
                    <div className="divide-y divide-border">
                      {metrics.recurringClients.map((client) => {
                        const mrrEquiv = client.mrr + client.annual / 12;
                        const totalMrrEquiv = metrics.mrr + metrics.annualRecurring / 12;
                        const share = totalMrrEquiv > 0 ? (mrrEquiv / totalMrrEquiv) * 100 : 0;
                        return (
                          <div key={client.clientSlug} className="px-6 py-3.5 hover:bg-muted/30 transition-colors group">
                            <div className="flex items-center justify-between mb-2">
                              <Link href={`/client/${client.clientSlug}`}>
                                <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors cursor-pointer">
                                  {client.clientName}
                                </span>
                              </Link>
                              <div className="flex items-center gap-4 text-xs tabular-nums">
                                {client.mrr > 0 && (
                                  <span className="font-mono text-foreground font-medium">
                                    {fmt(client.mrr)}<span className="text-muted-foreground font-normal">/mo</span>
                                  </span>
                                )}
                                {client.annual > 0 && (
                                  <span className="font-mono text-muted-foreground">
                                    {fmt(client.annual)}<span>/yr</span>
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="h-1 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-blue-400 rounded-full transition-all duration-700"
                                style={{ width: `${share}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Project Revenue */}
              <Card className="shadow-sm">
                <CardContent className="p-0">
                  <div className="px-6 py-4 border-b border-border flex items-center gap-2">
                    <Wrench className="w-3.5 h-3.5 text-emerald-600" />
                    <h3 className="text-xs font-semibold uppercase tracking-widest text-emerald-600">Project Revenue</h3>
                  </div>
                  <div className="p-6">
                    <div className="flex items-start justify-between mb-6">
                      <div>
                        <div className="flex items-center gap-1.5 mb-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600">Collected</p>
                        </div>
                        <p className="text-2xl font-bold font-mono tracking-tight">{fmt(metrics.projectsCollected)}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Apr {metrics.fyStartYear} – Mar {metrics.fyStartYear + 1}</p>
                      </div>
                      {metrics.projectsOutstanding > 0 && (
                        <div className="text-right">
                          <div className="flex items-center gap-1.5 justify-end mb-1">
                            <AlertCircle className="w-3 h-3 text-amber-500" />
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-500">Outstanding</p>
                          </div>
                          <p className="text-2xl font-bold font-mono tracking-tight">{fmt(metrics.projectsOutstanding)}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">awaiting payment</p>
                        </div>
                      )}
                    </div>

                    {/* Bar chart */}
                    {(() => {
                      const maxTotal = Math.max(...metrics.monthlyProjectRevenue.map(m => m.total), 1);
                      return (
                        <div className="flex items-end gap-1" style={{ height: '80px' }}>
                          {metrics.monthlyProjectRevenue.map((month) => {
                            const heightPct = month.total > 0 ? Math.max((month.total / maxTotal) * 100, 5) : 0;
                            return (
                              <div key={month.yearMonth} className="group/bar relative flex-1 flex flex-col items-center gap-1.5" style={{ height: '80px' }}>
                                {month.total > 0 && (
                                  <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-popover border border-border shadow-lg rounded-lg p-2.5 opacity-0 group-hover/bar:opacity-100 transition-opacity pointer-events-none z-10 min-w-[140px]">
                                    {month.invoices.map((inv) => (
                                      <div key={inv.invoiceNumber} className="flex items-center justify-between gap-4 mb-1 last:mb-0">
                                        <span className="text-[10px] text-muted-foreground truncate max-w-[90px]">{inv.clientName}</span>
                                        <span className="text-[10px] font-mono font-semibold text-foreground whitespace-nowrap">{fmt(inv.amount)}</span>
                                      </div>
                                    ))}
                                    {month.invoices.length > 1 && (
                                      <div className="flex items-center justify-between gap-4 mt-1.5 pt-1.5 border-t border-border">
                                        <span className="text-[10px] font-semibold">Total</span>
                                        <span className="text-[10px] font-mono font-semibold">{fmt(month.total)}</span>
                                      </div>
                                    )}
                                  </div>
                                )}
                                <div className="w-full flex items-end" style={{ height: '60px' }}>
                                  {month.total > 0 ? (
                                    <div
                                      className={`w-full rounded-t transition-colors cursor-default ${month.isCurrent ? 'bg-emerald-500' : 'bg-emerald-200 group-hover/bar:bg-emerald-400'}`}
                                      style={{ height: `${heightPct}%` }}
                                    />
                                  ) : (
                                    <div className={`w-full border-t ${month.isFuture ? 'border-muted/20' : 'border-muted'}`} />
                                  )}
                                </div>
                                <span className={`text-[9px] leading-none ${month.isFuture ? 'text-muted-foreground/30' : month.isCurrent ? 'text-foreground font-semibold' : 'text-muted-foreground'}`}>
                                  {month.label}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}

                    {/* Outstanding invoices */}
                    {metrics.outstandingInvoices.length > 0 && (
                      <div className="mt-6 pt-5 border-t border-border space-y-1">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Outstanding</p>
                        {metrics.outstandingInvoices.map((inv) => (
                          <Link key={inv.invoiceNumber} href={`/client/${inv.clientSlug}/invoice/${inv.invoiceNumber}`}>
                            <div className="flex items-center justify-between py-2 px-3 -mx-3 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer group">
                              <div className="flex items-center gap-3">
                                <span className="text-xs font-mono text-muted-foreground">{inv.invoiceNumber}</span>
                                <span className="text-sm font-medium">{inv.clientName}</span>
                                {inv.status === "overdue" && (
                                  <span className="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium">Overdue</span>
                                )}
                              </div>
                              <span className="text-sm font-mono font-semibold text-amber-600 group-hover:text-primary transition-colors">
                                {fmt(inv.amountDue)}
                              </span>
                            </div>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>

        {/* ── Right column ── */}
        <div className="flex flex-col gap-4">

          {/* Tasks */}
          <Card className="shadow-sm overflow-hidden">
            <CardContent className="p-0">
              <div className={`px-5 py-4 border-b flex items-center justify-between ${openTasks.length > 0 ? 'bg-amber-50 border-amber-100' : 'bg-muted/30 border-border'}`}>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tasks</span>
                </div>
                {openTasks.length > 0 && (
                  <span className="text-[10px] font-semibold bg-red-500 text-white px-1.5 py-0.5 rounded-full leading-none">
                    {openTasks.length}
                  </span>
                )}
              </div>
              <div className="px-5 py-4">
                {openTasks.length === 0 ? (
                  <p className="text-xs text-muted-foreground">All clear ✓</p>
                ) : (
                  <div className="space-y-3">
                    {openTasks.slice(0, 4).map((task) => (
                      <div key={task.id} className="flex items-start gap-2.5 group">
                        <button
                          onClick={() => setTaskDone.mutate({ id: task.id, done: true })}
                          className="w-3.5 h-3.5 rounded border border-muted-foreground/40 hover:border-primary hover:bg-primary/10 transition-colors mt-0.5 shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          {editingTaskId === task.id ? (
                            <div className="flex items-center gap-1">
                              <Input
                                autoFocus
                                className="h-6 text-xs py-0 px-1.5"
                                value={editTaskText}
                                onChange={e => setEditTaskText(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === "Enter") saveEditTask(task);
                                  if (e.key === "Escape") setEditingTaskId(null);
                                }}
                              />
                              <button onClick={() => saveEditTask(task)} className="text-emerald-600 hover:text-emerald-700 shrink-0">
                                <Check className="w-3 h-3" />
                              </button>
                              <button onClick={() => setEditingTaskId(null)} className="text-muted-foreground hover:text-foreground shrink-0">
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <p className="text-xs text-foreground leading-snug">{task.text}</p>
                          )}
                          {task.clientName && editingTaskId !== task.id && (
                            <p className="text-[10px] text-muted-foreground mt-0.5">{task.clientName}</p>
                          )}
                        </div>
                        {editingTaskId !== task.id && (
                          <button
                            className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground mt-0.5"
                            onClick={() => startEditTask(task)}
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    ))}
                    {openTasks.length > 4 && (
                      <p className="text-[10px] text-muted-foreground pl-6">+{openTasks.length - 4} more</p>
                    )}
                  </div>
                )}
                <div className="mt-4 pt-4 border-t border-border">
                  <Link href="/invoice/new">
                    <button className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                      <Plus className="w-3.5 h-3.5" />
                      New Invoice
                    </button>
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Leads */}
          <Link href="/leads">
            <Card className="shadow-sm hover:shadow-md transition-all cursor-pointer group overflow-hidden">
              <CardContent className="p-0">
                <div className="bg-violet-50 border-b border-violet-100 px-5 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Target className="w-4 h-4 text-violet-600" />
                    <span className="text-xs font-semibold uppercase tracking-wider text-violet-600">Leads</span>
                  </div>
                  <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-violet-600 transition-colors" />
                </div>
                <div className="px-5 py-4">
                  <p className="text-3xl font-bold font-mono tracking-tight text-foreground">{leads.length}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {leads.length === 0 ? "no leads yet" : "in pipeline"}
                  </p>
                  {(pipelineMonthly > 0 || pipelineOnceOff > 0) && (
                    <div className="mt-3 pt-3 border-t border-border space-y-1">
                      {pipelineMonthly > 0 && (
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-sm font-mono font-semibold text-violet-600">{fmtShort(pipelineMonthly)}</span>
                          <span className="text-[10px] text-muted-foreground">/mo recurring</span>
                        </div>
                      )}
                      {pipelineOnceOff > 0 && (
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-sm font-mono font-semibold text-foreground">{fmtShort(pipelineOnceOff)}</span>
                          <span className="text-[10px] text-muted-foreground">once-off</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </Link>

          {/* Clients */}
          <Link href="/clients">
            <Card className="shadow-sm hover:shadow-md transition-all cursor-pointer group overflow-hidden">
              <CardContent className="p-0">
                <div className="bg-primary/5 border-b border-primary/10 px-5 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-primary" />
                    <span className="text-xs font-semibold uppercase tracking-wider text-primary">Clients</span>
                  </div>
                  <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
                <div className="px-5 py-4">
                  <p className="text-3xl font-bold font-mono tracking-tight text-foreground">
                    {clients == null ? "–" : clients.length}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">active clients</p>
                </div>
              </CardContent>
            </Card>
          </Link>

        </div>
      </div>
    </div>
  );
}
