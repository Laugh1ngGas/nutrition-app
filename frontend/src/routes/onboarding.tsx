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

export const Route = createFileRoute("/onboarding")({ component: Onboarding });

const goals = [
  { id: "lose", label: "Lose Weight", icon: TrendingDown },
  { id: "muscle", label: "Gain Muscle", icon: Dumbbell },
  { id: "maintain", label: "Maintain Weight", icon: Scale },
  { id: "save", label: "Save Money", icon: PiggyBank },
  { id: "waste", label: "Reduce Food Waste", icon: Recycle },
];

const diets = ["Vegetarian", "Vegan", "Gluten-Free", "Dairy-Free", "Keto", "Paleo", "No restrictions"];
const skills = ["Beginner", "Intermediate", "Advanced"];
const times = ["<15 min", "15–30 min", "30–60 min", "60+ min"];

function Onboarding() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [data, setData] = useState({
    // name: "",
    age: "",
    gender: "female",
    height: "",
    weight: "",
    goal: "waste",
    diets: new Set<string>(["No restrictions"]),
    allergyInput: "",
    allergies: [] as string[],
    // budget: "",
    people: 2,
    skill: "Intermediate",
    time: "15–30 min",
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
        {/* Progress */}
        <div className="mb-10">
          <div className="mb-2 flex justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <span>Step {step} of 4</span>
            <span className="text-primary">{Math.round(progress)}% complete</span>
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
                <h1 className="text-2xl font-bold">Tell us about yourself</h1>
                <p className="mt-1 text-sm text-muted-foreground">Helps us calculate your nutrition targets.</p>
              </div>
              <div className="grid gap-4">
                {/* <div>
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" value={data.name} onChange={(e) => setField("name", e.target.value)} placeholder="Alex Johnson" />
                </div> */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="age">Age</Label>
                    <Input id="age" type="number" value={data.age} onChange={(e) => setField("age", e.target.value)} placeholder="30" />
                  </div>
                  <div>
                    <Label>Gender</Label>
                    <div className="mt-2 flex gap-2">
                      {["female", "male", "other"].map((g) => (
                        <button
                          key={g}
                          type="button"
                          onClick={() => setField("gender", g)}
                          className={cn(
                            "flex-1 rounded-lg border px-3 py-2 text-sm font-medium capitalize transition",
                            data.gender === g
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border hover:border-primary/40"
                          )}
                        >
                          {g}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="height">Height (cm)</Label>
                    <Input id="height" type="number" value={data.height} onChange={(e) => setField("height", e.target.value)} placeholder="170" />
                  </div>
                  <div>
                    <Label htmlFor="weight">Weight (kg)</Label>
                    <Input id="weight" type="number" value={data.weight} onChange={(e) => setField("weight", e.target.value)} placeholder="65" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold">What's your goal?</h1>
                <p className="mt-1 text-sm text-muted-foreground">Pick the one that matters most right now.</p>
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
                      <span className="font-semibold">{g.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold">Dietary preferences</h1>
                <p className="mt-1 text-sm text-muted-foreground">Anything we should know?</p>
              </div>
              <div>
                <Label>Diets</Label>
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
                        {d}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <Label>Allergies</Label>
                <Input
                  value={data.allergyInput}
                  onChange={(e) => setField("allergyInput", e.target.value)}
                  onKeyDown={addAllergy}
                  placeholder="Type an allergy and press Enter"
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
                <h1 className="text-2xl font-bold">Your household</h1>
                <p className="mt-1 text-sm text-muted-foreground">So we plan the right portions.</p>
              </div>
              <div>
                <Label>People in household</Label>
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
                <Label>Cooking skill</Label>
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
                        {s}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <Label>Preferred cooking time</Label>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {times.map((t) => {
                    const active = data.time === t;
                    return (
                      <button
                        key={t}
                        onClick={() => setField("time", t)}
                        className={cn(
                          "flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-medium transition",
                          active ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/40"
                        )}
                      >
                        <Clock className="h-4 w-4" />
                        {t}
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
              <ArrowLeft className="mr-1 h-4 w-4" /> Back
            </Button>
            {step < 4 ? (
              <Button onClick={() => setStep(step + 1)}>
                Continue <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={() => navigate({ to: "/dashboard" })}>
                <Check className="mr-1 h-4 w-4" /> Complete Setup
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
