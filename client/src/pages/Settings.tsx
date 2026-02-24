import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useEffect } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

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
      // Remove the query param from the URL without reloading
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [location]);

  return (
    <div>
      <h1 className="text-xl font-bold tracking-tight mb-6">Settings</h1>

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
    </div>
  );
}
