import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Loader2, RotateCcw, SendHorizontal, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { isAxiosError } from "axios";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  useAiStatus,
  getAiMessages,
  sendAiMessage,
  clearAiMessages,
} from "@/integrations/api/hooks";
import type { AiChatMessage, AiStatus } from "@/integrations/api/types";
import { ChatMarkdown } from "./ChatMarkdown";

const SUGGESTIONS = [
  "What can I cook from my fridge today?",
  "Suggest a high-protein breakfast",
  "Що приготувати на вечерю, щоб було легко?",
  "How much protein should I eat per day?",
];

// After this long without an answer the model is probably waking up
const SLOW_ANSWER_MS = 12_000;

const STATUS: Record<AiStatus | "connecting", { label: string; dot: string }> = {
  ready: { label: "Ready", dot: "bg-success" },
  loading: { label: "Waking up…", dot: "bg-warning animate-pulse" },
  offline: { label: "Offline", dot: "bg-destructive" },
  connecting: { label: "Connecting…", dot: "bg-muted-foreground animate-pulse" },
};

function errorMessage(err: unknown): string {
  if (isAxiosError(err)) {
    if (err.code === "ECONNABORTED") return "The assistant took too long to answer. Please try again.";
    const message = (err.response?.data as { message?: string } | undefined)?.message;
    if (message) return message;
  }
  return "Couldn't reach the assistant. Please try again.";
}

