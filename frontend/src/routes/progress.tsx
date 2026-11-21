import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { Flame, Target, ChefHat, PiggyBank, Sparkles, Trophy } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/locales/en";

export const Route = createFileRoute("/progress")({ component: Progress });

// Demo numbers until progress is computed from real logs; index 0 = Monday
const calData = [1850, 2100, 1750, 1920, 2200, 1980, 1700].map((intake) => ({ intake, goal: 2000 }));
const macroBars = [
  { P: 90, C: 180, F: 55 },
  { P: 110, C: 200, F: 60 },
  { P: 95, C: 170, F: 50 },
  { P: 100, C: 190, F: 58 },
  { P: 120, C: 220, F: 65 },
  { P: 105, C: 200, F: 60 },
  { P: 90, C: 160, F: 48 },
];

const RANGES: { id: "week" | "month" | "quarter"; label: MessageKey }[] = [
  { id: "week", label: "progress.week" },
  { id: "month", label: "progress.month" },
  { id: "quarter", label: "progress.quarter" },
];

function Progress() {
  const { t, locale } = useI18n();
  const [range, setRange] = useState<"week" | "month" | "quarter">("week");

  // Short weekday names in the interface language; 2024-01-01 was a Monday
  const weekdays = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) =>
        new Intl.DateTimeFormat(locale, { weekday: "short" }).format(new Date(2024, 0, 1 + i))
      ),
    [locale]
  );
  const calories = calData.map((d, i) => ({ d: weekdays[i], [t("progress.intake")]: d.intake, [t("progress.goal")]: d.goal }));
  const macros = macroBars.map((m, i) => ({
    d: weekdays[i],
    [t("macro.protein")]: m.P,
    [t("macro.carbs")]: m.C,
    [t("macro.fat")]: m.F,
  }));
  const wasteDonut = [
    { name: t("progress.usedInTime"), value: 87, fill: "var(--primary)" },
    { name: t("progress.wasted"), value: 13, fill: "var(--muted)" },
  ];

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("progress.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("progress.subtitle")}</p>
        </div>
        <div className="inline-flex rounded-full border border-border bg-card p-1">
          {RANGES.map((r) => (
            <button
              key={r.id}
              onClick={() => setRange(r.id)}
              className={cn(
                "rounded-full px-4 py-1.5 text-sm font-medium transition",
                range === r.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t(r.label)}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Stat icon={Flame} label={t("progress.avgCalories")} value={(1929).toLocaleString(locale)} />
        <Stat icon={Target} label={t("progress.adherence")} value="84%" tone="primary" />
        <Stat icon={ChefHat} label={t("progress.cooked")} value="18" />
        {/* <Stat icon={PiggyBank} label="Money Saved" value="€42.50" tone="secondary" /> */}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-2xl border border-border bg-card p-5 shadow-card">
          <h3 className="font-semibold">{t("progress.caloriesVsGoal")}</h3>
          <div className="mt-4 h-64">
            <ResponsiveContainer>
              <LineChart data={calories}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="d" stroke="var(--muted-foreground)" fontSize={12} />
                <YAxis stroke="var(--muted-foreground)" fontSize={12} />
                <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }} />
                <Line type="monotone" dataKey={t("progress.goal")} stroke="var(--muted-foreground)" strokeDasharray="4 4" dot={false} />
                <Line type="monotone" dataKey={t("progress.intake")} stroke="var(--primary)" strokeWidth={3} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
          <h3 className="font-semibold">{t("progress.waste")}</h3>
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
              <span className="text-xs text-muted-foreground">{t("progress.usedInTime")}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-card">
        <h3 className="font-semibold">{t("progress.weeklyMacros")}</h3>
        <div className="mt-4 h-64">
          <ResponsiveContainer>
            <BarChart data={macros}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="d" stroke="var(--muted-foreground)" fontSize={12} />
              <YAxis stroke="var(--muted-foreground)" fontSize={12} />
              <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }} />
              <Bar dataKey={t("macro.protein")} fill="var(--primary)" radius={[4, 4, 0, 0]} />
              <Bar dataKey={t("macro.carbs")} fill="var(--secondary)" radius={[4, 4, 0, 0]} />
              <Bar dataKey={t("macro.fat")} fill="var(--warning)" radius={[4, 4, 0, 0]} />
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
          <div className="flex items-center gap-2 font-semibold"><Trophy className="h-4 w-4 text-warning" /> {t("progress.streaks")}</div>
          <div className="mt-4 grid grid-cols-3 gap-3 text-center">
            {([
              { l: "progress.streak.cooking", v: 12 },
              { l: "progress.streak.zeroWaste", v: 6 },
              { l: "progress.streak.goal", v: 5 },
            ] satisfies { l: MessageKey; v: number }[]).map((s) => (
              <div key={s.l} className="rounded-xl bg-accent/40 p-3">
                <div className="text-2xl font-extrabold text-primary">{s.v}</div>
                <div className="text-xs text-muted-foreground">{t(s.l)}</div>
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
