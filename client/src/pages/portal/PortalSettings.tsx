import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { toast } from "sonner";

export default function PortalSettings() {
  const { user, logout } = useAuth({ redirectOnUnauthenticated: true, redirectPath: "/login" });

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changing, setChanging] = useState(false);

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
    <div className="space-y-6 max-w-lg">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your account preferences.</p>
      </div>

      <Card className="shadow-sm">
        <CardContent className="p-5 space-y-4">
          <p className="text-sm font-medium">Account Details</p>
          <div className="space-y-1">
            <Label className="text-xs">Name</Label>
            <Input value={user?.name ?? ""} disabled className="bg-muted/50" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Email</Label>
            <Input value={user?.email ?? ""} disabled className="bg-muted/50" />
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardContent className="p-5">
          <p className="text-sm font-medium mb-4">Change Password</p>
          <form onSubmit={handleChangePassword} className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Current password</Label>
              <Input
                type="password"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">New password</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                required
                autoComplete="new-password"
                placeholder="Min 8 characters"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Confirm new password</Label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
              />
            </div>
            <Button type="submit" disabled={changing} className="w-full">
              {changing ? "Updating..." : "Update password"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardContent className="p-5">
          <p className="text-sm font-medium mb-2">Sign out</p>
          <p className="text-xs text-muted-foreground mb-4">You'll be redirected to the login page.</p>
          <Button variant="outline" onClick={logout} className="text-destructive border-destructive/30 hover:bg-destructive/5">
            Sign out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
