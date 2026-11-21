import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  TrendingDown,
  TrendingUp,
  Dumbbell,
  Scale,
  Salad,
  ChefHat,
  Clock,
  Plus,
  Minus,
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
} from "lucide-react";
import { LanguageSwitch, useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth-context";
import { allergenLabel } from "@/lib/allergens";
import { useAllergens, useProfile, updateProfile, updateUserAllergens } from "@/integrations/api/hooks";
import type {
  ActivityLevel,
  CookingSkill,
  CookingTime,
  DietType,
  Gender,
  UserGoal,
} from "@/integrations/api/types";

export const Route = createFileRoute("/onboarding")({ component: Onboarding });

// The same choices the profile stores, so every answer is saved
const goals: { id: UserGoal; icon: typeof Scale }[] = [
  { id: "weight_loss", icon: TrendingDown },
  { id: "weight_gain", icon: TrendingUp },
  { id: "muscle_gain", icon: Dumbbell },
  { id: "maintenance", icon: Scale },
  { id: "healthy_eating", icon: Salad },
];
const activities: ActivityLevel[] = ["sedentary", "lightly_active", "moderately_active", "very_active", "extra_active"];
const diets: DietType[] = [
  "standard", "vegetarian", "vegan", "pescatarian", "gluten_free", "dairy_free", "keto", "paleo", "halal", "kosher",
];
const genders: Gender[] = ["female", "male", "other"];
const skills: CookingSkill[] = ["beginner", "intermediate", "advanced"];
const times: CookingTime[] = ["under15", "15to30", "30to60", "over60"];

type Errors = Partial<Record<"age" | "height" | "weight", string>>;

const inRange = (value: string, min: number, max: number) => {
  const n = Number(value);
  return value.trim() !== "" && Number.isFinite(n) && n >= min && n <= max;
};

// The profile stores a birth date; half a year back from the exact
// anniversary so the backend's age calculation lands on the age entered
function birthDateForAge(age: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - age);
  d.setDate(d.getDate() - 182);
  return d.toISOString().slice(0, 10);
}

function ageFromBirthDate(date: string): string {
  const years = (Date.now() - new Date(date).getTime()) / (365.25 * 86_400_000);
  return String(Math.floor(years));
}

