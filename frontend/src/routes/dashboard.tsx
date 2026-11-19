import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import {
  Refrigerator,
  AlertTriangle,
  Sparkles,
  Droplet,
  Clock,
  Flame,
  Loader2,
  X,
  ChefHat,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { categoryEmoji, daysUntil } from "@/lib/fridge";
import { expiryStatus } from "@/lib/mock-data";
import {
  useFridge,
  useDailyLog,
  useRecipeSearch,
  useWater,
  setWater,
  removeFoodLog,
} from "@/integrations/api/hooks";
import type { FoodLog, MealType } from "@/integrations/api/types";

export const Route = createFileRoute("/dashboard")({ component: Dashboard });

const WATER_GOAL_CUPS = 8;
const EXPIRING_DAYS = 3;
const FRIDGE_CHIPS = 8;

const MEAL_SLOTS: { type: MealType; label: string }[] = [
  { type: "breakfast", label: "Breakfast" },
  { type: "lunch", label: "Lunch" },
  { type: "dinner", label: "Dinner" },
  { type: "snack", label: "Snack" },
];

function greeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 18) return "Good afternoon";
  return "Good evening";
}

function Dashboard() {
  const { user } = useAuth();
  const firstName = user?.first_name || user?.name?.split(" ")[0] || "there";
  const { data: fridge, isLoading: fridgeLoading } = useFridge();
  // Shared by the meals and nutrition cards, so removing a meal updates both
  const daily = useDailyLog();

  const items =(fridge ?? []).map((i) => ({ ...i, days: daysUntil(i.expiry_date) }));
  const expiring = items.filter((i) => i.days !== null && i.days <= EXPIRING_DAYS);

  return (
    <AppShell>
      <div className="mb-8">
        <h1 className="text-2xl font-bold">{greeting()}, {firstName}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Here's your kitchen for today.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[320px_1fr_340px]">
        {/* LEFT */}
        <div className="space-y-6">
          <Card>
            <CardHeader
              title="My Fridge"
              icon={<Refrigerator className="h-4 w-4" />}
              right={
                <Link to="/fridge" className="text-xs font-semibold text-primary hover:underline">
                  Open
                </Link>
              }
            />
            {fridgeLoading ? (
              <Spinner />
            ) : items.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Your fridge is empty. Add what you have to get recipe matches and tips from the AI.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {items.slice(0, FRIDGE_CHIPS).map((i) => {
                  const status = i.days === null ? "fresh" : expiryStatus(i.days);
                  const tint =
                    status === "fresh"
                      ? "bg-accent text-accent-foreground"
                      : status === "soon"
                      ? "bg-warning/20 text-warning-foreground"
                      : "bg-destructive/15 text-destructive";
                  return (
                    <span key={i.id} className={cn("rounded-full px-3 py-1 text-xs font-medium", tint)}>
                      {categoryEmoji(i.category)} {i.name}
                    </span>
                  );
                })}
                {items.length > FRIDGE_CHIPS && (
                  <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
                    +{items.length - FRIDGE_CHIPS} more
                  </span>
                )}
              </div>
            )}
            <Button variant="outline" className="mt-4 w-full" asChild>
              <Link to="/fridge">{items.length === 0 ? "Add ingredients" : "Update Fridge"}</Link>
            </Button>
          </Card>

          <NutritionCard daily={daily} />
        </div>

        {/* CENTER */}
        <div className="space-y-6">
          <MealsCard daily={daily} />

          {expiring.length > 0 && (
            <div className="rounded-2xl border border-warning/30 bg-warning/10 p-5 shadow-card">
              <div className="flex items-start gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-warning text-warning-foreground">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold">Use these soon</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {expiring
                      .map((e) => (e.days! < 0 ? `${e.name} (expired)` : e.days === 0 ? `${e.name} (today)` : e.name))
                      .join(", ")}{" "}
                    — use them first to avoid waste.
                  </p>
                  <ExpiringAskButton names={expiring.filter((e) => e.days! >= 0).map((e) => e.name)} />
                </div>
              </div>
            </div>
          )}

          <WaterCard />
        </div>

        {/* RIGHT */}
        <div className="space-y-6">
          <FridgeRecipesCard fridgeEmpty={!fridgeLoading && items.length === 0} />
        </div>
      </div>
    </AppShell>
  );
}

function ExpiringAskButton({ names }: { names: string[] }) {
  if (names.length === 0) return null;
  const ask = `What can I cook with ${names.join(", ")} before ${names.length === 1 ? "it goes" : "they go"} off?`;
  return (
    <Button size="sm" className="mt-3" asChild>
      <Link to="/assistant" search={{ ask }}>
        <Sparkles className="mr-1 h-4 w-4" /> Ask the AI what to cook
      </Link>
    </Button>
  );
}

