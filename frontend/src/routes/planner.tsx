import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
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
import { Clock, GripVertical, Loader2, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { isAxiosError } from "axios";
import { cn } from "@/lib/utils";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  currentWeekStart,
  generateMealPlanWeek,
  getMealPlanWeek,
  localDate,
  rearrangeMealPlan,
} from "@/integrations/api/hooks";
import type { MealPlanEntry, MealPlanWeek, PlanSlot } from "@/integrations/api/types";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/planner")({ component: Planner });

const SLOTS: PlanSlot[] = ["breakfast", "lunch", "dinner"];

// What is being dragged, and what it is dropped on
type DragData = { kind: "meal"; entryId: string } | { kind: "day"; date: string };
type DropData = { kind: "slot"; date: string; slot: PlanSlot } | { kind: "day"; date: string };
type Move = { id: string; planned_date: string; meal_type: PlanSlot };

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return localDate(new Date(y, m - 1, d + days));
}

function parseDate(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// Day and date labels in the interface language
function useDateFormat() {
  const { locale } = useI18n();
  return (date: string, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, options).format(parseDate(date));
}

// A meal is only dropped on meal slots, a day only on day columns; the pointer
// decides first so nested droppables (slots inside days) don't compete
const collision: CollisionDetection = (args) => {
  const wanted = (args.active.data.current as DragData).kind === "meal" ? "slot" : "day";
  const droppableContainers = args.droppableContainers.filter(
    (c) => (c.data.current as DropData | undefined)?.kind === wanted
  );
  const hits = pointerWithin({ ...args, droppableContainers });
  return hits.length ? hits : rectIntersection({ ...args, droppableContainers });
};

// The server's own message when it sent one, otherwise the given fallback
function errorMessage(err: unknown, fallback: string): string {
  const message = isAxiosError(err) ? (err.response?.data as { message?: string } | undefined)?.message : undefined;
  return message || fallback;
}

function Planner() {
  const { t } = useI18n();
  const fmt = useDateFormat();
  const weekStart = useMemo(currentWeekStart, []);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const today = localDate();
  const [plan, setPlan] = useState<MealPlanWeek | null>(null);
  const [status, setStatus] = useState<"loading" | "generating" | "ready" | "error">("loading");
  const [selected, setSelected] = useState(days.includes(today) ? today : days[0]);
  const [dragging, setDragging] = useState<DragData | null>(null);

  // Mouse: drag after 5 px. Touch: press and hold, so the page still scrolls
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } })
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let week = await getMealPlanWeek(weekStart);
        if (!week) {
          // First visit this week: generate it straight away
          setStatus("generating");
          week = await generateMealPlanWeek(weekStart);
        }
        if (!cancelled) {
          setPlan(week);
          setStatus("ready");
        }
      } catch (err) {
        if (!cancelled) {
          setStatus("error");
          toast.error(errorMessage(err, t("planner.loadError")));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart]);

  const entryAt = (date: string, slot: PlanSlot) =>
    plan?.entries.find((e) => e.planned_date === date && e.meal_type === slot);

  const regenerate = async () => {
    setStatus("generating");
    try {
      setPlan(await generateMealPlanWeek(weekStart));
      toast.success(t("planner.regenDone"));
    } catch (err) {
      toast.error(errorMessage(err, t("planner.regenError")));
    } finally {
      setStatus("ready");
    }
  };

  // Shown at once, then saved; if saving fails the plan goes back as it was
  const save = async (moves: Move[]) => {
    if (!plan) return;
    const previous = plan;
    setPlan({
      ...plan,
      entries: plan.entries.map((e) => {
        const move = moves.find((m) => m.id === e.id);
        return move ? { ...e, planned_date: move.planned_date, meal_type: move.meal_type } : e;
      }),
    });
    try {
      setPlan(await rearrangeMealPlan(plan.id, moves));
    } catch (err) {
      setPlan(previous);
      toast.error(errorMessage(err, t("planner.saveError")));
    }
  };

  const onDragStart = (e: DragStartEvent) => setDragging(e.active.data.current as DragData);

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragging(null);
    if (!over || !plan) return;
    const from = active.data.current as DragData;
    const to = over.data.current as DropData;

    if (from.kind === "meal" && to.kind === "slot") {
      // Meal onto a slot: they swap (or the meal just moves, if the slot is empty)
      const entry = plan.entries.find((e) => e.id === from.entryId);
      if (!entry || (entry.planned_date === to.date && entry.meal_type === to.slot)) return;
      const target = entryAt(to.date, to.slot);
      const moves: Move[] = [{ id: entry.id, planned_date: to.date, meal_type: to.slot }];
      if (target) moves.push({ id: target.id, planned_date: entry.planned_date, meal_type: entry.meal_type });
      save(moves);
    } else if (from.kind === "day" && to.kind === "day" && from.date !== to.date) {
      // Day onto a day: all their meals swap; the day names stay in order
      save(
        plan.entries
          .filter((e) => e.planned_date === from.date || e.planned_date === to.date)
          .map((e) => ({
            id: e.id,
            meal_type: e.meal_type,
            planned_date: e.planned_date === from.date ? to.date : from.date,
          }))
      );
    }
  };

  const dragged =
    dragging?.kind === "meal" ? plan?.entries.find((e) => e.id === dragging.entryId) : undefined;
  const busy = status === "loading" || status === "generating";

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("planner.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {fmt(days[0], { day: "numeric", month: "short" })} – {fmt(days[6], { day: "numeric", month: "short", year: "numeric" })}
            {" · "}
            {t("planner.hint")}
          </p>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button disabled={busy}>
              {status === "generating" ? <Loader2 className="animate-spin" /> : <RefreshCw />} {t("planner.regenerate")}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("planner.regenTitle")}</AlertDialogTitle>
              <AlertDialogDescription>{t("planner.regenText")}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
              <AlertDialogAction onClick={regenerate}>{t("planner.regenConfirm")}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {status === "error" && !plan ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center text-sm text-muted-foreground">
          {t("planner.loadFailed")}
        </div>
      ) : !plan ? (
        <div className="grid h-64 place-items-center rounded-2xl border border-border bg-card text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            {status === "generating" ? t("planner.generating") : t("planner.loading")}
          </div>
        </div>
      ) : (
        <>
          <DndContext
            sensors={sensors}
            collisionDetection={collision}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onDragCancel={() => setDragging(null)}
          >
            <div className={cn("grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7", status === "generating" && "opacity-50")}>
              {days.map((date) => (
                <DayColumn
                  key={date}
                  date={date}
                  isToday={date === today}
                  selected={date === selected}
                  onSelect={() => setSelected(date)}
                  kcal={dayCalories(SLOTS.map((slot) => entryAt(date, slot)))}
                  goal={plan?.daily_calories ?? null}
                >
                  {SLOTS.map((slot) => (
                    <MealSlot key={slot} date={date} slot={slot} entry={entryAt(date, slot)} />
                  ))}
                </DayColumn>
              ))}
            </div>
            <DragOverlay dropAnimation={null}>
              {dragged ? (
                <div className="rounded-lg border border-primary bg-card px-2.5 py-1.5 text-xs font-medium shadow-lg">
                  {dragged.title}
                </div>
              ) : dragging?.kind === "day" ? (
                // w-max: the overlay box gets the size of the dragged grip icon
                <div className="w-max rounded-2xl border border-primary bg-card px-4 py-3 text-sm font-bold capitalize shadow-lg">
                  {fmt(dragging.date, { weekday: "long" })}
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>

          <DayDetail
            date={selected}
            entries={SLOTS.map((slot) => entryAt(selected, slot))}
            goal={plan?.daily_calories ?? null}
          />
        </>
      )}
    </AppShell>
  );
}

