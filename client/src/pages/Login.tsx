import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const isClientLogin = email.trim().length > 0;

      const res = await fetch(isClientLogin ? "/api/auth/client-login" : "/api/auth/password-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isClientLogin ? { email: email.trim(), password } : { password }),
      });

      if (res.ok) {
        window.location.href = isClientLogin ? "/portal" : "/";
      } else if (res.status === 401) {
        setError(isClientLogin ? "Invalid email or password" : "Invalid password");
      } else {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Server error — check logs");
      }
    } catch {
      setError("Something went wrong, try again");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30">
      <Card className="w-full max-w-sm shadow-lg">
        <CardContent className="p-8">
          <div className="mb-6">
            <h1 className="text-lg font-bold tracking-tight">GRO Digital</h1>
            <p className="text-sm text-muted-foreground mt-1">Sign in to your portal</p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              type="email"
              placeholder="Email (leave blank for admin)"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoFocus
              autoComplete="email"
            />
            <Input
              type="password"
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
            {error && <p className="text-xs text-red-500">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Signing in..." : "Sign in"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