export function AiChat({
  variant,
  headerActions,
  className,
  initialInput = "",
}: {
  variant: "page" | "panel";
  headerActions?: ReactNode;
  className?: string;
  // Pre-filled into the input box, not sent: the user can still edit it
  initialInput?: string;
}) {
  const { user } = useAuth();
  const { status, setStatus } = useAiStatus();
  const [messages, setMessages] = useState<AiChatMessage[] | null>(null);
  const [input, setInput] = useState(initialInput);
  const [pending, setPending] = useState<string | null>(null);
  const [slow, setSlow] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lastQuestionRef = useRef<HTMLDivElement>(null);
  const showNewAnswer = useRef(false);

  useEffect(() => {
    getAiMessages()
      .then(setMessages)
      .catch(() => {
        setMessages([]);
        toast.error("Couldn't load your chat history");
      });
  }, []);

  // Keep the newest message in view. A fresh answer is shown from the question
  // down instead: scrolling to the very bottom would hide the start of a long one.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const question = lastQuestionRef.current;
    if (showNewAnswer.current && question) {
      el.scrollTop = question.offsetTop - 16;
      showNewAnswer.current = false;
    } else {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, pending]);

  useEffect(() => {
    if (!pending) {
      setSlow(false);
      return;
    }
    const timer = setTimeout(() => setSlow(true), SLOW_ANSWER_MS);
    return () => clearTimeout(timer);
  }, [pending]);

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || pending) return;
    setPending(message);
    setInput("");
    try {
      const { question, answer } = await sendAiMessage(message);
      showNewAnswer.current = true;
      setMessages((prev) => [...(prev ?? []), question, answer]);
      setStatus("ready"); // an answer proves the model is up, whatever the last check said
    } catch (err) {
      toast.error(errorMessage(err));
      setInput(message); // nothing was saved, so let the user resend as is
    } finally {
      setPending(null);
      inputRef.current?.focus();
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send(input);
    }
  };

  const clear = async () => {
    try {
      await clearAiMessages();
      setMessages([]);
    } catch {
      toast.error("Couldn't clear the chat — please try again");
    }
  };

  const shownStatus = STATUS[status ?? "connecting"];
  const isEmpty = messages !== null && messages.length === 0 && !pending;
  const lastUserIndex = messages ? messages.map((m) => m.role).lastIndexOf("user") : -1;

  return (
    <div
      className={cn(
        "flex min-h-0 flex-col overflow-hidden bg-card",
        variant === "page" && "rounded-2xl border border-border shadow-sm",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className={cn("font-semibold leading-tight", variant === "page" && "text-lg")}>AI Assistant</p>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className={cn("h-2 w-2 rounded-full", shownStatus.dot)} />
            {shownStatus.label}
          </p>
        </div>
        {!!messages?.length && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" disabled={!!pending} title="Start a new chat">
                <RotateCcw /> <span className="hidden sm:inline">New chat</span>
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Start a new chat?</AlertDialogTitle>
                <AlertDialogDescription>
                  This deletes your conversation with the assistant. Your profile and fridge stay as they are.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={clear}>Delete chat</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
        {headerActions}
      </div>

      {status === "loading" && (
        <div className="border-b border-border bg-warning/15 px-4 py-2 text-xs text-warning-foreground">
          The AI is waking up after a break. This takes about 30 seconds; you can already type your question.
        </div>
      )}
      {status === "offline" && (
        <div className="border-b border-border bg-destructive/10 px-4 py-2 text-xs text-destructive">
          The AI assistant can't be reached right now. You can still try sending a message.
        </div>
      )}

      {/* Messages */}
      {/* relative: makes this the offsetParent the question's offsetTop is measured from */}
      <div ref={scrollRef} className="relative min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-5">
        {messages === null && (
          <div className="grid h-full place-items-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}

        {isEmpty && (
          <div className="mx-auto flex h-full max-w-md flex-col items-center justify-center text-center">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
              <Sparkles className="h-7 w-7" />
            </div>
            <h2 className="mt-4 text-lg font-semibold">
              Hi{user?.first_name ? `, ${user.first_name}` : ""}! I'm your nutrition assistant.
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              I know your goals, allergies and what's in your fridge. Ask me in English or Ukrainian.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-full border border-border bg-background px-3 py-1.5 text-left text-sm transition hover:border-primary hover:bg-primary/5"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages?.map((m, i) => (
          <div key={m.id} ref={i === lastUserIndex ? lastQuestionRef : undefined}>
            <MessageBubble role={m.role} content={m.content} />
          </div>
        ))}

        {pending && (
          <>
            <MessageBubble role="user" content={pending} />
            <div className="flex items-start gap-2.5">
              <AssistantAvatar />
              <div className="rounded-2xl rounded-tl-sm bg-muted px-4 py-3">
                <div className="flex gap-1" aria-label="Assistant is typing">
                  {[0, 150, 300].map((delay) => (
                    <span
                      key={delay}
                      className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/60"
                      style={{ animationDelay: `${delay}ms` }}
                    />
                  ))}
                </div>
                {slow && (
                  <p className="mt-2 max-w-xs text-xs text-muted-foreground">
                    The first answer after a break takes longer while the AI wakes up (up to a minute).
                  </p>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-border p-3">
        <div className="flex items-end gap-2 rounded-2xl border border-border bg-background p-1.5 pl-3 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ask about meals, recipes, nutrition…"
            rows={1}
            maxLength={4000}
            className="max-h-36 min-h-9 flex-1 resize-none bg-transparent py-2 text-sm outline-none [field-sizing:content] placeholder:text-muted-foreground"
          />
          <Button
            size="icon"
            className="shrink-0 rounded-xl"
            onClick={() => send(input)}
            disabled={!input.trim() || !!pending}
            aria-label="Send message"
          >
            {pending ? <Loader2 className="animate-spin" /> : <SendHorizontal />}
          </Button>
        </div>
        <p className="mt-1.5 px-1 text-[11px] text-muted-foreground">
          AI answers can be wrong. Check allergens and medical advice yourself.
        </p>
      </div>
    </div>
  );
}

function AssistantAvatar() {
  return (
    <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
      <Sparkles className="h-4 w-4" />
    </div>
  );
}

function MessageBubble({ role, content }: { role: AiChatMessage["role"]; content: string }) {
  if (role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-tr-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground">
          {content}
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2.5">
      <AssistantAvatar />
      <div className="max-w-[85%] break-words rounded-2xl rounded-tl-sm bg-muted px-4 py-2.5 text-sm leading-relaxed">
        <ChatMarkdown text={content} />
      </div>
    </div>
  );
}
