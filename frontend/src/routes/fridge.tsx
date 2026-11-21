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
import { categoryEmoji, daysUntil } from "@/lib/fridge";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/fridge")({ component: FridgePage });

// Tab ids; categories themselves are data and shown as stored
const ALL = "All";
const OTHER = "Other";

function FridgePage() {
  const { t } = useI18n();
  const { data: items, isLoading, refetch } = useFridge();
  const [tab, setTab] = useState(ALL);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const categories = useMemo(() => {
    const set = new Set<string>();
    (items ?? []).forEach((i) => set.add(i.category || OTHER));
    return [ALL, ...Array.from(set).sort()];
  }, [items]);

  const filtered = useMemo(() => {
    const list = items ?? [];
    return tab === ALL ? list : list.filter((i) => (i.category || OTHER) === tab);
  }, [items, tab]);

  const categoryLabel = (c: string) => (c === ALL ? t("fridge.all") : c === OTHER ? t("fridge.other") : c);

  const handleRemove = async (item: FridgeItem) => {
    setRemovingId(item.id);
    try {
      await removeFridgeItem(item.id);
      await refetch();
    } catch {
      toast.error(t("fridge.removeError"));
    } finally {
      setRemovingId(null);
    }
  };

  const count = items?.length ?? 0;

  return (
    <AppShell>
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t("fridge.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isLoading ? t("common.loading") : t("fridge.count", { count })}
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="mr-1 h-4 w-4" /> {t("fridge.add")}
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
              {categoryLabel(c)}
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
          <h2 className="mt-4 font-semibold">{t("fridge.emptyTitle")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("fridge.emptyText")}</p>
          <Button className="mt-4" onClick={() => setDialogOpen(true)}><Plus className="mr-1 h-4 w-4" />{t("fridge.add")}</Button>
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
                    aria-label={t("fridge.remove", { name: item.name })}
                    className="rounded-md p-1.5 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
                  >
                    {removingId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </button>
                </div>
                <div className="mt-2 font-semibold">{item.name}</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {item.quantity != null ? `${Number(item.quantity)} ${t(`unit.${item.unit}`)}` : t(`unit.${item.unit}`)}
                </div>
                <div className="mt-3 flex items-center justify-between">
                  {days != null ? <ExpiryBadge days={days} /> : <span className="text-xs text-muted-foreground">{t("fridge.noExpiry")}</span>}
                  <span className="text-xs text-muted-foreground">{categoryLabel(item.category || OTHER)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {count > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-10 border-t border-border bg-card/95 p-4 backdrop-blur lg:left-60">
          <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground hidden sm:block">{t("fridge.ready", { count })}</span>
            <Button className="w-full sm:w-auto" asChild>
              <a href="/recipes">{t("fridge.findRecipes")} <ArrowRight className="ml-1 h-4 w-4" /></a>
            </Button>
          </div>
        </div>
      )}
    </AppShell>
  );
}