// ── Today's Nutrition ─────────────────────────────────────────────────────────

type DailyLog = ReturnType<typeof useDailyLog>;

function NutritionCard({ daily }: { daily: DailyLog }) {
  const { data: day, isLoading } = daily;
  const targets = day?.targets;
  const eaten = day?.total_calories ?? 0;
  const target = targets?.daily_calories ?? 0;
  const loggedSomething = !!day?.meals.length;

  const macros = [
    { label: "Protein", value: day?.total_protein_g ?? 0, target: targets?.daily_protein_g, color: "bg-primary" },
    { label: "Carbs", value: day?.total_carbs_g ?? 0, target: targets?.daily_carbs_g, color: "bg-secondary" },
    { label: "Fat", value: day?.total_fat_g ?? 0, target: targets?.daily_fat_g, color: "bg-warning" },
    { label: "Fiber", value: day?.total_fiber_g ?? 0, target: targets?.daily_fiber_g, color: "bg-accent" },
  ];
  const donut = target
    ? [
        { name: "Eaten", value: Math.min(eaten, target), fill: eaten > target ? "var(--warning)" : "var(--primary)" },
        { name: "Remaining", value: Math.max(target - eaten, 0), fill: "var(--muted)" },
      ]
    : [{ name: "No target", value: 1, fill: "var(--muted)" }];

  return (
    <Card>
      <CardHeader title="Today's Nutrition" icon={<Flame className="h-4 w-4" />} />
      {isLoading ? (
        <Spinner />
      ) : (
        <>
          <div className="relative mx-auto h-44 w-44">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={donut} dataKey="value" innerRadius={55} outerRadius={75} startAngle={90} endAngle={-270} stroke="none">
                  {donut.map((d, i) => (
                    <Cell key={i} fill={d.fill} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold">{eaten.toLocaleString()}</span>
              <span className="text-xs text-muted-foreground">
                {target ? `/ ${target.toLocaleString()} kcal` : "kcal"}
              </span>
            </div>
          </div>

          {target ? (
            <div className="mt-4 space-y-3">
              {macros.map((m) => (
                <div key={m.label}>
                  <div className="mb-1 flex justify-between text-xs font-medium">
                    <span>{m.label}</span>
                    <span className="text-muted-foreground">
                      {Math.round(m.value)}/{m.target ?? "—"}g
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-muted">
                    <div
                      className={cn("h-full rounded-full transition-all", m.color)}
                      style={{ width: `${m.target ? Math.min((m.value / m.target) * 100, 100) : 0}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-center text-sm text-muted-foreground">
              <Link to="/profile" className="font-semibold text-primary hover:underline">Complete your profile</Link>{" "}
              to get daily calorie and macro targets.
            </p>
          )}

          {/* Recipes and their ingredients come from TheMealDB, which has no nutrition data */}
          {loggedSomething && eaten === 0 && (
            <p className="mt-4 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
              Nutrition data for most recipes and foods isn't available yet, so they count as 0 kcal for now.
            </p>
          )}
        </>
      )}
    </Card>
  );
}

// ── Today's Meals ─────────────────────────────────────────────────────────────

function MealsCard({ daily }: { daily: DailyLog }) {
  const { data: day, isLoading, refetch } = daily;
  const [removingId, setRemovingId] = useState<string | null>(null);

  const entriesFor = (type: MealType): FoodLog[] =>
    day?.meals.find((m) => m.meal_type === type)?.entries ?? [];

  const remove = async (log: FoodLog) => {
    setRemovingId(log.id);
    try {
      await removeFoodLog(log.id);
      await refetch();
    } catch {
      toast.error("Couldn't remove it — please try again");
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <Card>
      <CardHeader
        title="Today's Meals"
        right={
          <Link to="/recipes" className="text-xs font-semibold text-primary hover:underline">
            Log a meal
          </Link>
        }
      />
      {isLoading ? (
        <Spinner />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {MEAL_SLOTS.map((slot) => {
            const entries = entriesFor(slot.type);
            return (
              <div key={slot.type} className="rounded-xl border border-border bg-background p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{slot.label}</div>
                {entries.length === 0 ? (
                  <p className="mt-1 text-sm text-muted-foreground">
                    Nothing logged.{" "}
                    <Link to="/recipes" className="font-medium text-primary hover:underline">Find a recipe</Link>
                  </p>
                ) : (
                  <ul className="mt-1 space-y-1">
                    {entries.map((e) => (
                      <li key={e.id} className="group flex items-start justify-between gap-2">
                        <span className="font-semibold leading-snug">{e.recipe_title || e.food_name}</span>
                        <button
                          onClick={() => remove(e)}
                          disabled={removingId === e.id}
                          className="mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground transition hover:bg-muted hover:text-destructive"
                          aria-label={`Remove ${e.recipe_title || e.food_name}`}
                        >
                          {removingId === e.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {entries.some((e) => Number(e.calories) > 0) && (
                  <span className="mt-2 inline-block rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-accent-foreground">
                    {Math.round(entries.reduce((s, e) => s + Number(e.calories || 0), 0))} kcal
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

// ── Water ─────────────────────────────────────────────────────────────────────

function WaterCard() {
  const { data } = useWater();
  const [cups, setCups] = useState<number | null>(null);
  useEffect(() => {
    if (data) setCups(data.cups);
  }, [data]);

  const tap = async (index: number) => {
    if (cups === null) return;
    const previous = cups;
    const next = index + 1 === cups ? index : index + 1; // tapping the last full cup empties it
    setCups(next); // optimistic: the request takes a moment on a cold backend
    try {
      setCups((await setWater(next)).cups);
    } catch {
      setCups(previous);
      toast.error("Couldn't save your water — please try again");
    }
  };

  return (
    <Card>
      <CardHeader
        title="Water Intake"
        icon={<Droplet className="h-4 w-4" />}
        right={<span className="text-xs text-muted-foreground">{cups ?? "–"}/{WATER_GOAL_CUPS} cups</span>}
      />
      <div className="grid grid-cols-8 gap-1.5">
        {Array.from({ length: WATER_GOAL_CUPS }).map((_, i) => {
          const full = cups !== null && i < cups;
          return (
            <button
              key={i}
              onClick={() => tap(i)}
              disabled={cups === null}
              aria-label={`${i + 1} cup${i ? "s" : ""}`}
              className={cn(
                "grid aspect-square w-full max-w-11 place-items-center rounded-xl border transition",
                full
                  ? "border-secondary bg-secondary/20 text-secondary"
                  : "border-border bg-background text-muted-foreground hover:border-secondary/50"
              )}
            >
              <Droplet className={cn("h-5 w-5", full && "fill-secondary")} />
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">1 cup = 250 ml</p>
    </Card>
  );
}

// ── Recipes ranked by what's in the fridge ────────────────────────────────────

function FridgeRecipesCard({ fridgeEmpty }: { fridgeEmpty: boolean }) {
  // Ranked in SQL by how many of each recipe's ingredients are in the fridge
  const { data, isLoading } = useRecipeSearch("", { sort: "match" });
  const top = (data?.items ?? []).filter((r) => (r.matched_ingredients ?? 0) > 0).slice(0, 3);

  return (
    <Card>
      <CardHeader title="Cook from your fridge" icon={<ChefHat className="h-4 w-4" />} />
      {isLoading ? (
        <Spinner />
      ) : top.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {fridgeEmpty
            ? "Add ingredients to your fridge to see recipes you can make with them."
            : "None of our recipes use your ingredients yet. Try the AI assistant for ideas."}
        </p>
      ) : (
        <div className="space-y-3">
          {top.map((r) => {
            const total = r.total_ingredients ?? 0;
            const matched = r.matched_ingredients ?? 0;
            const minutes = (r.prep_time_min ?? 0) + (r.cook_time_min ?? 0);
            return (
              <div key={r.id} className="overflow-hidden rounded-xl border border-border">
                <div className="relative h-24 bg-accent">
                  {r.image_url && <img src={r.image_url} alt={r.title} className="h-full w-full object-cover" />}
                  <span className="absolute top-2 right-2 rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground">
                    {Math.round((matched / total) * 100)}% match
                  </span>
                </div>
                <div className="p-3">
                  <div className="text-sm font-semibold">{r.title}</div>
                  <div className="mt-1 text-xs font-medium text-secondary">
                    You have {matched} of {total} ingredients
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                    {r.calories_per_serving != null ? (
                      <span className="flex items-center gap-1"><Flame className="h-3 w-3" /> {r.calories_per_serving}</span>
                    ) : (
                      <span />
                    )}
                    {minutes > 0 && (
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {minutes}m</span>
                    )}
                  </div>
                  <Button size="sm" className="mt-3 w-full" asChild>
                    <Link to="/recipes" search={{ recipe: r.id }}>View recipe</Link>
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

// ── Layout helpers ────────────────────────────────────────────────────────────

function Card({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl border border-border bg-card p-5 shadow-card">{children}</div>;
}

function CardHeader({ title, icon, right }: { title: string; icon?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <div className="flex items-center gap-2 font-semibold">
        {icon && <span className="text-primary">{icon}</span>}
        {title}
      </div>
      {right}
    </div>
  );
}

function Spinner() {
  return (
    <div className="grid h-24 place-items-center text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" />
    </div>
  );
}