// The day's planned calories (each meal's portion); null if none are known
function dayCalories(entries: (MealPlanEntry | undefined)[]): number | null {
  const known = entries.filter((e) => e?.calories != null);
  return known.length ? known.reduce((sum, e) => sum + (e!.calories ?? 0), 0) : null;
}

// "2,716" in English, "2 716" in Ukrainian, whatever the browser's own locale
const numberLocale = (lang: string) => (lang === "uk" ? "uk-UA" : "en-US");

// Within 10% of the goal counts as on target (same as the generator)
const onTarget = (kcal: number, goal: number) => Math.abs(kcal - goal) <= goal * 0.1;

function DayColumn({
  date,
  isToday,
  selected,
  onSelect,
  kcal,
  goal,
  children,
}: {
  date: string;
  isToday: boolean;
  selected: boolean;
  onSelect: () => void;
  kcal: number | null;
  goal: number | null;
  children: ReactNode;
}) {
  const { t, lang } = useI18n();
  const fmt = useDateFormat();
  const data: DropData & DragData = { kind: "day", date };
  const { setNodeRef: dropRef, isOver } = useDroppable({ id: `day:${date}`, data });
  const { setNodeRef: handleRef, attributes, listeners, isDragging } = useDraggable({ id: `day-handle:${date}`, data });

  return (
    <div
      ref={dropRef}
      onClick={onSelect}
      data-day={date}
      className={cn(
        "cursor-pointer rounded-2xl border bg-card p-3 shadow-card transition",
        selected ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-primary/30",
        isOver && "border-primary bg-primary/5",
        isDragging && "opacity-50"
      )}
    >
      <div className="flex items-start justify-between gap-1">
        <div>
          <div className={cn("font-bold capitalize", selected && "text-primary")}>{fmt(date, { weekday: "short" })}</div>
          <div className="whitespace-nowrap text-xs text-muted-foreground">{fmt(date, { day: "numeric", month: "short" })}</div>
        </div>
        <div className="flex items-center gap-1">
          {isToday && (
            <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold uppercase text-primary">
              {t("common.today")}
            </span>
          )}
          <button
            ref={handleRef}
            {...attributes}
            {...listeners}
            onClick={(e) => e.stopPropagation()}
            aria-label={t("planner.dragDay", { day: fmt(date, { weekday: "long" }) })}
            className="cursor-grab touch-none rounded p-0.5 text-muted-foreground hover:bg-muted active:cursor-grabbing"
          >
            <GripVertical className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="mt-3 space-y-2">{children}</div>
      {kcal != null && (
        <div
          data-day-kcal={kcal}
          className={cn(
            "mt-2 text-center text-xs font-medium",
            goal ? (onTarget(kcal, goal) ? "text-success" : "text-warning-foreground") : "text-muted-foreground"
          )}
        >
          {t("planner.dayKcal", { kcal: kcal.toLocaleString(numberLocale(lang)) })}
        </div>
      )}
    </div>
  );
}

