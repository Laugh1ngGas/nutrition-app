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
import { useI18n, type Translate } from "@/lib/i18n";
import type { MessageKey } from "@/locales/en";
import { ChatMarkdown } from "./ChatMarkdown";

// One of them is always in the other language, to show the chat speaks both
const SUGGESTIONS: MessageKey[] = ["ai.suggestion1", "ai.suggestion2", "ai.suggestion3", "ai.suggestion4"];

// After this long without an answer the model is probably waking up
const SLOW_ANSWER_MS = 12_000;

const STATUS: Record<AiStatus | "connecting", { label: MessageKey; dot: string }> = {
  ready: { label: "ai.status.ready", dot: "bg-success" },
  loading: { label: "ai.status.loading", dot: "bg-warning animate-pulse" },
  offline: { label: "ai.status.offline", dot: "bg-destructive" },
  connecting: { label: "ai.status.connecting", dot: "bg-muted-foreground animate-pulse" },
};

function errorMessage(err: unknown, t: Translate): string {
  if (isAxiosError(err)) {
    if (err.code === "ECONNABORTED") return t("ai.timeout");
    const message = (err.response?.data as { message?: string } | undefined)?.message;
    if (message) return message;
  }
  return t("ai.unreachable");
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
  const { t } = useI18n();
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
        toast.error(t("ai.historyError"));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      toast.error(errorMessage(err, t));
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
      toast.error(t("ai.clearError"));
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
          <p className={cn("font-semibold leading-tight", variant === "page" && "text-lg")}>{t("ai.title")}</p>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className={cn("h-2 w-2 rounded-full", shownStatus.dot)} />
            {t(shownStatus.label)}
          </p>
        </div>
        {!!messages?.length && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" disabled={!!pending} title={t("ai.newChatTooltip")}>
                <RotateCcw /> <span className="hidden sm:inline">{t("ai.newChat")}</span>
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("ai.newChatConfirm")}</AlertDialogTitle>
                <AlertDialogDescription>{t("ai.newChatText")}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                <AlertDialogAction onClick={clear}>{t("ai.deleteChat")}</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
        {headerActions}
      </div>

      {status === "loading" && (
        <div className="border-b border-border bg-warning/15 px-4 py-2 text-xs text-warning-foreground">
          {t("ai.wakingBanner")}
        </div>
      )}
      {status === "offline" && (
        <div className="border-b border-border bg-destructive/10 px-4 py-2 text-xs text-destructive">
          {t("ai.offlineBanner")}
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
              {user?.first_name ? t("ai.helloName", { name: user.first_name }) : t("ai.hello")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("ai.intro")}</p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((key) => (
                <button
                  key={key}
                  onClick={() => send(t(key))}
                  className="rounded-full border border-border bg-background px-3 py-1.5 text-left text-sm transition hover:border-primary hover:bg-primary/5"
                >
                  {t(key)}
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
                <div className="flex gap-1" aria-label={t("ai.typing")}>
                  {[0, 150, 300].map((delay) => (
                    <span
                      key={delay}
                      className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/60"
                      style={{ animationDelay: `${delay}ms` }}
                    />
                  ))}
                </div>
                {slow && (
                  <p className="mt-2 max-w-xs text-xs text-muted-foreground">{t("ai.slow")}</p>
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
            placeholder={t("ai.placeholder")}
            rows={1}
            maxLength={4000}
            className="max-h-36 min-h-9 flex-1 resize-none bg-transparent py-2 text-sm outline-none [field-sizing:content] placeholder:text-muted-foreground"
          />
          <Button
            size="icon"
            className="shrink-0 rounded-xl"
            onClick={() => send(input)}
            disabled={!input.trim() || !!pending}
            aria-label={t("ai.send")}
          >
            {pending ? <Loader2 className="animate-spin" /> : <SendHorizontal />}
          </Button>
        </div>
        <p className="mt-1.5 px-1 text-[11px] text-muted-foreground">{t("ai.disclaimer")}</p>
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
