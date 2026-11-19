import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Maximize2, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AiChat } from "./AiChat";

// Floating chat button on every app page except /assistant itself. The panel
// is only mounted while open, so a closed bubble never touches the AI service.
export function AiChatBubble() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-50 flex flex-col sm:inset-auto sm:bottom-24 sm:right-6 sm:h-[min(620px,calc(100dvh-8rem))] sm:w-[400px] sm:overflow-hidden sm:rounded-2xl sm:border sm:border-border sm:shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-200">
          <AiChat
            variant="panel"
            className="flex-1"
            headerActions={
              <>
                <Button variant="ghost" size="icon" asChild title="Open full page">
                  <Link to="/assistant" aria-label="Open the assistant as a full page">
                    <Maximize2 />
                  </Link>
                </Button>
                <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Close chat">
                  <X />
                </Button>
              </>
            }
          />
        </div>
      )}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close AI assistant" : "Open AI assistant"}
        className="fixed bottom-6 right-6 z-40 grid h-14 w-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg transition hover:scale-105 hover:bg-primary/90"
      >
        {open ? <X className="h-6 w-6" /> : <Sparkles className="h-6 w-6" />}
      </button>
    </>
  );
}
