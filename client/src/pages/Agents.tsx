import { Bot, ExternalLink, Rocket, Target, FileText } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

export default function Agents() {
  return (
    <div className="max-w-2xl mx-auto py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">AI</h1>
        <p className="text-sm text-muted-foreground mt-1">Tools and workflows powered by AI</p>
      </div>

      <div className="grid gap-3">
        <Card className="hover:bg-accent/30 transition-colors">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Rocket className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">Outreach</p>
              <p className="text-xs text-muted-foreground">Discover prospects, draft emails, manage your pipeline</p>
            </div>
            <Link href="/outreach">
              <Button variant="ghost" size="sm">Open</Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="hover:bg-accent/30 transition-colors">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Target className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">Leads</p>
              <p className="text-xs text-muted-foreground">Manage your sales pipeline from prospect to close</p>
            </div>
            <Link href="/leads">
              <Button variant="ghost" size="sm">Open</Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="hover:bg-accent/30 transition-colors">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">Proposals</p>
              <p className="text-xs text-muted-foreground">Create and track proposals with AI assistance</p>
            </div>
            <Link href="/proposals">
              <Button variant="ghost" size="sm">Open</Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="hover:bg-accent/30 transition-colors">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-10 w-10 rounded-lg bg-orange-500/10 flex items-center justify-center shrink-0">
              <Bot className="h-5 w-5 text-orange-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">Paperclip Agents</p>
              <p className="text-xs text-muted-foreground">Autonomous background agents — CEO, CTO, and more</p>
            </div>
            <a href="https://paperclip-production-9502.up.railway.app" target="_blank" rel="noopener noreferrer">
              <Button variant="ghost" size="sm" className="gap-1.5">
                Open <ExternalLink className="h-3 w-3" />
              </Button>
            </a>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