function MealSlot({ date, slot, entry }: { date: string; slot: PlanSlot; entry?: MealPlanEntry }) {
  const { t } = useI18n();
  const { setNodeRef: dropRef, isOver } = useDroppable({
    id: `slot:${date}|${slot}`,
    data: { kind: "slot", date, slot } satisfies DropData,
  });
  const { setNodeRef: dragRef, attributes, listeners, isDragging } = useDraggable({
    id: `meal:${entry?.id ?? `${date}|${slot}`}`,
    data: { kind: "meal", entryId: entry?.id ?? "" } satisfies DragData,
    disabled: !entry,
  });
  const label = t(`meal.${slot}`);

  return (
    <div ref={dropRef} data-slot={`${date}|${slot}`} className={cn("rounded-lg transition", isOver && "ring-2 ring-primary")}>
      <div
        ref={dragRef}
        {...attributes}
        {...listeners}
        title={entry ? t("planner.dragMeal", { slot: label, title: entry.title }) : label}
        className={cn(
          "flex min-h-12 gap-1.5 rounded-lg bg-background px-2.5 py-1.5 text-xs",
          entry && "cursor-grab active:cursor-grabbing",
          isOver && "bg-primary/5",
          isDragging && "opacity-40"
        )}
      >
        <span className="font-semibold uppercase text-muted-foreground">{t(`meal.short.${slot}`)}</span>
        <span className={cn("line-clamp-2", !entry && "text-muted-foreground")}>{entry?.title ?? "—"}</span>
      </div>
    </div>
  );
}