function Onboarding() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { isAuthenticated, hydrated } = useAuth();
  const { data: profile } = useProfile();
  const { data: allergenList } = useAllergens();
  const [step, setStep] = useState(1);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState({
    age: "",
    gender: "female" as Gender,
    height: "",
    weight: "",
    goal: "maintenance" as UserGoal,
    activity: "moderately_active" as ActivityLevel,
    diet: "standard" as DietType,
    allergens: new Set<string>(),
    people: 2,
    skill: "intermediate" as CookingSkill,
    time: "15to30" as CookingTime,
  });

  // Onboarding saves to the account, so it needs one
  useEffect(() => {
    if (hydrated && !isAuthenticated) navigate({ to: "/sign-in" });
  }, [hydrated, isAuthenticated, navigate]);

  // Coming back to it shows what is already saved
  useEffect(() => {
    if (!profile) return;
    setData((d) => ({
      ...d,
      age: profile.date_of_birth ? ageFromBirthDate(profile.date_of_birth) : d.age,
      gender: profile.gender ?? d.gender,
      height: profile.height_cm != null ? String(Number(profile.height_cm)) : d.height,
      weight: profile.weight_kg != null ? String(Number(profile.weight_kg)) : d.weight,
      goal: profile.goal ?? d.goal,
      activity: profile.activity_level ?? d.activity,
      diet: profile.diet_type ?? d.diet,
      allergens: new Set(profile.allergens ?? []),
      people: profile.household_size ?? d.people,
      skill: profile.cooking_skill ?? d.skill,
      time: profile.cooking_time ?? d.time,
    }));
  }, [profile]);

  const setField = <K extends keyof typeof data>(k: K, v: (typeof data)[K]) =>
    setData((d) => ({ ...d, [k]: v }));

  const toggleAllergen = (name: string) =>
    setData((s) => {
      const next = new Set(s.allergens);
      next.has(name) ? next.delete(name) : next.add(name);
      return { ...s, allergens: next };
    });

  // Age, height and weight drive the calorie targets, so they're required
  const validateStep1 = () => {
    const next: Errors = {};
    if (!inRange(data.age, 13, 100)) next.age = t("onb.ageError");
    if (!inRange(data.height, 100, 250)) next.height = t("onb.heightError");
    if (!inRange(data.weight, 30, 300)) next.weight = t("onb.weightError");
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const goNext = () => {
    if (step === 1 && !validateStep1()) return;
    setStep(step + 1);
  };

  const finish = async () => {
    setSaving(true);
    try {
      await updateProfile({
        date_of_birth: birthDateForAge(Number(data.age)),
        gender: data.gender,
        height_cm: Number(data.height),
        weight_kg: Number(data.weight),
        goal: data.goal,
        activity_level: data.activity,
        diet_type: data.diet,
        household_size: data.people,
        cooking_skill: data.skill,
        cooking_time: data.time,
      });
      if (allergenList) {
        await updateUserAllergens(allergenList.filter((a) => data.allergens.has(a.name)).map((a) => a.id));
      }
      toast.success(t("onb.saved"));
      navigate({ to: "/dashboard" });
    } catch {
      toast.error(t("onb.saveError"));
    } finally {
      setSaving(false);
    }
  };

  const progress = (step / 4) * 100;
  const choice = (active: boolean) =>
    active ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/40";

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
            <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${progress}%` }} />
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
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="age">{t("onb.age")}</Label>
                    <Input id="age" type="number" value={data.age} onChange={(e) => setField("age", e.target.value)} placeholder="30" className={cn(errors.age && "border-destructive")} />
                    {errors.age && <p className="mt-1 text-xs text-destructive">{errors.age}</p>}
                  </div>
                  <div>
                    <Label>{t("onb.gender")}</Label>
                    <div className="mt-2 flex gap-2">
                      {genders.map((g) => (
                        <button
                          key={g}
                          type="button"
                          onClick={() => setField("gender", g)}
                          className={cn("flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition", choice(data.gender === g))}
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
                    <Input id="height" type="number" value={data.height} onChange={(e) => setField("height", e.target.value)} placeholder="170" className={cn(errors.height && "border-destructive")} />
                    {errors.height && <p className="mt-1 text-xs text-destructive">{errors.height}</p>}
                  </div>
                  <div>
                    <Label htmlFor="weight">{t("onb.weight")}</Label>
                    <Input id="weight" type="number" value={data.weight} onChange={(e) => setField("weight", e.target.value)} placeholder="65" className={cn(errors.weight && "border-destructive")} />
                    {errors.weight && <p className="mt-1 text-xs text-destructive">{errors.weight}</p>}
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
                        active ? "border-primary bg-primary/10 ring-2 ring-primary/30" : "border-border hover:border-primary/40"
                      )}
                    >
                      <div className={cn("grid h-11 w-11 place-items-center rounded-xl", active ? "bg-primary text-primary-foreground" : "bg-accent text-primary")}>
                        <g.icon className="h-5 w-5" />
                      </div>
                      <span className="font-semibold">{t(`goal.${g.id}`)}</span>
                    </button>
                  );
                })}
              </div>
              <div>
                <Label>{t("onb.activity")}</Label>
                <div className="mt-2 grid gap-2">
                  {activities.map((a) => (
                    <button
                      key={a}
                      onClick={() => setField("activity", a)}
                      className={cn("rounded-xl border px-4 py-2.5 text-left text-sm font-medium transition", choice(data.activity === a))}
                    >
                      {t(`activity.${a}`)}
                    </button>
                  ))}
                </div>
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
                  {diets.map((d) => (
                    <button
                      key={d}
                      onClick={() => setField("diet", d)}
                      className={cn(
                        "rounded-full border px-4 py-2 text-sm font-medium transition",
                        data.diet === d ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary/40"
                      )}
                    >
                      {/* "standard" reads better as "No restrictions" here */}
                      {d === "standard" ? t("diet.none") : t(`diet.${d}`)}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label>{t("onb.allergies")}</Label>
                <p className="mt-1 text-xs text-muted-foreground">{t("onb.allergiesText")}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(allergenList ?? []).map((a) => {
                    const active = data.allergens.has(a.name);
                    return (
                      <button
                        key={a.id}
                        onClick={() => toggleAllergen(a.name)}
                        className={cn(
                          "rounded-full border px-4 py-2 text-sm font-medium transition",
                          active ? "border-destructive bg-destructive/10 text-destructive" : "border-border hover:border-primary/40"
                        )}
                      >
                        {allergenLabel(a.name, t)}
                      </button>
                    );
                  })}
                </div>
              </div>
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
                  {skills.map((s) => (
                    <button
                      key={s}
                      onClick={() => setField("skill", s)}
                      className={cn("flex flex-col items-center gap-2 rounded-xl border p-4 text-sm font-medium transition", choice(data.skill === s))}
                    >
                      <ChefHat className="h-5 w-5" />
                      {t(`onb.skill.${s}`)}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label>{t("onb.time")}</Label>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {times.map((tm) => (
                    <button
                      key={tm}
                      onClick={() => setField("time", tm)}
                      className={cn("flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-medium transition", choice(data.time === tm))}
                    >
                      <Clock className="h-4 w-4" />
                      {t(`onb.time.${tm}`)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="mt-8 flex justify-between gap-3">
            <Button
              variant="outline"
              disabled={saving}
              onClick={() => (step === 1 ? navigate({ to: "/" }) : setStep(step - 1))}
            >
              <ArrowLeft className="mr-1 h-4 w-4" /> {t("common.back")}
            </Button>
            {step < 4 ? (
              <Button onClick={goNext}>
                {t("common.continue")} <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={finish} disabled={saving}>
                {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />}
                {saving ? t("onb.saving") : t("onb.finish")}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
