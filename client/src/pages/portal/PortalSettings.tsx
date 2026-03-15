import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Instagram, Facebook, Settings2, KeyRound, Share2, LogOut } from "lucide-react";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function IgCard({ clientSlug }: { clientSlug: string }) {
  const { data, refetch } = trpc.instagram.getStatus.useQuery({ clientSlug });
  const disconnect = trpc.instagram.disconnect.useMutation({
    onSuccess: () => { refetch(); toast.success("Instagram disconnected"); },
    onError: () => toast.error("Failed to disconnect"),
  });

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <Instagram className="w-4 h-4 text-pink-500 shrink-0" />
        <div>
          <p className="text-sm font-medium">Instagram</p>
          {data?.connected && data.username && (
            <p className="text-xs text-muted-foreground">@{data.username}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {data?.connected ? (
          <>
            <span className="flex items-center gap-1 text-xs font-medium text-emerald-700">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Connected
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => disconnect.mutate({ clientSlug })}
              disabled={disconnect.isPending}
            >
              Disconnect
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            className="h-7 text-xs"
            onClick={() => { window.location.href = `/api/auth/instagram/init/${encodeURIComponent(clientSlug)}`; }}
          >
            Connect
          </Button>
        )}
      </div>
    </div>
  );
}

function FbCard({ clientSlug }: { clientSlug: string }) {
  const { data, refetch } = trpc.facebook.getStatus.useQuery({ clientSlug });
  const disconnect = trpc.facebook.disconnect.useMutation({
    onSuccess: () => { refetch(); toast.success("Facebook disconnected"); },
    onError: () => toast.error("Failed to disconnect"),
  });

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <Facebook className="w-4 h-4 text-blue-600 shrink-0" />
        <div>
          <p className="text-sm font-medium">Facebook</p>
          {data?.connected && data.pageName && (
            <p className="text-xs text-muted-foreground">{data.pageName}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {data?.connected ? (
          <>
            <span className="flex items-center gap-1 text-xs font-medium text-emerald-700">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Connected
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => disconnect.mutate({ clientSlug })}
              disabled={disconnect.isPending}
            >
              Disconnect
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            className="h-7 text-xs"
            onClick={() => { window.location.href = `/api/auth/facebook/init/${encodeURIComponent(clientSlug)}`; }}
          >
            Connect
          </Button>
        )}
      </div>
    </div>
  );
}

