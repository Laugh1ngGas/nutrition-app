import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { weekDays, mealPlan, recipes } from "@/lib/mock-data";
import { Sparkles, Plus, FileDown, ShoppingCart } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, horizontalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export const Route = createFileRoute("/planner")({ component: Planner });

function Planner() {
  const [days, setDays] = useState(weekDays);
  const [active, setActive] = useState("Mon");
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const onDragEnd = (e: DragEndEvent) => {
    const { active: a, over } = e;
    if (!over || a.id === over.id) return;
    const oldIdx = days.indexOf(a.id as string);
    const newIdx = days.indexOf(over.id as string);
    const next = [...days];
    next.splice(oldIdx, 1);
    next.splice(newIdx, 0, a.id as string);
    setDays(next);
  };

  const activePlan = mealPlan[active as keyof typeof mealPlan];
  const totalKcal = (["breakfast", "lunch", "dinner"] as const).reduce(
    (s, k) => s + (recipes.find((r) => r.id === activePlan?.[k])?.kcal ?? 0),
    0
  );

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Meal Planner</h1>
          <p className="mt-1 text-sm text-muted-foreground">Drag days to reorder. Tap a day to inspect.</p>
        </div>
        <Button>
          <Sparkles className="mr-1 h-4 w-4" /> Regenerate Week with AI
        </Button>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={days} strategy={horizontalListSortingStrategy}>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
            {days.map((d) => (
              <DayCell key={d} day={d} active={active === d} onClick={() => setActive(d)} />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {/* Day detail */}
      <div className="mt-8 rounded-2xl border border-border bg-card p-6 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold">{active} · Detail</h2>
          <div className="flex gap-2">
            <Button variant="outline" size="sm"><FileDown className="mr-1 h-4 w-4" /> Export PDF</Button>
            <Button size="sm" className="bg-secondary text-secondary-foreground hover:bg-secondary/90"><ShoppingCart className="mr-1 h-4 w-4" /> Generate Shopping List</Button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {(["breakfast", "lunch", "dinner"] as const).map((slot) => {
            const r = recipes.find((x) => x.id === activePlan?.[slot]);
            return (
              <div key={slot} className="rounded-xl border border-border bg-background p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{slot}</div>
                <div className="mt-1 font-semibold">{r?.name ?? "Empty"}</div>
                <div className="mt-2 text-xs text-muted-foreground">{r?.kcal} kcal · {r?.prepMin}m</div>
              </div>
            );
          })}
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-4 rounded-xl bg-accent/40 p-4">
          <div>
            <div className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">Total today</div>
            <div className="text-xl font-bold">{totalKcal} kcal</div>
          </div>
          <div className="ml-auto flex-1 min-w-[200px]">
            <div className="mb-1 flex justify-between text-xs font-medium">
              <span>Fridge coverage</span><span>87%</span>
            </div>
            <div className="h-2 rounded-full bg-card">
              <div className="h-full w-[87%] rounded-full bg-primary" />
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function DayCell({ day, active, onClick }: { day: string; active: boolean; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: day });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const plan = mealPlan[day as keyof typeof mealPlan];
  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onClick}
      className={cn(
        "rounded-2xl border bg-card p-4 shadow-card cursor-pointer transition",
        active ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-primary/30"
      )}
    >
      <div className="flex items-center justify-between">
        <span className={cn("font-bold", active && "text-primary")}>{day}</span>
        <span {...attributes} {...listeners} className="cursor-grab text-muted-foreground touch-none">⋮⋮</span>
      </div>
      <div className="mt-3 space-y-2">
        {(["breakfast", "lunch", "dinner"] as const).map((slot) => {
          const r = recipes.find((x) => x.id === plan?.[slot]);
          return (
            <div key={slot} className="rounded-lg bg-background px-2.5 py-1.5 text-xs">
              <span className="font-semibold uppercase text-muted-foreground mr-1.5">{slot[0]}</span>
              {r ? <span className="truncate">{r.name}</span> : (
                <span className="text-muted-foreground inline-flex items-center gap-1"><Plus className="h-3 w-3" />Empty</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
