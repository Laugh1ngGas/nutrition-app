import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, Legend,
} from "recharts";
import { Flame, Utensils, CalendarCheck, Droplet, Trophy, Loader2 } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { useProgress } from "@/integrations/api/hooks";
import type { ProgressDay } from "@/integrations/api/types";
import type { MessageKey } from "@/locales/en";

export const Route = createFileRoute("/progress")({ component: Progress });

const RANGES: { days: number; label: MessageKey }[] = [
  { days: 7, label: "progress.week" },
  { days: 30, label: "progress.month" },
  { days: 90, label: "progress.quarter" },
];
const CUP_ML = 250;
// Longer ranges are charted as weekly averages so the bars stay readable
const DAILY_UP_TO = 31;

type Point = { label: string; calories: number; protein: number; carbs: number; fat: number; cups: number };

const parseDate = (date: string) => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d);
};

function toPoints(days: ProgressDay[], label: (date: string) => string): Point[] {
  const groups = days.length > DAILY_UP_TO
    ? Array.from({ length: Math.ceil(days.length / 7) }, (_, i) => days.slice(i * 7, i * 7 + 7))
    : days.map((d) => [d]);
  return groups.map((g) => {
    const avg = (pick: (d: ProgressDay) => number) => Math.round(g.reduce((s, d) => s + pick(d), 0) / g.length);
    return {
      label: label(g[0].date),
      calories: avg((d) => d.calories),
      protein: avg((d) => d.protein_g),
      carbs: avg((d) => d.carbs_g),
      fat: avg((d) => d.fat_g),
      cups: Math.round((g.reduce((s, d) => s + d.water_ml, 0) / g.length / CUP_ML) * 10) / 10,
    };
  });
}

const tooltipStyle = { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 };