function DayDetail({
  date,
  entries,
  goal,
}: {
  date: string;
  entries: (MealPlanEntry | undefined)[];
  goal: number | null;
}) {
  const { t, lang } = useI18n();
  const fmt = useDateFormat();
  const planned = entries.filter((e): e is MealPlanEntry => !!e);
  const total = planned.reduce((s, e) => s + e.total_ingredients, 0);
  const matched = planned.reduce((s, e) => s + e.matched_ingredients, 0);
  const coverage = total ? Math.round((matched / total) * 100) : 0;
  const kcal = dayCalories(entries);
  const kcalShare = goal && kcal != null ? Math.min(100, Math.round((kcal / goal) * 100)) : 0;

  return (
    <div className="mt-8 rounded-2xl border border-border bg-card p-6 shadow-card">
      <h2 className="text-lg font-bold first-letter:uppercase">{fmt(date, { weekday: "long", day: "numeric", month: "long" })}</h2>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {SLOTS.map((slot, i) => {
          const e = entries[i];
          const minutes = (e?.prep_time_min ?? 0) + (e?.cook_time_min ?? 0);
          return (
            <div key={slot} className="overflow-hidden rounded-xl border border-border bg-background">
              {e?.image_url ? (
                <img src={e.image_url} alt="" className="h-28 w-full object-cover" />
              ) : (
                <div className="h-28 w-full bg-muted" />
              )}
              <div className="p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t(`meal.${slot}`)}</div>
                <div className="mt-1 font-semibold">{e?.title ?? t("planner.nothing")}</div>
                {e && (
                  <>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="font-medium text-secondary">
                        {t("common.youHave", { matched: e.matched_ingredients, total: e.total_ingredients })}
                      </span>
                      {minutes > 0 && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" /> {t("common.minutes", { n: minutes })}
                        </span>
                      )}
                      {e.calories != null && (
                        <span data-meal-kcal={e.calories}>
                          {e.calories.toLocaleString(numberLocale(lang))} {t("common.kcal")}
                          {e.servings !== 1 && <> · {t("planner.portion", { n: e.servings })}</>}
                        </span>
                      )}
                    </div>
                    <Button size="sm" variant="outline" className="mt-3 w-full" asChild>
                      <Link to="/recipes" search={{ recipe: e.recipe_id }}>{t("common.viewRecipe")}</Link>
                    </Button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {kcal != null && (
        <div className="mt-6 rounded-xl bg-muted/60 p-4">
          <div className="mb-1 flex justify-between text-xs font-medium">
            <span>{t("planner.dayCalories")}</span>
            <span data-day-total={kcal}>
              {goal
                ? t("planner.kcalOfGoal", { kcal: kcal.toLocaleString(numberLocale(lang)), goal: goal.toLocaleString(numberLocale(lang)) })
                : t("planner.dayKcal", { kcal: kcal.toLocaleString(numberLocale(lang)) })}
            </span>
          </div>
          {goal ? (
            <div className="h-2 rounded-full bg-card">
              <div
                className={cn("h-full rounded-full transition-all", onTarget(kcal, goal) ? "bg-success" : "bg-warning")}
                style={{ width: `${kcalShare}%` }}
              />
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              {t("planner.noGoal")}{" "}
              <Link to="/profile" className="font-medium text-primary hover:underline">{t("planner.setGoal")}</Link>
            </p>
          )}
        </div>
      )}

      <div className="mt-3 rounded-xl bg-accent/40 p-4">
        <div className="mb-1 flex justify-between text-xs font-medium">
          <span>{t("planner.coverage")}</span>
          <span>{matched}/{total} · {coverage}%</span>
        </div>
        <div className="h-2 rounded-full bg-card">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${coverage}%` }} />
        </div>
      </div>
    </div>
  );
}
