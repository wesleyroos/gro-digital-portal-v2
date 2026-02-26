import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Send, Bot, TrendingUp, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ReactMarkdown from "react-markdown";

type Message = { role: "user" | "assistant"; content: string };
type AgentSlug = "henry" | "finance" | "marketing";

const AGENTS: {
  slug: AgentSlug;
  name: string;
  description: string;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  sendBg: string;
  endpoint: string;
  placeholder: string;
  prompts: string[];
}[] = [
  {
    slug: "henry",
    name: "Henry",
    description: "CEO — business overview, tasks & strategy",
    icon: Bot,
    iconBg: "bg-primary/10",
    iconColor: "text-primary",
    sendBg: "bg-primary hover:bg-primary/90",
    endpoint: "/api/henry",
    placeholder: "Ask Henry anything...",
    prompts: [
      "Give me a business overview for today",
      "What tasks need my attention?",
      "What's our MRR looking like?",
      "What should I focus on this week?",
    ],
  },
  {
    slug: "finance",
    name: "Finance",
    description: "Invoices, payments & recurring revenue",
    icon: TrendingUp,
    iconBg: "bg-emerald-500/10",
    iconColor: "text-emerald-600",
    sendBg: "bg-emerald-600 hover:bg-emerald-700",
    endpoint: "/api/agent/finance",
    placeholder: "Ask the Finance agent...",
    prompts: [
      "What's our current cash flow situation?",
      "Which invoices are overdue?",
      "Send reminders for all overdue invoices",
      "What's our MRR and ARR right now?",
    ],
  },
  {
    slug: "marketing",
    name: "Marketing",
    description: "Lead nurturing, upsells & content strategy",
    icon: Megaphone,
    iconBg: "bg-violet-500/10",
    iconColor: "text-violet-600",
    sendBg: "bg-violet-600 hover:bg-violet-700",
    endpoint: "/api/agent/marketing",
    placeholder: "Ask the Marketing agent...",
    prompts: [
      "What's the state of our leads pipeline?",
      "Which existing clients could we upsell?",
      "Give me 5 content ideas for this week",
      "Which leads should we prioritise?",
    ],
  },
];

function AgentChat({ agent }: { agent: typeof AGENTS[0] }) {
  const isHenry = agent.slug === "henry";
  const { data: henryHistory } = trpc.henry.history.useQuery(undefined, { enabled: isHenry });
  const { data: agentHistory } = trpc.agent.history.useQuery(
    { agentSlug: agent.slug },
    { enabled: !isHenry },
  );

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const history = isHenry ? henryHistory : agentHistory;

  useEffect(() => {
    if (!historyLoaded && history) {
      setMessages(history as Message[]);
      setHistoryLoaded(true);
    }
  }, [history, historyLoaded]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send(text?: string) {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: msg }]);
    setLoading(true);
    try {
      const res = await fetch(agent.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json() as { reply: string };
      setMessages(prev => [...prev, { role: "assistant", content: data.reply }]);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Sorry, I'm having trouble connecting right now. Try again in a moment." }]);
    } finally {
      setLoading(false);
    }
  }

  const Icon = agent.icon;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1 pb-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center gap-6 py-8">
            <div className={`w-14 h-14 rounded-2xl ${agent.iconBg} flex items-center justify-center`}>
              <Icon className={`w-7 h-7 ${agent.iconColor}`} />
            </div>
            <div>
              <p className="font-semibold text-foreground text-base">{agent.name}</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm">{agent.description}</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
              {agent.prompts.map(p => (
                <button
                  key={p}
                  onClick={() => send(p)}
                  className="text-left px-4 py-3 rounded-xl border border-border bg-card hover:bg-muted/50 transition-colors text-sm text-foreground"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              {msg.role === "assistant" && (
                <div className={`w-7 h-7 rounded-full ${agent.iconBg} flex items-center justify-center shrink-0 mt-0.5 mr-2`}>
                  <Icon className={`w-3.5 h-3.5 ${agent.iconColor}`} />
                </div>
              )}
              <div
                className={`max-w-[75%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground rounded-br-sm whitespace-pre-wrap"
                    : "bg-card border border-border text-foreground rounded-bl-sm shadow-sm"
                }`}
              >
                {msg.role === "user" ? msg.content : (
                  <ReactMarkdown className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0 prose-headings:my-2">
                    {msg.content}
                  </ReactMarkdown>
                )}
              </div>
            </div>
          ))
        )}

        {loading && (
          <div className="flex justify-start">
            <div className={`w-7 h-7 rounded-full ${agent.iconBg} flex items-center justify-center shrink-0 mt-0.5 mr-2`}>
              <Icon className={`w-3.5 h-3.5 ${agent.iconColor}`} />
            </div>
            <div className="bg-card border border-border rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 pt-4 border-t border-border">
        <div className="flex items-center gap-2">
          <Input
            className="h-10 text-sm rounded-full bg-muted border-0 focus-visible:ring-1"
            placeholder={agent.placeholder}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            disabled={loading}
          />
          <Button
            size="sm"
            className={`h-10 w-10 p-0 rounded-full shrink-0 ${agent.sendBg}`}
            onClick={() => send()}
            disabled={!input.trim() || loading}
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function Agents() {
  const [activeSlug, setActiveSlug] = useState<AgentSlug>("henry");
  const activeAgent = AGENTS.find(a => a.slug === activeSlug)!;

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      {/* Header + selector */}
      <div className="shrink-0 mb-5">
        <h1 className="text-xl font-bold tracking-tight mb-4">Agents</h1>
        <div className="flex gap-2 flex-wrap">
          {AGENTS.map(agent => {
            const Icon = agent.icon;
            const isActive = agent.slug === activeSlug;
            return (
              <button
                key={agent.slug}
                onClick={() => setActiveSlug(agent.slug)}
                className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                  isActive
                    ? "bg-card border-border shadow-sm"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                <div className={`w-6 h-6 rounded-lg ${agent.iconBg} flex items-center justify-center`}>
                  <Icon className={`w-3.5 h-3.5 ${agent.iconColor}`} />
                </div>
                <div className="text-left">
                  <span className={isActive ? "text-foreground" : ""}>{agent.name}</span>
                  <span className="hidden sm:inline text-muted-foreground font-normal text-xs ml-1.5">— {agent.description}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Chat — key forces remount per agent so state is isolated */}
      <AgentChat key={activeSlug} agent={activeAgent} />
    </div>
  );
}
