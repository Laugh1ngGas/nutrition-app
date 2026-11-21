import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Check, ChevronDown, Clock, Flame, Loader2, Sparkles, Users, UtensilsCrossed } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { saveAiRecipe } from "@/integrations/api/hooks";
import type { AiAttachment, AiDraftCard, AiRecipeCard } from "@/integrations/api/types";

// Recipe cards under an assistant answer: recipes it found in the catalogue,
// and recipes it wrote itself, which the user can save
export function RecipeAttachments({
  messageId,
  attachments,
  onSaved,
}: {
  messageId: string;
  attachments: AiAttachment[];
  onSaved: (index: number, recipeId: string) => void;
}) {
  return (
    <div className="ml-9.5 mt-2 max-w-[85%] space-y-2">
      {attachments.map((a, i) =>
        a.type === "recipe" ? (
          <FoundRecipe key={a.id} recipe={a} />
        ) : (
          <DraftRecipe key={`draft-${i}`} draft={a} messageId={messageId} index={i} onSaved={onSaved} />
        )
      )}
    </div>
  );
}

function useTitle() {
  const { lang } = useI18n();
  return (r: { title: string; title_uk: string | null }) => (lang === "uk" && r.title_uk) || r.title;
}

function FoundRecipe({ recipe }: { recipe: AiRecipeCard }) {
  const { t } = useI18n();
  const title = useTitle();
  return (
    <Link
      to="/recipes"
      search={{ recipe: recipe.id }}
      data-recipe-card={recipe.title}
      className="flex items-center gap-3 rounded-xl border border-border bg-background p-2 pr-3 transition hover:border-primary hover:bg-primary/5"
    >
      {recipe.image_url ? (
        <img src={recipe.image_url} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" loading="lazy" />
      ) : (
        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
          <UtensilsCrossed className="h-5 w-5" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">{title(recipe)}</div>
        <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
          {recipe.calories != null && (
            <span className="flex items-center gap-1"><Flame className="h-3 w-3" />{t("aiRecipe.kcal", { n: recipe.calories })}</span>
          )}
          {recipe.time_min != null && recipe.time_min > 0 && (
            <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{t("common.minutes", { n: recipe.time_min })}</span>
          )}
        </div>
        {recipe.protein_g != null && (
          <div className="text-xs text-muted-foreground">
            {t("aiRecipe.macros", { p: recipe.protein_g, f: recipe.fat_g ?? 0, c: recipe.carbs_g ?? 0 })}
          </div>
        )}
      </div>
    </Link>
  );
}

function DraftRecipe({
  draft,
  messageId,
  index,
  onSaved,
}: {
  draft: AiDraftCard;
  messageId: string;
  index: number;
  onSaved: (index: number, recipeId: string) => void;
}) {
  const { t } = useI18n();
  const title = useTitle();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const { recipe_id } = await saveAiRecipe(messageId, index);
      onSaved(index, recipe_id);
      toast.success(t("aiRecipe.saved"));
    } catch {
      toast.error(t("aiRecipe.saveError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div data-draft-card={draft.title} className="rounded-xl border border-primary/30 bg-primary/5 p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-primary">
        <Sparkles className="h-3.5 w-3.5" /> {t("aiRecipe.badge")}
      </div>
      <div className="mt-1 font-semibold">{title(draft)}</div>
      <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1 font-medium text-foreground">
          <Flame className="h-3 w-3" />{t("aiRecipe.kcal", { n: draft.calories })} {t("aiRecipe.perServing")}
        </span>
        <span className="flex items-center gap-1"><Users className="h-3 w-3" />{t("recipes.serves", { n: draft.servings })}</span>
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />{t("common.minutes", { n: draft.prep_time_min + draft.cook_time_min })}
        </span>
      </div>
      <div className="text-xs text-muted-foreground">
        {t("aiRecipe.macros", { p: draft.protein_g, f: draft.fat_g, c: draft.carbs_g })}
      </div>

      <button
        onClick={() => setOpen((o) => !o)}
        className="mt-2 flex items-center gap-1 text-xs font-medium text-primary hover:underline"
      >
        {open ? t("aiRecipe.hide") : t("aiRecipe.details")}
        <ChevronDown className={cn("h-3.5 w-3.5 transition", open && "rotate-180")} />
      </button>
      {open && (
        <div className="mt-2 space-y-2 text-sm">
          <ul className="space-y-0.5">
            {draft.ingredients.map((ing) => (
              <li key={ing.name}>
                {ing.grams} {t("unit.g")} {ing.name}
              </li>
            ))}
          </ul>
          <ol className="list-decimal space-y-1 pl-5">
            {draft.steps.map((step, i) => <li key={i}>{step}</li>)}
          </ol>
          {draft.missing.length > 0 && (
            <p className="text-xs text-muted-foreground">{t("aiRecipe.missing", { names: draft.missing.join(", ") })}</p>
          )}
        </div>
      )}

      <div className="mt-3">
        {draft.saved_recipe_id ? (
          <div className="flex items-center gap-3 text-sm">
            <span className="flex items-center gap-1 font-medium text-success"><Check className="h-4 w-4" />{t("aiRecipe.saved")}</span>
            <Link to="/recipes" search={{ recipe: draft.saved_recipe_id }} className="font-medium text-primary hover:underline">
              {t("aiRecipe.open")}
            </Link>
          </div>
        ) : (
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="animate-spin" /> : <Check />}
            {saving ? t("aiRecipe.saving") : t("aiRecipe.save")}
          </Button>
        )}
      </div>
    </div>
  );
}
