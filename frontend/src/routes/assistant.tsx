import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { AiChat } from "@/components/ai/AiChat";

// ?ask=<text> pre-fills the input (not sent), e.g. from the dashboard
export const Route = createFileRoute("/assistant")({
  component: AssistantPage,
  validateSearch: (search: Record<string, unknown>): { ask?: string } =>
    typeof search.ask === "string" ? { ask: search.ask } : {},
});

function AssistantPage() {
  const { ask } = Route.useSearch();
  return (
    <AppShell>
      {/* Fill the screen below the 4rem navbar, minus <main>'s padding */}
      <div className="mx-auto h-[calc(100dvh-6rem)] max-w-4xl lg:h-[calc(100dvh-8rem)]">
        <AiChat variant="page" className="h-full" initialInput={ask} />
      </div>
    </AppShell>
  );
}
