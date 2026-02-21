import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckSquare, Square, Trash2, Plus, BellDot, Bell, Pencil, Check, X } from "lucide-react";
import { Link } from "wouter";

export default function TaskTray() {
  const utils = trpc.useUtils();
  const { data: tasks = [] } = trpc.task.list.useQuery();
  const { data: clients = [] } = trpc.invoice.clients.useQuery();
  const [open, setOpen] = useState(false);
  const [newText, setNewText] = useState("");
  const [selectedClientSlug, setSelectedClientSlug] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const openCount = tasks.filter(t => !t.done).length;

  const createTask = trpc.task.create.useMutation({
    onSuccess: () => {
      utils.task.list.invalidate();
      setNewText("");
      setSelectedClientSlug("");
      inputRef.current?.focus();
    },
  });

  const updateTask = trpc.task.update.useMutation({
    onSuccess: () => {
      utils.task.list.invalidate();
      setEditingId(null);
    },
  });

  const setDone = trpc.task.setDone.useMutation({
    onSuccess: () => utils.task.list.invalidate(),
  });

  const deleteTask = trpc.task.delete.useMutation({
    onSuccess: () => utils.task.list.invalidate(),
  });

  function handleAdd() {
    const text = newText.trim();
    if (!text) return;
    const client = clients.find(c => c.clientSlug === selectedClientSlug);
    createTask.mutate({
      text,
      clientSlug: client?.clientSlug ?? null,
      clientName: client?.clientName ?? null,
    });
  }

  function startEdit(task: { id: number; text: string }) {
    setEditingId(task.id);
    setEditText(task.text);
  }

  function saveEdit(task: { id: number; clientSlug?: string | null; clientName?: string | null }) {
    const text = editText.trim();
    if (!text) return;
    updateTask.mutate({ id: task.id, text, clientSlug: task.clientSlug, clientName: task.clientName });
  }

  const open_tasks = tasks.filter(t => !t.done);
  const done_tasks = tasks.filter(t => t.done);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="relative h-8 w-8 p-0">
          {openCount > 0 ? (
            <BellDot className="w-4 h-4 text-foreground" />
          ) : (
            <Bell className="w-4 h-4 text-muted-foreground" />
          )}
          {openCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0" sideOffset={8}>
        <div className="p-3 border-b border-border">
          <p className="text-xs font-semibold text-foreground">
            Tasks
            {openCount > 0 && (
              <span className="ml-2 text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-medium">
                {openCount} open
              </span>
            )}
          </p>
        </div>

        <div className="max-h-72 overflow-y-auto">
          {open_tasks.length === 0 && done_tasks.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-6">No tasks yet.</p>
          )}

          {open_tasks.map(task => (
            <div key={task.id} className="flex items-start gap-2 px-3 py-2 hover:bg-muted/40 group">
              <button
                className="mt-0.5 shrink-0 text-muted-foreground hover:text-emerald-600 transition-colors"
                onClick={() => setDone.mutate({ id: task.id, done: true })}
              >
                <Square className="w-3.5 h-3.5" />
              </button>
              <div className="flex-1 min-w-0">
                {editingId === task.id ? (
                  <div className="flex items-center gap-1">
                    <Input
                      autoFocus
                      className="h-6 text-xs py-0 px-1.5"
                      value={editText}
                      onChange={e => setEditText(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter") saveEdit(task);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                    />
                    <button onClick={() => saveEdit(task)} className="text-emerald-600 hover:text-emerald-700">
                      <Check className="w-3 h-3" />
                    </button>
                    <button onClick={() => setEditingId(null)} className="text-muted-foreground hover:text-foreground">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-foreground leading-snug">{task.text}</p>
                )}
                {task.clientName && task.clientSlug && editingId !== task.id && (
                  <Link href={`/client/${task.clientSlug}`} onClick={() => setOpen(false)}>
                    <span className="text-[10px] text-primary hover:underline cursor-pointer">
                      {task.clientName}
                    </span>
                  </Link>
                )}
              </div>
              {editingId !== task.id && (
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all shrink-0">
                  <button
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => startEdit(task)}
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => deleteTask.mutate({ id: task.id })}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          ))}

          {done_tasks.length > 0 && (
            <>
              {open_tasks.length > 0 && <div className="border-t border-border mx-3" />}
              {done_tasks.map(task => (
                <div key={task.id} className="flex items-start gap-2 px-3 py-2 hover:bg-muted/40 group">
                  <button
                    className="mt-0.5 shrink-0 text-emerald-600 hover:text-muted-foreground transition-colors"
                    onClick={() => setDone.mutate({ id: task.id, done: false })}
                  >
                    <CheckSquare className="w-3.5 h-3.5" />
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground line-through leading-snug">{task.text}</p>
                    {task.clientName && (
                      <span className="text-[10px] text-muted-foreground">{task.clientName}</span>
                    )}
                  </div>
                  <button
                    className="shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
                    onClick={() => deleteTask.mutate({ id: task.id })}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </>
          )}
        </div>

        {/* Add task form */}
        <div className="p-2 border-t border-border space-y-1.5">
          <div className="flex gap-1.5">
            <Input
              ref={inputRef}
              className="h-7 text-xs"
              placeholder="Add a task..."
              value={newText}
              onChange={e => setNewText(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleAdd()}
            />
            <Button
              size="sm"
              className="h-7 w-7 p-0 shrink-0"
              onClick={handleAdd}
              disabled={!newText.trim() || createTask.isPending}
            >
              <Plus className="w-3.5 h-3.5" />
            </Button>
          </div>
          {clients.length > 0 && (
            <select
              className="w-full h-7 text-xs rounded-md border border-input bg-background px-2 text-muted-foreground"
              value={selectedClientSlug}
              onChange={e => setSelectedClientSlug(e.target.value)}
            >
              <option value="">No client (general task)</option>
              {clients.map(c => (
                <option key={c.clientSlug} value={c.clientSlug}>{c.clientName}</option>
              ))}
            </select>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