function Progress() {
  const { t, locale } = useI18n();
  const [range, setRange] = useState(7);
  const { data, isLoading } = useProgress(range);

  const fmt = (date: string, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, options).format(parseDate(date));

  const stats = useMemo(() => {
    if (!data) return null;
    const logged = data.days.filter((d) => d.meals > 0);
    const withCalories = logged.filter((d) => d.calories > 0);
    const target = data.targets.daily_calories;
    const water = data.days.reduce((s, d) => s + d.water_ml, 0);
    return {
      meals: data.days.reduce((s, d) => s + d.meals, 0),
      // Recipes have no calorie data yet, so 0 kcal days would drag this down
      avgCalories: withCalories.length
        ? Math.round(withCalories.reduce((s, d) => s + d.calories, 0) / withCalories.length)
        : null,
      adherence: target && withCalories.length
        ? Math.round((withCalories.filter((d) => Math.abs(d.calories - target) <= target * 0.1).length / withCalories.length) * 100)
        : null,
      missingCalories: logged.length > 0 && withCalories.length === 0,
      plan: data.plan.planned ? Math.round((data.plan.followed / data.plan.planned) * 100) : null,
      avgCups: Math.round((water / data.days.length / CUP_ML) * 10) / 10,
      empty: logged.length === 0 && water === 0,
    };
  }, [data]);

  const points = useMemo(
    () => (data ? toPoints(data.days, (d) => fmt(d, range <= 7 ? { weekday: "short" } : { day: "numeric", month: "short" })) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, locale, range]
  );

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
              key={r.days}
              onClick={() => setRange(r.days)}
              className={cn(
                "rounded-full px-4 py-1.5 text-sm font-medium transition",
                range === r.days ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t(r.label)}
            </button>
          ))}
        </div>
      </div>

      {isLoading || !data || !stats ? (
        <div className="grid h-64 place-items-center text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <>
          {stats.empty && (
            <div className="mb-6 rounded-2xl border border-dashed border-border bg-card p-5 text-sm text-muted-foreground">
              {t("progress.empty")}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat icon={Flame} label={t("progress.avgCalories")} value={stats.avgCalories?.toLocaleString(locale) ?? "—"} />
            <Stat icon={Utensils} label={t("progress.meals")} value={String(stats.meals)} />
            <Stat icon={CalendarCheck} label={t("progress.planFollowed")} value={stats.plan != null ? `${stats.plan}%` : "—"} tone="primary" />
            <Stat icon={Droplet} label={t("progress.avgWater")} value={t("progress.cups", { n: stats.avgCups.toLocaleString(locale) })} />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <ChartCard title={t("progress.caloriesVsGoal")} className="lg:col-span-2">
              <div className="h-64">
                <ResponsiveContainer>
                  <LineChart data={points}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={12} />
                    <YAxis stroke="var(--muted-foreground)" fontSize={12} />
                    <Tooltip contentStyle={tooltipStyle} />
                    {data.targets.daily_calories && (
                      <ReferenceLine
                        y={data.targets.daily_calories}
                        // Stay visible while logged calories are far below it. yAxisId must
                        // be explicit: React 19 ignores recharts' defaultProps, and without
                        // it the axis doesn't extend its range to the line
                        yAxisId={0}
                        ifOverflow="extendDomain"
                        stroke="var(--muted-foreground)"
                        strokeDasharray="4 4"
                        label={{ value: t("progress.goal"), position: "insideTopRight", fontSize: 11, fill: "var(--muted-foreground)" }}
                      />
                    )}
                    <Line type="monotone" dataKey="calories" name={t("progress.intake")} stroke="var(--primary)" strokeWidth={3} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              {stats.adherence != null && (
                <p className="mt-2 text-xs text-muted-foreground">{t("progress.adherence", { n: stats.adherence })}</p>
              )}
              {stats.missingCalories && (
                <p className="mt-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">{t("dash.nutrition.noData")}</p>
              )}
            </ChartCard>

            <ChartCard title={t("progress.planTitle")}>
              {data.plan.planned ? (
                <>
                  <div className="relative h-48">
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie
                          data={[
                            { value: data.plan.followed, fill: "var(--primary)" },
                            { value: data.plan.planned - data.plan.followed, fill: "var(--muted)" },
                          ]}
                          dataKey="value"
                          innerRadius={55}
                          outerRadius={75}
                          startAngle={90}
                          endAngle={-270}
                          stroke="none"
                        >
                          <Cell fill="var(--primary)" />
                          <Cell fill="var(--muted)" />
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 grid place-items-center">
                      <span className="text-2xl font-bold text-primary">{stats.plan}%</span>
                    </div>
                  </div>
                  <p className="text-center text-xs text-muted-foreground">
                    {t("progress.planText", { followed: data.plan.followed, planned: data.plan.planned })}
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">{t("progress.noPlan")}</p>
              )}
            </ChartCard>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <ChartCard title={t("progress.macros")}>
              <div className="h-64">
                <ResponsiveContainer>
                  <BarChart data={points}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={12} />
                    <YAxis stroke="var(--muted-foreground)" fontSize={12} unit={` ${t("unit.g")}`} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="protein" name={t("macro.protein")} fill="var(--primary)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="carbs" name={t("macro.carbs")} fill="var(--secondary)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="fat" name={t("macro.fat")} fill="var(--warning)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard title={t("progress.water")}>
              <div className="h-64">
                <ResponsiveContainer>
                  <BarChart data={points}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={12} />
                    <YAxis stroke="var(--muted-foreground)" fontSize={12} allowDecimals={false} domain={[0, 10]} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <ReferenceLine y={data.water_goal_ml / CUP_ML} stroke="var(--muted-foreground)" strokeDasharray="4 4" />
                    <Bar dataKey="cups" name={t("progress.water")} fill="var(--secondary)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <ChartCard title={t("progress.weight")} className="lg:col-span-2">
              {data.weight.entries.length ? (
                <div className="h-56">
                  <ResponsiveContainer>
                    <LineChart data={data.weight.entries.map((e) => ({ ...e, label: fmt(e.date, { day: "numeric", month: "short" }) }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={12} />
                      <YAxis
                        stroke="var(--muted-foreground)"
                        fontSize={12}
                        domain={[
                          (min: number) => Math.floor(Math.min(min, data.weight.target ?? min) - 2),
                          (max: number) => Math.ceil(Math.max(max, data.weight.target ?? max) + 2),
                        ]}
                      />
                      <Tooltip contentStyle={tooltipStyle} />
                      {data.weight.target && (
                        <ReferenceLine
                          y={data.weight.target}
                          yAxisId={0}
                          ifOverflow="extendDomain"
                          stroke="var(--secondary)"
                          strokeDasharray="4 4"
                          label={{ value: t("progress.goal"), position: "insideTopRight", fontSize: 11, fill: "var(--muted-foreground)" }}
                        />
                      )}
                      <Line type="monotone" dataKey="weight_kg" name={t("progress.weight")} stroke="var(--primary)" strokeWidth={3} dot={{ r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t("progress.noWeight")}</p>
              )}
            </ChartCard>

            <ChartCard title={t("progress.streaks")} icon={<Trophy className="h-4 w-4 text-warning" />}>
              <div className="grid gap-3">
                {([
                  { label: "progress.streak.logging", value: data.streaks.logging },
                  { label: "progress.streak.best", value: data.streaks.logging_best },
                  { label: "progress.streak.water", value: data.streaks.water },
                ] satisfies { label: MessageKey; value: number }[]).map((s) => (
                  <div key={s.label} className="flex items-center gap-3 rounded-xl bg-accent/40 p-3">
                    <div className="w-10 text-center text-2xl font-extrabold text-primary">{s.value}</div>
                    <div className="text-xs text-muted-foreground">{t(s.label)}</div>
                  </div>
                ))}
              </div>
            </ChartCard>
          </div>
        </>
      )}
    </AppShell>
  );
}

function ChartCard({ title, icon, className, children }: { title: string; icon?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <div className={cn("rounded-2xl border border-border bg-card p-5 shadow-card", className)}>
      <h3 className="mb-4 flex items-center gap-2 font-semibold">{icon}{title}</h3>
      {children}
    </div>
  );
}

function Stat({ icon: Icon, label, value, tone }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; tone?: "primary" }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
      <div className={cn("grid h-10 w-10 place-items-center rounded-xl", tone === "primary" ? "bg-primary text-primary-foreground" : "bg-accent text-primary")}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="mt-4 text-2xl font-bold">{value}</div>
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}
