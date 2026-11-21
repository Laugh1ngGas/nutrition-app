import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  TrendingDown,
  Dumbbell,
  Scale,
  PiggyBank,
  Recycle,
  ChefHat,
  Clock,
  Plus,
  Minus,
  X,
  ArrowLeft,
  ArrowRight,
  Check,
} from "lucide-react";
import { LanguageSwitch, useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/locales/en";

export const Route = createFileRoute("/onboarding")({ component: Onboarding });

const goals: { id: string; label: MessageKey; icon: typeof Scale }[] = [
  { id: "lose", label: "onb.goal.lose", icon: TrendingDown },
  { id: "muscle", label: "onb.goal.muscle", icon: Dumbbell },
  { id: "maintain", label: "onb.goal.maintain", icon: Scale },
  { id: "save", label: "onb.goal.save", icon: PiggyBank },
  { id: "waste", label: "onb.goal.waste", icon: Recycle },
];

const diets = ["vegetarian", "vegan", "gluten_free", "dairy_free", "keto", "paleo", "none"] as const;
const genders = ["female", "male", "other"] as const;
const skills = ["beginner", "intermediate", "advanced"] as const;
const times = ["under15", "15to30", "30to60", "over60"] as const;

function Onboarding() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [data, setData] = useState({
    // name: "",
    age: "",
    gender: "female",
    height: "",
    weight: "",
    goal: "waste",
    diets: new Set<string>(["none"]),
    allergyInput: "",
    allergies: [] as string[],
    // budget: "",
    people: 2,
    skill: "intermediate",
    time: "15to30",
  });

  const setField = <K extends keyof typeof data>(k: K, v: (typeof data)[K]) =>
    setData((d) => ({ ...d, [k]: v }));

  const toggleDiet = (d: string) => {
    setData((s) => {
      const next = new Set(s.diets);
      next.has(d) ? next.delete(d) : next.add(d);
      return { ...s, diets: next };
    });
  };

  const addAllergy = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && data.allergyInput.trim()) {
      e.preventDefault();
      setData((s) => ({ ...s, allergies: [...s.allergies, s.allergyInput.trim()], allergyInput: "" }));
    }
  };

  const progress = (step / 4) * 100;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-6 py-10">
        <div className="mb-4 flex justify-end">
          <LanguageSwitch />
        </div>
        {/* Progress */}
        <div className="mb-10">
          <div className="mb-2 flex justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <span>{t("onb.step", { step })}</span>
            <span className="text-primary">{t("onb.complete", { n: Math.round(progress) })}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-8 shadow-card">
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold">{t("onb.aboutTitle")}</h1>
                <p className="mt-1 text-sm text-muted-foreground">{t("onb.aboutText")}</p>
              </div>
              <div className="grid gap-4">
                {/* <div>
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" value={data.name} onChange={(e) => setField("name", e.target.value)} placeholder="Alex Johnson" />
                </div> */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="age">{t("onb.age")}</Label>
                    <Input id="age" type="number" value={data.age} onChange={(e) => setField("age", e.target.value)} placeholder="30" />
                  </div>
                  <div>
                    <Label>{t("onb.gender")}</Label>
                    <div className="mt-2 flex gap-2">
                      {genders.map((g) => (
                        <button
                          key={g}
                          type="button"
                          onClick={() => setField("gender", g)}
                          className={cn(
                            "flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition",
                            data.gender === g
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border hover:border-primary/40"
                          )}
                        >
                          {t(`gender.${g}`)}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="height">{t("onb.height")}</Label>
                    <Input id="height" type="number" value={data.height} onChange={(e) => setField("height", e.target.value)} placeholder="170" />
                  </div>
                  <div>
                    <Label htmlFor="weight">{t("onb.weight")}</Label>
                    <Input id="weight" type="number" value={data.weight} onChange={(e) => setField("weight", e.target.value)} placeholder="65" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold">{t("onb.goalTitle")}</h1>
                <p className="mt-1 text-sm text-muted-foreground">{t("onb.goalText")}</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {goals.map((g) => {
                  const active = data.goal === g.id;
                  return (
                    <button
                      key={g.id}
                      onClick={() => setField("goal", g.id)}
                      className={cn(
                        "flex items-center gap-4 rounded-xl border p-4 text-left transition",
                        active
                          ? "border-primary bg-primary/10 ring-2 ring-primary/30"
                          : "border-border hover:border-primary/40"
                      )}
                    >
                      <div className={cn("grid h-11 w-11 place-items-center rounded-xl", active ? "bg-primary text-primary-foreground" : "bg-accent text-primary")}>
                        <g.icon className="h-5 w-5" />
                      </div>
                      <span className="font-semibold">{t(g.label)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold">{t("onb.dietTitle")}</h1>
                <p className="mt-1 text-sm text-muted-foreground">{t("onb.dietText")}</p>
              </div>
              <div>
                <Label>{t("onb.diets")}</Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {diets.map((d) => {
                    const active = data.diets.has(d);
                    return (
                      <button
                        key={d}
                        onClick={() => toggleDiet(d)}
                        className={cn(
                          "rounded-full border px-4 py-2 text-sm font-medium transition",
                          active
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border hover:border-primary/40"
                        )}
                      >
                        {t(`diet.${d}`)}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <Label>{t("onb.allergies")}</Label>
                <Input
                  value={data.allergyInput}
                  onChange={(e) => setField("allergyInput", e.target.value)}
                  onKeyDown={addAllergy}
                  placeholder={t("onb.allergyPlaceholder")}
                />
                {data.allergies.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {data.allergies.map((a, i) => (
                      <span key={i} className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-3 py-1 text-xs font-semibold text-destructive">
                        {a}
                        <button onClick={() => setField("allergies", data.allergies.filter((_, j) => j !== i))}>
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              {/* <div>
                <Label htmlFor="budget">Weekly grocery budget (optional)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">€</span>
                  <Input id="budget" type="number" className="pl-7" value={data.budget} onChange={(e) => setField("budget", e.target.value)} placeholder="80" />
                </div>
              </div> */}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold">{t("onb.householdTitle")}</h1>
                <p className="mt-1 text-sm text-muted-foreground">{t("onb.householdText")}</p>
              </div>
              <div>
                <Label>{t("onb.people")}</Label>
                <div className="mt-2 inline-flex items-center gap-3 rounded-xl border border-border bg-background p-2">
                  <button
                    className="grid h-9 w-9 place-items-center rounded-lg bg-muted hover:bg-accent"
                    onClick={() => setField("people", Math.max(1, data.people - 1))}
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="w-10 text-center text-lg font-bold">{data.people >= 6 ? "6+" : data.people}</span>
                  <button
                    className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
                    onClick={() => setField("people", Math.min(6, data.people + 1))}
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div>
                <Label>{t("onb.skill")}</Label>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {skills.map((s) => {
                    const active = data.skill === s;
                    return (
                      <button
                        key={s}
                        onClick={() => setField("skill", s)}
                        className={cn(
                          "flex flex-col items-center gap-2 rounded-xl border p-4 text-sm font-medium transition",
                          active ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/40"
                        )}
                      >
                        <ChefHat className="h-5 w-5" />
                        {t(`onb.skill.${s}`)}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <Label>{t("onb.time")}</Label>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {times.map((tm) => {
                    const active = data.time === tm;
                    return (
                      <button
                        key={tm}
                        onClick={() => setField("time", tm)}
                        className={cn(
                          "flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-medium transition",
                          active ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/40"
                        )}
                      >
                        <Clock className="h-4 w-4" />
                        {t(`onb.time.${tm}`)}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          <div className="mt-8 flex justify-between gap-3">
            <Button
              variant="outline"
              onClick={() => (step === 1 ? navigate({ to: "/" }) : setStep(step - 1))}
            >
              <ArrowLeft className="mr-1 h-4 w-4" /> {t("common.back")}
            </Button>
            {step < 4 ? (
              <Button onClick={() => setStep(step + 1)}>
                {t("common.continue")} <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={() => navigate({ to: "/dashboard" })}>
                <Check className="mr-1 h-4 w-4" /> {t("onb.finish")}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