export default function PortalSettings() {
  const { user, logout, refresh } = useAuth({ redirectOnUnauthenticated: true, redirectPath: "/login" });

  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");

  useEffect(() => {
    if (user) {
      setName(user.name ?? "");
      setEmail(user.email ?? "");
    }
  }, [user?.name, user?.email]);

  // Facebook multi-page selection state
  const [fbSelectState, setFbSelectState] = useState<string | null>(null);
  const { data: pendingPages } = trpc.facebook.getPendingPages.useQuery(
    { state: fbSelectState ?? "" },
    { enabled: !!fbSelectState, refetchInterval: 3000 }
  );
  const confirmPage = trpc.facebook.confirmPage.useMutation({
    onSuccess: () => { setFbSelectState(null); toast.success("Facebook Page connected"); window.history.replaceState({}, "", window.location.pathname); },
    onError: () => toast.error("Failed to confirm page"),
  });

  // Handle OAuth redirect toasts
  const toastsShown = useRef(false);
  useEffect(() => {
    if (toastsShown.current) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("instagram") === "connected") {
      toast.success("Instagram connected");
      window.history.replaceState({}, "", window.location.pathname);
      toastsShown.current = true;
    } else if (params.get("instagram") === "error") {
      toast.error("Instagram connection failed");
      window.history.replaceState({}, "", window.location.pathname);
      toastsShown.current = true;
    } else if (params.get("facebook") === "connected") {
      toast.success("Facebook Page connected");
      window.history.replaceState({}, "", window.location.pathname);
      toastsShown.current = true;
    } else if (params.get("facebook") === "error") {
      toast.error("Facebook connection failed");
      window.history.replaceState({}, "", window.location.pathname);
      toastsShown.current = true;
    } else if (params.get("facebook") === "select") {
      const state = params.get("state");
      if (state) setFbSelectState(state);
      toastsShown.current = true;
    }
  }, []);

  const updateProfile = trpc.auth.updateProfile.useMutation({
    onSuccess: () => { toast.success("Profile updated"); refresh(); },
    onError: () => toast.error("Failed to update profile"),
  });

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changing, setChanging] = useState(false);

  const profileDirty = name !== (user?.name ?? "") || email !== (user?.email ?? "");

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error("Passwords don't match");
      return;
    }
    if (newPassword.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    setChanging(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (res.ok) {
        toast.success("Password updated");
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? "Failed to update password");
      }
    } catch {
      toast.error("Something went wrong");
    } finally {
      setChanging(false);
    }
  }

  return (
    <div className="max-w-lg space-y-8 pb-12">

      {/* Header */}
      <div className="flex items-end justify-between pt-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-[#3b8dc6] mb-1">Account</p>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Settings</h1>
        </div>
        <p className="text-sm text-gray-400 font-medium pb-1">{format(new Date(), "EEEE, d MMMM yyyy")}</p>
      </div>
      <hr className="border-gray-100" />

      {/* Account details */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Settings2 className="h-4 w-4 text-[#3b8dc6]" />
          <h2 className="text-sm font-bold uppercase tracking-widest text-gray-500">Account Details</h2>
        </div>
        <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-5 space-y-4">
          <div className="space-y-1">
            <Label className="text-xs text-gray-500">Name</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Your name" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-gray-500">Email</Label>
            <Input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="your@email.com" />
          </div>
          <Button
            className="bg-[#3b8dc6] hover:bg-[#3280b8] text-white"
            onClick={() => updateProfile.mutate({ name: name.trim() || undefined, email: email.trim() || undefined })}
            disabled={!profileDirty || updateProfile.isPending}
            size="sm"
          >
            {updateProfile.isPending ? "Saving..." : "Save changes"}
          </Button>
        </div>
      </div>

      {/* Social connections */}
      {user?.clientSlug && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Share2 className="h-4 w-4 text-[#3b8dc6]" />
            <h2 className="text-sm font-bold uppercase tracking-widest text-gray-500">Social Connections</h2>
          </div>
          <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-5 space-y-4">
            <p className="text-xs text-gray-400">
              Connect your social accounts so campaigns can post on your behalf.
            </p>
            <IgCard clientSlug={user.clientSlug} />
            <div className="border-t border-gray-100" />
            <FbCard clientSlug={user.clientSlug} />
          </div>
        </div>
      )}

      {/* Change password */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <KeyRound className="h-4 w-4 text-[#3b8dc6]" />
          <h2 className="text-sm font-bold uppercase tracking-widest text-gray-500">Change Password</h2>
        </div>
        <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-5">
          <form onSubmit={handleChangePassword} className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Current password</Label>
              <Input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} required autoComplete="current-password" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">New password</Label>
              <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required autoComplete="new-password" placeholder="Min 8 characters" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Confirm new password</Label>
              <Input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required autoComplete="new-password" />
            </div>
            <Button type="submit" disabled={changing} className="w-full bg-[#3b8dc6] hover:bg-[#3280b8] text-white">
              {changing ? "Updating..." : "Update password"}
            </Button>
          </form>
        </div>
      </div>

      {/* Sign out */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <LogOut className="h-4 w-4 text-gray-400" />
          <h2 className="text-sm font-bold uppercase tracking-widest text-gray-500">Sign Out</h2>
        </div>
        <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-5">
          <p className="text-xs text-gray-400 mb-4">You'll be redirected to the login page.</p>
          <Button variant="outline" onClick={logout} className="text-destructive border-destructive/30 hover:bg-destructive/5">
            Sign out
          </Button>
        </div>
      </div>

      {/* Facebook page selection dialog */}
      <Dialog open={!!fbSelectState && !!pendingPages} onOpenChange={open => { if (!open) { setFbSelectState(null); window.history.replaceState({}, "", window.location.pathname); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Select a Facebook Page</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mb-2">Multiple pages found — choose the one to connect.</p>
          <div className="space-y-2">
            {pendingPages?.pages.map(page => (
              <button
                key={page.id}
                onClick={() => fbSelectState && confirmPage.mutate({ state: fbSelectState, pageId: page.id })}
                disabled={confirmPage.isPending}
                className="w-full text-left px-4 py-3 rounded-lg border border-border hover:bg-muted/50 transition-colors text-sm font-medium"
              >
                {page.name}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
