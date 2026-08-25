import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  Leaf,
  Refrigerator,
  Recycle,
  ShoppingCart,
  Sparkles,
  ArrowRight,
  Quote,
} from "lucide-react";

export const Route = createFileRoute("/")({
  component: Landing,
  head: () => ({
    meta: [
      { title: "NutritionApp — Plan Smarter, Waste Less, Eat Better" },
      {
        name: "description",
        content:
          "AI-powered meal planning that turns the ingredients in your fridge into delicious meals and an automated shopping list.",
      },
    ],
  }),
});

const features = [
  { icon: Refrigerator, title: "Cook What You Have", desc: "Recipes generated from what's already in your fridge." },
  { icon: Recycle, title: "Zero Waste Planning", desc: "Use ingredients before they expire — automatically." },
  { icon: ShoppingCart, title: "Auto Shopping List", desc: "A weekly grocery list built from your meal plan." },
  { icon: Sparkles, title: "AI Personalization", desc: "Learns your taste, goals, and cooking style over time." },
];

const testimonials = [
  { name: "Maya R.", role: "Busy parent", quote: "I throw out 80% less food. The shopping lists alone are worth it." },
  { name: "Daniel K.", role: "Home cook", quote: "It finds meals I never would've thought of from random fridge stuff." },
  { name: "Priya S.", role: "Wellness coach", quote: "Macros, prep time, and budget — all handled in one calm interface." },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link to="/" className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground">
              <Leaf className="h-5 w-5" />
            </div>
            <span className="text-lg font-bold tracking-tight">NutritionApp</span>
          </Link>
          <nav className="hidden gap-8 text-sm font-medium text-muted-foreground md:flex">
            <a href="#features" className="hover:text-foreground">Features</a>
            <a href="#how" className="hover:text-foreground">How it works</a>
            <a href="#testimonials" className="hover:text-foreground">Reviews</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/dashboard" className="text-sm font-medium text-muted-foreground hover:text-foreground">
              Sign in
            </Link>
            <Button asChild>
              <Link to="/sign-up">Get Started</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,theme(colors.accent/40),transparent_60%)]" />
        <div className="mx-auto max-w-6xl px-6 py-20 lg:py-28 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-card px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary shadow-card">
            <Sparkles className="h-3.5 w-3.5" /> AI Meal Planning
          </span>
          <h1 className="mx-auto mt-6 max-w-3xl text-5xl font-extrabold leading-[1.05] tracking-tight md:text-6xl">
            Plan Smarter.{" "}
            <span className="text-primary">Waste Less.</span> Eat Better.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            AI-powered meal planning based on the ingredients you already have.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg" className="rounded-full px-7">
              <Link to="/sign-up">
                Get Started Free <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="rounded-full px-7">
              <a href="#how">See How It Works</a>
            </Button>
          </div>

          {/* Visual mock */}
          <div className="mx-auto mt-16 max-w-4xl rounded-2xl border border-border bg-card p-6 shadow-card-lg">
            <div className="grid gap-4 md:grid-cols-3">
              {["🥦 Broccoli", "🍗 Chicken", "🥚 Eggs", "🧄 Garlic", "🥬 Spinach", "🧀 Cheddar"].map((t) => (
                <div key={t} className="rounded-xl bg-background px-4 py-3 text-left text-sm font-medium">
                  {t}
                  <div className="mt-1 text-xs text-muted-foreground">in your fridge</div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between rounded-xl bg-primary px-5 py-4 text-primary-foreground">
              <div className="text-left text-sm">
                <div className="font-semibold">Today's plan generated</div>
                <div className="opacity-80">3 meals · 94% ingredient match · €0 needed</div>
              </div>
              <Sparkles className="h-5 w-5" />
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-6xl px-6 py-20">
        <div className="mb-12 max-w-2xl">
          <h2 className="text-3xl font-bold md:text-4xl">Everything your kitchen needs</h2>
          <p className="mt-3 text-muted-foreground">From fridge to fork to grocery cart — automated.</p>
        </div>
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <div
              key={f.title}
              className="group rounded-2xl border border-border bg-card p-6 shadow-card transition hover:-translate-y-1 hover:shadow-card-lg"
            >
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-accent text-primary">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-5 text-lg font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="bg-accent/30 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-bold md:text-4xl">How it works</h2>
            <p className="mt-3 text-muted-foreground">Three steps to a smarter kitchen.</p>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {[
              { n: "1", t: "Add your ingredients", d: "Snap, type, or import. We track expiry dates for you." },
              { n: "2", t: "Get an AI meal plan", d: "Personalized recipes from what you already own." },
              { n: "3", t: "Auto-generate your list", d: "One-tap grocery list for what you're missing." },
            ].map((s) => (
              <div key={s.n} className="relative rounded-2xl bg-card p-7 shadow-card">
                <div className="grid h-12 w-12 place-items-center rounded-full bg-primary text-xl font-bold text-primary-foreground">
                  {s.n}
                </div>
                <h3 className="mt-5 text-lg font-semibold">{s.t}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" className="mx-auto max-w-6xl px-6 py-20">
        <div className="mb-12 text-center">
          <h2 className="text-3xl font-bold md:text-4xl">Loved by mindful eaters</h2>
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          {testimonials.map((t) => (
            <div key={t.name} className="rounded-2xl border border-border bg-card p-7 shadow-card">
              <Quote className="h-6 w-6 text-secondary" />
              <p className="mt-4 text-sm leading-relaxed">{t.quote}</p>
              <div className="mt-6 flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-full bg-accent font-semibold text-accent-foreground">
                  {t.name[0]}
                </div>
                <div>
                  <div className="text-sm font-semibold">{t.name}</div>
                  <div className="text-xs text-muted-foreground">{t.role}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-border bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-8 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="grid h-7 w-7 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Leaf className="h-4 w-4" />
            </div>
            <span className="font-semibold text-foreground">NutritionApp</span>
          </div>
          <nav className="flex gap-6">
            <a href="#features" className="hover:text-foreground">Features</a>
            <a href="#how" className="hover:text-foreground">How it works</a>
            <Link to="/dashboard" className="hover:text-foreground">Dashboard</Link>
          </nav>
          <span>© 2026 NutritionApp</span>
        </div>
      </footer>
    </div>
  );
}
