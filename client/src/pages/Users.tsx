import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Shuffle, Copy, Trash2, KeyRound, Pencil, X, Check } from "lucide-react";

function generatePassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%&*";
  const all = upper + lower + digits + symbols;
  const arr = Array.from(crypto.getRandomValues(new Uint8Array(12)));
  const pwd = [
    upper[arr[0] % upper.length],
    lower[arr[1] % lower.length],
    digits[arr[2] % digits.length],
    symbols[arr[3] % symbols.length],
    ...arr.slice(4).map(b => all[b % all.length]),
  ];
  for (let i = pwd.length - 1; i > 0; i--) {
    const j = arr[i] % (i + 1);
    [pwd[i], pwd[j]] = [pwd[j], pwd[i]];
  }
  return pwd.join("");
}

function RoleBadge({ role }: { role: string }) {
  const cfg: Record<string, { label: string; className: string }> = {
    superAdmin: { label: "Super Admin", className: "bg-purple-100 text-purple-800 border-purple-200" },
    admin: { label: "Admin", className: "bg-blue-100 text-blue-800 border-blue-200" },
    client: { label: "Client", className: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  };
  const c = cfg[role] ?? cfg.client;
  return (
    <Badge variant="outline" className={`${c.className} text-[11px] font-medium px-2 py-0.5`}>
      {c.label}
    </Badge>
  );
}

type NewUserForm = {
  name: string;
  email: string;
  password: string;
  role: "superAdmin" | "admin" | "client";
  clientSlug: string;
  assignedClients: string;
};

type EditState = {
  openId: string;
  role: "superAdmin" | "admin" | "client";
  clientSlug: string;
  assignedClients: string;
};

type ResetState = {
  openId: string;
  password: string;
};

export default function Users() {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  const usersQuery = trpc.users.list.useQuery(undefined, { enabled: user?.role === "superAdmin" });
  const createMutation = trpc.users.create.useMutation();
  const updateRoleMutation = trpc.users.updateRole.useMutation();
  const resetPasswordMutation = trpc.users.resetPassword.useMutation();
  const deleteMutation = trpc.users.delete.useMutation();

  const [showAdd, setShowAdd] = useState(false);
  const [newUser, setNewUser] = useState<NewUserForm>({
    name: "",
    email: "",
    password: generatePassword(),
    role: "client",
    clientSlug: "",
    assignedClients: "",
  });

  const [editState, setEditState] = useState<EditState | null>(null);
  const [resetState, setResetState] = useState<ResetState | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  if (user?.role !== "superAdmin") {
    return (
      <div className="p-8">
        <p className="text-muted-foreground">Access denied. Super admin only.</p>
      </div>
    );
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createMutation.mutateAsync({
        name: newUser.name,
        email: newUser.email,
        password: newUser.password,
        role: newUser.role,
        clientSlug: newUser.clientSlug || undefined,
        assignedClients: newUser.role === "admin" && newUser.assignedClients
          ? newUser.assignedClients.split(",").map(s => s.trim()).filter(Boolean)
          : undefined,
      });
      toast.success("User created");
      setShowAdd(false);
      setNewUser({ name: "", email: "", password: generatePassword(), role: "client", clientSlug: "", assignedClients: "" });
      utils.users.list.invalidate();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to create user");
    }
  }

  async function handleUpdateRole(e: React.FormEvent) {
    e.preventDefault();
    if (!editState) return;
    try {
      await updateRoleMutation.mutateAsync({
        openId: editState.openId,
        role: editState.role,
        clientSlug: editState.clientSlug || null,
        assignedClients: editState.role === "admin" && editState.assignedClients
          ? editState.assignedClients.split(",").map(s => s.trim()).filter(Boolean)
          : editState.role === "admin" ? [] : undefined,
      });
      toast.success("User updated");
      setEditState(null);
      utils.users.list.invalidate();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update user");
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!resetState) return;
    try {
      await resetPasswordMutation.mutateAsync({ openId: resetState.openId, password: resetState.password });
      toast.success("Password reset");
      setResetState(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to reset password");
    }
  }

  async function handleDelete(openId: string) {
    try {
      await deleteMutation.mutateAsync({ openId });
      toast.success("User deleted");
      setConfirmDelete(null);
      utils.users.list.invalidate();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to delete user");
    }
  }

  const users = usersQuery.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage portal access for admins and clients.</p>
        </div>
        {!showAdd && (
          <Button size="sm" onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> Add user
          </Button>
        )}
      </div>

      {/* Add user form */}
      {showAdd && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">New user</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="new-name">Name</Label>
                <Input
                  id="new-name"
                  value={newUser.name}
                  onChange={e => setNewUser(p => ({ ...p, name: e.target.value }))}
                  placeholder="Jane Smith"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-email">Email</Label>
                <Input
                  id="new-email"
                  type="email"
                  value={newUser.email}
                  onChange={e => setNewUser(p => ({ ...p, email: e.target.value }))}
                  placeholder="jane@company.com"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-password">Password</Label>
                <div className="flex gap-2">
                  <Input
                    id="new-password"
                    value={newUser.password}
                    onChange={e => setNewUser(p => ({ ...p, password: e.target.value }))}
                    required
                    minLength={8}
                    className="font-mono text-sm"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    title="Generate password"
                    onClick={() => setNewUser(p => ({ ...p, password: generatePassword() }))}
                  >
                    <Shuffle className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    title="Copy password"
                    onClick={() => { navigator.clipboard.writeText(newUser.password); toast.success("Copied"); }}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Role</Label>
                <Select
                  value={newUser.role}
                  onValueChange={v => setNewUser(p => ({ ...p, role: v as NewUserForm["role"] }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="client">Client</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="superAdmin">Super Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {newUser.role === "client" && (
                <div className="space-y-1.5">
                  <Label htmlFor="new-clientSlug">Client slug</Label>
                  <Input
                    id="new-clientSlug"
                    value={newUser.clientSlug}
                    onChange={e => setNewUser(p => ({ ...p, clientSlug: e.target.value }))}
                    placeholder="acme-co"
                  />
                </div>
              )}
              {newUser.role === "admin" && (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="new-assignedClients">Assigned clients (comma-separated slugs)</Label>
                  <Input
                    id="new-assignedClients"
                    value={newUser.assignedClients}
                    onChange={e => setNewUser(p => ({ ...p, assignedClients: e.target.value }))}
                    placeholder="acme-co, globex, initech"
                  />
                </div>
              )}
              <div className="sm:col-span-2 flex gap-2 pt-2">
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Creating…" : "Create user"}
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowAdd(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Users table */}
      <Card>
        <CardContent className="p-0">
          {usersQuery.isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">Loading…</div>
          ) : users.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">No users yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="text-left px-4 py-3 font-medium">Name</th>
                    <th className="text-left px-4 py-3 font-medium">Email</th>
                    <th className="text-left px-4 py-3 font-medium">Role</th>
                    <th className="text-left px-4 py-3 font-medium">Assigned clients</th>
                    <th className="text-left px-4 py-3 font-medium">Last sign in</th>
                    <th className="text-right px-4 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <>
                      <tr key={u.openId} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 font-medium">{u.name ?? "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground">{u.email ?? "—"}</td>
                        <td className="px-4 py-3"><RoleBadge role={u.role} /></td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">
                          {u.role === "admin" && u.assignedClients.length > 0
                            ? u.assignedClients.join(", ")
                            : u.role === "client" && u.clientSlug
                            ? u.clientSlug
                            : "—"}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">
                          {u.lastSignedIn ? new Date(u.lastSignedIn).toLocaleDateString("en-ZA") : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              title="Edit role"
                              onClick={() => setEditState({
                                openId: u.openId,
                                role: u.role,
                                clientSlug: u.clientSlug ?? "",
                                assignedClients: u.assignedClients.join(", "),
                              })}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              title="Reset password"
                              onClick={() => setResetState({ openId: u.openId, password: generatePassword() })}
                            >
                              <KeyRound className="h-3.5 w-3.5" />
                            </Button>
                            {confirmDelete === u.openId ? (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-destructive hover:text-destructive"
                                  title="Confirm delete"
                                  onClick={() => handleDelete(u.openId)}
                                  disabled={deleteMutation.isPending}
                                >
                                  <Check className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  title="Cancel"
                                  onClick={() => setConfirmDelete(null)}
                                >
                                  <X className="h-3.5 w-3.5" />
                                </Button>
                              </>
                            ) : (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                title="Delete user"
                                onClick={() => setConfirmDelete(u.openId)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {/* Edit role inline row */}
                      {editState?.openId === u.openId && (
                        <tr key={`${u.openId}-edit`} className="bg-muted/20 border-b">
                          <td colSpan={6} className="px-4 py-4">
                            <form onSubmit={handleUpdateRole} className="flex flex-wrap gap-3 items-end">
                              <div className="space-y-1">
                                <Label className="text-xs">Role</Label>
                                <Select
                                  value={editState.role}
                                  onValueChange={v => setEditState(p => p ? { ...p, role: v as EditState["role"] } : p)}
                                >
                                  <SelectTrigger className="h-8 text-sm w-36">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="client">Client</SelectItem>
                                    <SelectItem value="admin">Admin</SelectItem>
                                    <SelectItem value="superAdmin">Super Admin</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              {editState.role === "client" && (
                                <div className="space-y-1">
                                  <Label className="text-xs">Client slug</Label>
                                  <Input
                                    className="h-8 text-sm w-40"
                                    value={editState.clientSlug}
                                    onChange={e => setEditState(p => p ? { ...p, clientSlug: e.target.value } : p)}
                                    placeholder="acme-co"
                                  />
                                </div>
                              )}
                              {editState.role === "admin" && (
                                <div className="space-y-1">
                                  <Label className="text-xs">Assigned clients (comma-separated)</Label>
                                  <Input
                                    className="h-8 text-sm w-64"
                                    value={editState.assignedClients}
                                    onChange={e => setEditState(p => p ? { ...p, assignedClients: e.target.value } : p)}
                                    placeholder="acme-co, globex"
                                  />
                                </div>
                              )}
                              <Button type="submit" size="sm" disabled={updateRoleMutation.isPending}>
                                {updateRoleMutation.isPending ? "Saving…" : "Save"}
                              </Button>
                              <Button type="button" size="sm" variant="outline" onClick={() => setEditState(null)}>
                                Cancel
                              </Button>
                            </form>
                          </td>
                        </tr>
                      )}
                      {/* Reset password inline row */}
                      {resetState?.openId === u.openId && (
                        <tr key={`${u.openId}-reset`} className="bg-muted/20 border-b">
                          <td colSpan={6} className="px-4 py-4">
                            <form onSubmit={handleResetPassword} className="flex flex-wrap gap-3 items-end">
                              <div className="space-y-1">
                                <Label className="text-xs">New password</Label>
                                <div className="flex gap-2">
                                  <Input
                                    className="h-8 text-sm font-mono w-52"
                                    value={resetState.password}
                                    onChange={e => setResetState(p => p ? { ...p, password: e.target.value } : p)}
                                    required
                                    minLength={8}
                                  />
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => setResetState(p => p ? { ...p, password: generatePassword() } : p)}
                                  >
                                    <Shuffle className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => { if (resetState) { navigator.clipboard.writeText(resetState.password); toast.success("Copied"); } }}
                                  >
                                    <Copy className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </div>
                              <Button type="submit" size="sm" disabled={resetPasswordMutation.isPending}>
                                {resetPasswordMutation.isPending ? "Saving…" : "Reset password"}
                              </Button>
                              <Button type="button" size="sm" variant="outline" onClick={() => setResetState(null)}>
                                Cancel
                              </Button>
                            </form>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
