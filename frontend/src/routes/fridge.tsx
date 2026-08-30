import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { ExpiryBadge } from "@/components/fridge/ExpiryBadge";
import { AddIngredientDialog } from "@/components/fridge/AddIngredientDialog";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, Refrigerator, ArrowRight, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { useFridge, removeFridgeItem } from "@/integrations/api/hooks";
import type { FridgeItem } from "@/integrations/api/types";
import { toast } from "sonner";

export const Route = createFileRoute("/fridge")({ component: FridgePage });

const CATEGORY_EMOJI: Record<string, string> = {
  dairy: "🥛", produce: "🥦", meat: "🍗", poultry: "🍗", fish: "🐟", seafood: "🦐",
  grains: "🌾", bakery: "🍞", fruit: "🍎", fruits: "🍎", vegetables: "🥕",
  spices: "🧂", condiments: "🧴", beverages: "🥤", snacks: "🍿", frozen: "🧊",
  canned: "🥫", eggs: "🥚", oils: "🫒", nuts: "🥜", legumes: "🫘",
};

function categoryEmoji(category?: string | null): string {
  if (!category) return "🥘";
  return CATEGORY_EMOJI[category.toLowerCase()] ?? "🥘";
}

function daysUntil(dateStr?: string | null): number | null {
  if (!dateStr) return null;
  // Build the target date from its Y/M/D parts directly (local time) — parsing the
  // string via `new Date(dateStr)` reads it as UTC midnight, which rounds down a day
  // once flattened to local midnight in any timezone behind UTC.
  const [y, m, d] = dateStr.slice(0, 10).split("-").map(Number);
  const target = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function FridgePage() {
  const { data: items, isLoading, refetch } = useFridge();
  const [tab, setTab] = useState("All");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const categories = useMemo(() => {
    const set = new Set<string>();
    (items ?? []).forEach((i) => set.add(i.category || "Other"));
    return ["All", ...Array.from(set).sort()];
  }, [items]);

  const filtered = useMemo(() => {
    const list = items ?? [];
    return tab === "All" ? list : list.filter((i) => (i.category || "Other") === tab);
  }, [items, tab]);

  const handleRemove = async (item: FridgeItem) => {
    setRemovingId(item.id);
    try {
      await removeFridgeItem(item.id);
      await refetch();
    } catch {
      toast.error("Couldn't remove item — please try again");
    } finally {
      setRemovingId(null);
    }
  };

  const count = items?.length ?? 0;

  return (
    <AppShell>
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">My Fridge & Pantry</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isLoading ? "Loading…" : `${count} ingredient${count === 1 ? "" : "s"} tracked`}
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="mr-1 h-4 w-4" /> Add Ingredient
        </Button>
      </div>

      <AddIngredientDialog open={dialogOpen} onOpenChange={setDialogOpen} onAdded={refetch} />

      {count > 0 && (
        <div className="mb-6 flex gap-2 overflow-x-auto">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setTab(c)}
              className={cn(
                "rounded-full border px-4 py-2 text-sm font-medium transition whitespace-nowrap",
                tab === c ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:border-primary/40"
              )}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="grid h-64 place-items-center text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : count === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-16 text-center">
          <Refrigerator className="mx-auto h-12 w-12 text-muted-foreground" />
          <h2 className="mt-4 font-semibold">Nothing here yet</h2>
          <p className="mt-1 text-sm text-muted-foreground">Add your first ingredient to get started.</p>
          <Button className="mt-4" onClick={() => setDialogOpen(true)}><Plus className="mr-1 h-4 w-4" />Add Ingredient</Button>
        </div>
      ) : (
        <div className="grid gap-4 pb-24 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((item) => {
            const days = daysUntil(item.expiry_date);
            return (
              <div key={item.id} className="group rounded-2xl border border-border bg-card p-4 shadow-card transition hover:shadow-card-lg">
                <div className="flex items-start justify-between">
                  <div className="text-3xl">{categoryEmoji(item.category)}</div>
                  <button
                    onClick={() => handleRemove(item)}
                    disabled={removingId === item.id}
                    aria-label={`Remove ${item.name}`}
                    className="rounded-md p-1.5 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
                  >
                    {removingId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </button>
                </div>
                <div className="mt-2 font-semibold">{item.name}</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {item.quantity != null ? `${item.quantity} ${item.unit}` : item.unit}
                </div>
                <div className="mt-3 flex items-center justify-between">
                  {days != null ? <ExpiryBadge days={days} /> : <span className="text-xs text-muted-foreground">No expiry set</span>}
                  <span className="text-xs text-muted-foreground">{item.category || "Other"}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {count > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-10 border-t border-border bg-card/95 p-4 backdrop-blur lg:left-60">
          <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground hidden sm:block">{count} items ready to plan</span>
            <Button className="w-full sm:w-auto" asChild>
              <a href="/recipes">Find recipes using these ingredients <ArrowRight className="ml-1 h-4 w-4" /></a>
            </Button>
          </div>
        </div>
      )}
    </AppShell>
  );
}
