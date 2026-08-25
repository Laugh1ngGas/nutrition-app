import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { ExpiryBadge } from "@/components/fridge/ExpiryBadge";
import { fridgeItems, recipes, expiryStatus, user } from "@/lib/mock-data";
import { Button } from "@/components/ui/button";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import {
  Refrigerator,
  AlertTriangle,
  Sparkles,
  Plus,
  Droplet,
  TrendingUp,
  Clock,
  Flame,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dashboard")({ component: Dashboard });

const macros = [
  { label: "Protein", value: 90, target: 120, color: "bg-primary" },
  { label: "Carbs", value: 180, target: 250, color: "bg-secondary" },
  { label: "Fat", value: 55, target: 70, color: "bg-warning" },
  { label: "Fiber", value: 22, target: 30, color: "bg-accent" },
];

const donut = [
  { name: "Eaten", value: 1450, fill: "var(--primary)" },
  { name: "Remaining", value: 550, fill: "var(--muted)" },
];

const meals = [
  { slot: "Breakfast", recipeId: "r4" },
  { slot: "Lunch", recipeId: "r2" },
  { slot: "Dinner", recipeId: "r1" },
  { slot: "Snack", recipeId: "r3" },
];

function Dashboard() {
  const [water, setWater] = useState(4);
  const expiring = fridgeItems.filter((i) => expiryStatus(i.daysToExpiry) !== "fresh");
  const suggestions = recipes.slice(0, 3);

  return (
    <AppShell>
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Good morning, {user.name.split(" ")[0]} 👋</h1>
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
            <div className="flex flex-wrap gap-2">
              {fridgeItems.slice(0, 6).map((i) => {
                const s = expiryStatus(i.daysToExpiry);
                const tint =
                  s === "fresh"
                    ? "bg-accent text-accent-foreground"
                    : s === "soon"
                    ? "bg-warning/20 text-warning-foreground"
                    : "bg-destructive/15 text-destructive";
                return (
                  <span key={i.id} className={cn("rounded-full px-3 py-1 text-xs font-medium", tint)}>
                    {i.emoji} {i.name}
                  </span>
                );
              })}
            </div>
            <Button variant="outline" className="mt-4 w-full" asChild>
              <Link to="/fridge">Update Fridge</Link>
            </Button>
          </Card>

          <Card>
            <CardHeader title="Today's Nutrition" icon={<Flame className="h-4 w-4" />} />
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
                <span className="text-2xl font-bold">1,450</span>
                <span className="text-xs text-muted-foreground">/ 2,000 kcal</span>
              </div>
            </div>
            <div className="mt-4 space-y-3">
              {macros.map((m) => (
                <div key={m.label}>
                  <div className="mb-1 flex justify-between text-xs font-medium">
                    <span>{m.label}</span>
                    <span className="text-muted-foreground">{m.value}/{m.target}g</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted">
                    <div className={cn("h-full rounded-full transition-all", m.color)} style={{ width: `${(m.value / m.target) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* CENTER */}
        <div className="space-y-6">
          <Card>
            <CardHeader title="Today's Meals" />
            <div className="grid gap-3 sm:grid-cols-2">
              {meals.map((m) => {
                const r = recipes.find((x) => x.id === m.recipeId)!;
                return (
                  <div key={m.slot} className="rounded-xl border border-border bg-background p-4">
                    <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {m.slot}
                    </div>
                    <div className="mt-1 font-semibold">{r.name}</div>
                    <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="rounded-full bg-accent px-2 py-0.5 font-semibold text-accent-foreground">{r.kcal} kcal</span>
                      <span>{r.usesIds.length} ingredients</span>
                    </div>
                    <Button size="sm" variant="ghost" className="mt-3 -ml-2 text-primary">Change</Button>
                  </div>
                );
              })}
            </div>
          </Card>

          <div className="rounded-2xl border border-warning/30 bg-warning/10 p-5 shadow-card">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-warning text-warning-foreground">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold">Using ingredients expiring soon</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {expiring.map((e) => e.name).join(", ")} — use these first to avoid waste.
                </p>
                <Button size="sm" className="mt-3">
                  <Sparkles className="mr-1 h-4 w-4" /> Plan meals around these
                </Button>
              </div>
            </div>
          </div>

          <Card>
            <CardHeader title="Water Intake" icon={<Droplet className="h-4 w-4" />} right={<span className="text-xs text-muted-foreground">{water}/8 cups</span>} />
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <button
                  key={i}
                  onClick={() => setWater(i + 1 === water ? i : i + 1)}
                  className={cn(
                    "grid h-11 w-11 place-items-center rounded-xl border transition",
                    i < water
                      ? "border-secondary bg-secondary/20 text-secondary"
                      : "border-border bg-background text-muted-foreground hover:border-secondary/50"
                  )}
                >
                  <Droplet className={cn("h-5 w-5", i < water && "fill-secondary")} />
                </button>
              ))}
            </div>
          </Card>
        </div>

        {/* RIGHT */}
        <div className="space-y-6">
          <Card>
            <CardHeader title="AI Suggestions" icon={<Sparkles className="h-4 w-4" />} />
            <div className="space-y-3">
              {suggestions.map((r) => (
                <div key={r.id} className="overflow-hidden rounded-xl border border-border">
                  <div className="relative h-24 bg-accent">
                    <img src={r.image} alt={r.name} className="h-full w-full object-cover" />
                    <span className="absolute top-2 right-2 rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground">
                      {r.match}% match
                    </span>
                  </div>
                  <div className="p-3">
                    <div className="font-semibold text-sm">{r.name}</div>
                    <div className="mt-1 text-xs font-medium text-secondary">
                      Uses {r.usesIds.length}/{fridgeItems.length} of your ingredients
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Flame className="h-3 w-3" /> {r.kcal}</span>
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {r.prepMin}m</span>
                    </div>
                    <Button size="sm" className="mt-3 w-full">
                      <Plus className="mr-1 h-3.5 w-3.5" /> Add to Plan
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* <Card>
            <CardHeader title="This Week's Savings" icon={<TrendingUp className="h-4 w-4" />} />
            <div className="space-y-4">
              <div>
                <div className="text-3xl font-extrabold text-primary">€42.50</div>
                <div className="text-xs text-muted-foreground">saved vs. eating out</div>
              </div>
              <div className="h-px bg-border" />
              <div>
                <div className="text-3xl font-extrabold text-secondary">12</div>
                <div className="text-xs text-muted-foreground">ingredients used before expiry</div>
              </div>
            </div>
          </Card> */}
        </div>
      </div>
    </AppShell>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-border bg-card p-5 shadow-card">{children}</div>;
}
function CardHeader({ title, icon, right }: { title: string; icon?: React.ReactNode; right?: React.ReactNode }) {
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
// re-export so we can also use ExpiryBadge if needed
export { ExpiryBadge };
