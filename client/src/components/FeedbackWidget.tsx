import { useState, useRef, useEffect } from "react";
import { Send, X, Minimize2, MessageSquarePlus, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ReactMarkdown from "react-markdown";

type Message = { role: "user" | "assistant"; content: string };

export default function FeedbackWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, open]);

  useEffect(() => {
    if (submitted) {
      const timer = setTimeout(() => {
        setOpen(false);
        // Reset after close animation
        setTimeout(() => {
          setSubmitted(false);
          setMessages([]);
        }, 300);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [submitted]);

  function handleOpen() {
    setOpen(v => !v);
    if (!hasOpened) setHasOpened(true);
  }

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");

    const userMsg: Message = { role: "user", content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setLoading(true);

    try {
      const res = await fetch("/api/feedback-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages,
          currentUrl: window.location.href,
        }),
      });
      if (!res.ok) throw new Error("Request failed");
      const data = await res.json() as { reply: string; submitted: boolean };
      setMessages(prev => [...prev, { role: "assistant", content: data.reply }]);
      if (data.submitted) setSubmitted(true);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Sorry, something went wrong. Please try again." }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* Chat window */}
      {open && (
        <div className="fixed bottom-24 right-4 z-50 w-[340px] max-w-[calc(100vw-32px)] flex flex-col rounded-2xl border border-border bg-background shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-200">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-[#3b8dc6] text-white">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                <MessageSquarePlus className="w-4 h-4" />
              </div>
              <div>
                <p className="text-sm font-semibold leading-none">Feedback</p>
                <p className="text-[11px] opacity-75 mt-0.5">Report a bug or request a feature</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-white/80 hover:text-white hover:bg-white/10"
              onClick={() => setOpen(false)}
            >
              <Minimize2 className="w-4 h-4" />
            </Button>
          </div>

          {submitted ? (
            /* Success screen */
            <div className="flex flex-col items-center justify-center py-12 px-6 text-center gap-3">
              <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center">
                <CheckCircle2 className="w-7 h-7 text-emerald-600" />
              </div>
              <p className="text-sm font-semibold text-foreground">Thanks for the feedback!</p>
              <p className="text-xs text-muted-foreground">It's been logged and will be reviewed soon.</p>
            </div>
          ) : (
            <>
              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[260px] max-h-[340px] bg-muted/20">
                {messages.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full py-8 text-center">
                    <div className="w-12 h-12 rounded-full bg-[#3b8dc6]/10 flex items-center justify-center mb-3">
                      <MessageSquarePlus className="w-6 h-6 text-[#3b8dc6]" />
                    </div>
                    <p className="text-sm font-medium text-foreground">Got feedback?</p>
                    <p className="text-xs text-muted-foreground mt-1">Tell us about a bug or request a feature.</p>
                  </div>
                )}
                {messages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                        msg.role === "user"
                          ? "bg-[#3b8dc6] text-white rounded-br-sm whitespace-pre-wrap"
                          : "bg-background border border-border text-foreground rounded-bl-sm shadow-sm prose prose-sm max-w-none"
                      }`}
                    >
                      {msg.role === "user" ? msg.content : <ReactMarkdown>{msg.content}</ReactMarkdown>}
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="flex justify-start">
                    <div className="bg-background border border-border rounded-2xl rounded-bl-sm px-3.5 py-3 shadow-sm">
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
              <div className="flex items-center gap-2 p-3 border-t border-border bg-background">
                <Input
                  className="h-9 text-sm rounded-full bg-muted border-0 focus-visible:ring-1"
                  placeholder="Describe the issue or idea..."
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                  disabled={loading}
                  autoFocus
                />
                <Button
                  size="sm"
                  className="h-9 w-9 p-0 rounded-full shrink-0"
                  onClick={send}
                  disabled={!input.trim() || loading}
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Bubble */}
      <button
        onClick={handleOpen}
        className="fixed bottom-4 right-4 z-50 w-12 h-12 rounded-full bg-[#3b8dc6] text-white shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200 flex items-center justify-center"
        aria-label={open ? "Close feedback" : "Send feedback"}
      >
        {open ? (
          <X className="w-5 h-5" />
        ) : (
          <div className="relative">
            <MessageSquarePlus className="w-5 h-5" />
            {!hasOpened && (
              <span className="absolute -top-1.5 -right-1.5 w-2 h-2 bg-emerald-400 rounded-full border border-[#3b8dc6]" />
            )}
          </div>
        )}
      </button>
    </>
  );
}
