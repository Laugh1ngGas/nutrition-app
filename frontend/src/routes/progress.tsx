import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { Flame, Target, ChefHat, PiggyBank, Sparkles, Trophy } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/progress")({ component: Progress });

const calData = [
  { d: "Mon", intake: 1850, goal: 2000 },
  { d: "Tue", intake: 2100, goal: 2000 },
  { d: "Wed", intake: 1750, goal: 2000 },
  { d: "Thu", intake: 1920, goal: 2000 },
  { d: "Fri", intake: 2200, goal: 2000 },
  { d: "Sat", intake: 1980, goal: 2000 },
  { d: "Sun", intake: 1700, goal: 2000 },
];
const macroBars = [
  { d: "Mon", P: 90, C: 180, F: 55 },
  { d: "Tue", P: 110, C: 200, F: 60 },
  { d: "Wed", P: 95, C: 170, F: 50 },
  { d: "Thu", P: 100, C: 190, F: 58 },
  { d: "Fri", P: 120, C: 220, F: 65 },
  { d: "Sat", P: 105, C: 200, F: 60 },
  { d: "Sun", P: 90, C: 160, F: 48 },
];
const wasteDonut = [
  { name: "Used in time", value: 87, fill: "var(--primary)" },
  { name: "Wasted", value: 13, fill: "var(--muted)" },
];

function Progress() {
  const [range, setRange] = useState<"Week" | "Month" | "3 Months">("Week");
  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Progress & Analytics</h1>
          <p className="mt-1 text-sm text-muted-foreground">Your habits over time.</p>
        </div>
        <div className="inline-flex rounded-full border border-border bg-card p-1">
          {(["Week", "Month", "3 Months"] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={cn(
                "rounded-full px-4 py-1.5 text-sm font-medium transition",
                range === r ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Stat icon={Flame} label="Avg Daily Calories" value="1,929" />
        <Stat icon={Target} label="Goal Adherence" value="84%" tone="primary" />
        <Stat icon={ChefHat} label="Meals Cooked" value="18" />
        {/* <Stat icon={PiggyBank} label="Money Saved" value="€42.50" tone="secondary" /> */}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-2xl border border-border bg-card p-5 shadow-card">
          <h3 className="font-semibold">Calorie intake vs goal</h3>
          <div className="mt-4 h-64">
            <ResponsiveContainer>
              <LineChart data={calData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="d" stroke="var(--muted-foreground)" fontSize={12} />
                <YAxis stroke="var(--muted-foreground)" fontSize={12} />
                <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }} />
                <Line type="monotone" dataKey="goal" stroke="var(--muted-foreground)" strokeDasharray="4 4" dot={false} />
                <Line type="monotone" dataKey="intake" stroke="var(--primary)" strokeWidth={3} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
          <h3 className="font-semibold">Ingredient waste reduction</h3>
          <div className="relative mt-4 h-48">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={wasteDonut} dataKey="value" innerRadius={55} outerRadius={75} stroke="none">
                  {wasteDonut.map((d, i) => <Cell key={i} fill={d.fill} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold text-primary">87%</span>
              <span className="text-xs text-muted-foreground">used in time</span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-card">
        <h3 className="font-semibold">Weekly macros</h3>
        <div className="mt-4 h-64">
          <ResponsiveContainer>
            <BarChart data={macroBars}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="d" stroke="var(--muted-foreground)" fontSize={12} />
              <YAxis stroke="var(--muted-foreground)" fontSize={12} />
              <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }} />
              <Bar dataKey="P" fill="var(--primary)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="C" fill="var(--secondary)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="F" fill="var(--warning)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-1">
        {/* <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5 shadow-card">
          <div className="flex items-center gap-2 text-primary font-semibold">
            <Sparkles className="h-4 w-4" /> AI Weekly Insight
          </div>
          <p className="mt-3 text-sm text-foreground">
            You hit your calorie goal 5 out of 7 days this week and saved <strong>€42.50</strong>. Try prepping breakfast on Sundays — you tend to overshoot on Friday lunches.
          </p>
        </div> */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
          <div className="flex items-center gap-2 font-semibold"><Trophy className="h-4 w-4 text-warning" /> Streaks</div>
          <div className="mt-4 grid grid-cols-3 gap-3 text-center">
            {[
              { l: "Cooking", v: 12 },
              { l: "Zero-waste", v: 6 },
              { l: "Goal hit", v: 5 },
            ].map((s) => (
              <div key={s.l} className="rounded-xl bg-accent/40 p-3">
                <div className="text-2xl font-extrabold text-primary">{s.v}</div>
                <div className="text-xs text-muted-foreground">{s.l} days</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function Stat({ icon: Icon, label, value, tone }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; tone?: "primary" | "secondary" }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
      <div className={cn(
        "grid h-10 w-10 place-items-center rounded-xl",
        tone === "primary" ? "bg-primary text-primary-foreground" : tone === "secondary" ? "bg-secondary text-secondary-foreground" : "bg-accent text-primary"
      )}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="mt-4 text-2xl font-bold">{value}</div>
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}
