import { useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useParams } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, Globe, BarChart2 } from "lucide-react";

function extractEmbedUrl(embed: string): string {
  const trimmed = embed.trim();
  if (trimmed.startsWith("<")) {
    const match = trimmed.match(/src="([^"]+)"/);
    return match ? match[1] : embed;
  }
  return embed;
}

export default function ClientAnalytics() {
  const params = useParams<{ token: string }>();
  const token = params.token || "";

  const { data, isLoading, error } = trpc.client.getAnalytics.useQuery(
    { token },
    { enabled: !!token },
  );

  // Load Plausible embed script after component mounts
  useEffect(() => {
    if (!data?.analyticsEmbed) return;
    const script = document.createElement("script");
    script.src = "https://plausible.io/js/embed.host.js";
    script.async = true;
    document.body.appendChild(script);
    return () => {
      if (document.body.contains(script)) document.body.removeChild(script);
    };
  }, [data?.analyticsEmbed]);

  const clientName = data?.name || data?.clientSlug || "Client";

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !data || !data.analyticsEmbed) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center">
            <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
            <h2 className="text-lg font-semibold mb-2">Analytics Not Found</h2>
            <p className="text-sm text-muted-foreground">
              This analytics dashboard is unavailable or has been removed.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
          <div className="w-9 h-9 bg-primary rounded-lg flex items-center justify-center shadow-sm shrink-0">
            <span className="text-primary-foreground font-bold text-lg tracking-tighter">G</span>
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground tracking-tight">
              GRO<span className="font-light">digital</span>
            </h1>
            <p className="text-[10px] text-muted-foreground -mt-0.5 tracking-wider uppercase">Analytics</p>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        {/* Title */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
            <BarChart2 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">{clientName}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Website Analytics</p>
          </div>
        </div>

        {/* Plausible embed */}
        <div className="w-full">
          <iframe
            {...{ "plausible-embed": "" }}
            src={extractEmbedUrl(data.analyticsEmbed)}
            scrolling="no"
            frameBorder="0"
            loading="lazy"
            style={{
              width: "1px",
              minWidth: "100%",
              height: "1600px",
              colorScheme: "auto",
            }}
          />
          <p className="text-xs text-muted-foreground mt-3">
            Stats powered by{" "}
            <a
              href="https://plausible.io"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline"
            >
              Plausible Analytics
            </a>
          </p>
        </div>
      </div>

      <footer className="border-t border-border py-8">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Globe className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">grodigital.co.za</span>
          </div>
          <p className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} Gro Digital (Pty) Ltd. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
