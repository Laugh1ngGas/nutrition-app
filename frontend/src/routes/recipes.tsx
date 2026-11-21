import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Search, Heart, Flame, Clock, Users, Check, Loader2, Star, CircleCheck, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useRecipeSearch, useRecipe, toggleRecipeFavorite, addFoodLog } from "@/integrations/api/hooks";
import type { DietType, Recipe, RecipeIngredient, UnitType } from "@/integrations/api/types";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";

// ?recipe=<id> opens that recipe's details, e.g. from the dashboard
export const Route = createFileRoute("/recipes")({
  component: RecipesPage,
  validateSearch: (search: Record<string, unknown>): { recipe?: string } =>
    typeof search.recipe === "string" ? { recipe: search.recipe } : {},
});

const DIET_FILTERS = ["vegetarian", "vegan", "gluten_free", "keto", "paleo"] as const satisfies readonly DietType[];

function RecipesPage() {
  const { t } = useI18n();
  const [rawQuery, setRawQuery] = useState("");
  const [query, setQuery] = useState("");
  const [matchOnly, setMatchOnly] = useState(false);
  const [sortByMatch, setSortByMatch] = useState(true);
  const [activeDiet, setActiveDiet] = useState<DietType | null>(null);
  const { recipe: linkedId } = Route.useSearch();
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState<string | null>(linkedId ?? null);

  const closeRecipe = () => {
    setSelectedId(null);
    // Drop ?recipe= so a reload doesn't reopen it
    if (linkedId) navigate({ to: "/recipes", search: {}, replace: true });
  };

  useEffect(() => {
    const timer = setTimeout(() => setQuery(rawQuery), 300);
    return () => clearTimeout(timer);
  }, [rawQuery]);

  const { data, isLoading } = useRecipeSearch(query, {
    diet_type: activeDiet ?? undefined,
    matchOnly,
    sort: sortByMatch ? "match" : undefined,
  });
  const recipes = data?.items ?? [];

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{t("recipes.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("recipes.subtitle")}</p>
      </div>

      <div className="mb-6 rounded-2xl border border-border bg-card p-4 shadow-card">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9 h-11"
            placeholder={t("recipes.search")}
            value={rawQuery}
            onChange={(e) => setRawQuery(e.target.value)}
          />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-3 py-1.5 text-sm font-semibold text-primary">
            <Switch checked={matchOnly} onCheckedChange={setMatchOnly} />
            {t("recipes.useMine")}
          </label>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Switch checked={sortByMatch} onCheckedChange={setSortByMatch} />
            {t("recipes.sortMatch")}
          </label>
          <div className="flex flex-wrap gap-1.5">
            {DIET_FILTERS.map((d) => (
              <button
                key={d}
                onClick={() => setActiveDiet(activeDiet === d ? null : d)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-semibold transition",
                  activeDiet === d ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary/40"
                )}
              >
                {t(`diet.${d}`)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="grid h-64 place-items-center text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : recipes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-16 text-center text-sm text-muted-foreground">
          {t("recipes.none")}
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {recipes.map((r) => (
            <RecipeCard key={r.id} recipe={r} onView={() => setSelectedId(r.id)} />
          ))}
        </div>
      )}

      <RecipeDetailSheet id={selectedId} onClose={closeRecipe} />
    </AppShell>
  );
}

function RecipeCard({ recipe: r, onView }: { recipe: Recipe; onView: () => void }) {
  const { t, lang } = useI18n();
  const matched = r.matched_ingredients ?? 0;
  const total = r.total_ingredients ?? 0;
  const needed = total - matched;
  const hasMatchInfo = total > 0;

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-card transition hover:shadow-card-lg">
      <div className="relative">
        {r.image_url ? (
          <img src={r.image_url} alt={r.title} className="h-44 w-full object-cover" />
        ) : (
          <div className="h-44 w-full bg-muted" />
        )}
        <FavoriteButton recipeId={r.id} initialFavorite={!!r.is_favorite} />
        {hasMatchInfo && (
          <span className="absolute top-3 left-3 rounded-full bg-primary px-2.5 py-1 text-xs font-bold text-primary-foreground">
            {t("recipes.matchBadge", { matched, total })}
          </span>
        )}
        {r.source === "ai" && (
          <span className="absolute bottom-3 left-3 flex items-center gap-1 rounded-full bg-card/90 px-2.5 py-1 text-xs font-semibold text-primary">
            <Sparkles className="h-3 w-3" /> {t("recipes.mine")}
          </span>
        )}
      </div>
      <div className="p-4">
        <h3 className="font-bold">{(lang === "uk" && r.title_uk) || r.title}</h3>
        {hasMatchInfo && (
          <>
            <div className="mt-2 text-sm font-semibold text-secondary">{t("recipes.uses", { matched, total })}</div>
            {needed > 0 && (
              <div className="mt-1 text-xs font-medium text-warning-foreground">{t("recipes.moreNeeded", { n: needed })}</div>
            )}
          </>
        )}
        <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
          {r.calories_per_serving != null && (
            <span className="flex items-center gap-1"><Flame className="h-3 w-3" />{r.calories_per_serving}</span>
          )}
          {r.prep_time_min != null && (
            <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{t("common.minutes", { n: r.prep_time_min })}</span>
          )}
          <span className="flex items-center gap-1"><Users className="h-3 w-3" />{r.servings}</span>
          {!!r.rating_count && (
            <span className="flex items-center gap-1"><Star className="h-3 w-3" />{r.average_rating?.toFixed(1)}</span>
          )}
        </div>
        <Button className="mt-4 w-full" onClick={onView}>{t("common.viewRecipe")}</Button>
      </div>
    </div>
  );
}

function FavoriteButton({ recipeId, initialFavorite }: { recipeId: string; initialFavorite: boolean }) {
  const { t } = useI18n();
  const [fav, setFav] = useState(initialFavorite);
  const [busy, setBusy] = useState(false);

  useEffect(() => setFav(initialFavorite), [initialFavorite]);

  const toggle = async () => {
    setBusy(true);
    try {
      const res = await toggleRecipeFavorite(recipeId);
      setFav(res.is_favorite);
    } catch {
      toast.error(t("recipes.favoriteError"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={toggle}
      disabled={busy}
      className={cn(
        "absolute top-3 right-3 grid h-9 w-9 place-items-center rounded-full bg-card/90 transition",
        fav ? "text-destructive" : "text-muted-foreground hover:text-destructive"
      )}
    >
      <Heart className={cn("h-4 w-4", fav && "fill-current")} />
    </button>
  );
}

const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"] as const;
type LoggableMeal = (typeof MEAL_TYPES)[number];

function mealTypeForNow(): LoggableMeal {
  const hour = new Date().getHours();
  if (hour < 11) return "breakfast";
  if (hour < 16) return "lunch";
  if (hour < 21) return "dinner";
  return "snack";
}

// "I ate this": logs one serving for today, shown on the dashboard
function LogMeal({ recipeId }: { recipeId: string }) {
  const { t } = useI18n();
  const [mealType, setMealType] = useState<LoggableMeal>(mealTypeForNow);
  const [busy, setBusy] = useState(false);

  const log = async () => {
    setBusy(true);
    try {
      await addFoodLog({ recipe_id: recipeId, meal_type: mealType, servings: 1 });
      toast.success(t("recipes.logged", { meal: t(`meal.${mealType}`).toLowerCase() }), {
        description: t("recipes.loggedHint"),
      });
    } catch {
      toast.error(t("recipes.logError"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-5 rounded-xl border border-border p-3">
      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("recipes.ateToday")}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {MEAL_TYPES.map((m) => (
          <button
            key={m}
            onClick={() => setMealType(m)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-semibold transition",
              mealType === m ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary/40"
            )}
          >
            {t(`meal.${m}`)}
          </button>
        ))}
      </div>
      <Button className="mt-3 w-full" onClick={log} disabled={busy}>
        {busy ? <Loader2 className="animate-spin" /> : <CircleCheck />} {t("recipes.ateThis")}
      </Button>
    </div>
  );
}

function RecipeDetailSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { t, lang } = useI18n();
  const { data: recipe, isLoading } = useRecipe(id);

  const haveIngredients = recipe?.ingredients.filter((i) => i.in_fridge) ?? [];
  const needIngredients = recipe?.ingredients.filter((i) => !i.in_fridge) ?? [];
  // DECIMAL quantities arrive as "3.00"; show "3"
  const amount = (quantity: number | string, unit: UnitType) => `${Number(quantity)} ${t(`unit.${unit}`)}`;
  // As the recipe wrote it ("1 1/2 cups", "pinch") in English. Those words
  // can't be translated, so Ukrainian shows units it can translate, or grams.
  const ingredientAmount = (ing: RecipeIngredient) => {
    if (lang !== "uk" && ing.note) return ing.note;
    if (ing.unit !== "piece" || ing.grams == null) return amount(ing.quantity, ing.unit);
    const grams = Number(ing.grams);
    return grams > 0 ? `${Math.round(grams * 10) / 10} ${t("unit.g")}` : "";
  };

  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-[480px] overflow-y-auto">
        {isLoading ? (
          <div className="grid h-64 place-items-center text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : recipe ? (
          <>
            <SheetHeader>
              <SheetTitle>{(lang === "uk" && recipe.title_uk) || recipe.title}</SheetTitle>
            </SheetHeader>
            {recipe.image_url && (
              <img src={recipe.image_url} className="mt-4 h-48 w-full rounded-xl object-cover" alt="" />
            )}
            <div className="mt-4 grid grid-cols-4 gap-2 text-center">
              {[
                { l: t("recipes.stat.kcal"), v: recipe.calories_per_serving ?? "—" },
                { l: t("recipes.stat.prep"), v: recipe.prep_time_min != null ? t("common.minutes", { n: recipe.prep_time_min }) : "—" },
                { l: t("recipes.stat.protein"), v: recipe.protein_per_serving_g != null ? `${recipe.protein_per_serving_g} ${t("unit.g")}` : "—" },
                { l: t("recipes.stat.carbs"), v: recipe.carbs_per_serving_g != null ? `${recipe.carbs_per_serving_g} ${t("unit.g")}` : "—" },
              ].map((s) => (
                <div key={s.l} className="rounded-lg bg-muted p-2">
                  <div className="text-sm font-bold">{s.v}</div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{s.l}</div>
                </div>
              ))}
            </div>

            {recipe.calories_per_serving != null && recipe.source && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                {t(recipe.source === "ai" ? "recipes.nutritionSourceAi" : "recipes.nutritionSource")}
              </p>
            )}

            <div className="mt-6 flex items-center gap-3 text-sm text-muted-foreground">
              <Users className="h-4 w-4" /> {t("recipes.serves", { n: recipe.servings })}
              {recipe.cuisine_type && <span>· {recipe.cuisine_type}</span>}
            </div>

            <LogMeal recipeId={recipe.id} />

            {haveIngredients.length > 0 && (
              <div className="mt-6">
                <h4 className="text-xs font-bold uppercase tracking-wider text-secondary mb-2">{t("recipes.have")}</h4>
                <ul className="space-y-1.5">
                  {haveIngredients.map((ing) => (
                    <li key={ing.id} className="flex items-center gap-2 text-sm">
                      <Check className="h-4 w-4 text-secondary" /> {ingredientAmount(ing)} {(lang === "uk" && ing.name_uk) || ing.name}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {needIngredients.length > 0 && (
              <div className="mt-5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-warning-foreground mb-2">{t("recipes.buy")}</h4>
                <ul className="space-y-1.5">
                  {needIngredients.map((ing) => (
                    <li key={ing.id} className="flex items-center justify-between rounded-lg bg-warning/10 px-3 py-2 text-sm">
                      <span>{ingredientAmount(ing)} {(lang === "uk" && ing.name_uk) || ing.name}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {recipe.instructions && (
              <div className="mt-6">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">{t("recipes.instructions")}</h4>
                <p className="whitespace-pre-line text-sm leading-relaxed">{recipe.instructions}</p>
              </div>
            )}
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
