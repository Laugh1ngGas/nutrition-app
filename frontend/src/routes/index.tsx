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
import { LanguageSwitch, useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/locales/en";

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

const features: { icon: typeof Leaf; title: MessageKey; desc: MessageKey }[] = [
  { icon: Refrigerator, title: "landing.f1.title", desc: "landing.f1.text" },
  { icon: Recycle, title: "landing.f2.title", desc: "landing.f2.text" },
  { icon: ShoppingCart, title: "landing.f3.title", desc: "landing.f3.text" },
  { icon: Sparkles, title: "landing.f4.title", desc: "landing.f4.text" },
];

const steps: { n: string; title: MessageKey; desc: MessageKey }[] = [
  { n: "1", title: "landing.s1.title", desc: "landing.s1.text" },
  { n: "2", title: "landing.s2.title", desc: "landing.s2.text" },
  { n: "3", title: "landing.s3.title", desc: "landing.s3.text" },
];

const mockFridge: MessageKey[] = [
  "landing.mock.broccoli",
  "landing.mock.chicken",
  "landing.mock.eggs",
  "landing.mock.garlic",
  "landing.mock.spinach",
  "landing.mock.cheddar",
];

const testimonials: { name: string; role: MessageKey; quote: MessageKey }[] = [
  { name: "Maya R.", role: "landing.r1.role", quote: "landing.r1.quote" },
  { name: "Daniel K.", role: "landing.r2.role", quote: "landing.r2.quote" },
  { name: "Priya S.", role: "landing.r3.role", quote: "landing.r3.quote" },
];

function Landing() {
  const { t } = useI18n();
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-6">
          <Link to="/" className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground">
              <Leaf className="h-5 w-5" />
            </div>
            <span className="hidden text-lg font-bold tracking-tight sm:inline">NutritionApp</span>
          </Link>
          <nav className="hidden gap-8 text-sm font-medium text-muted-foreground md:flex">
            <a href="#features" className="hover:text-foreground">{t("landing.features")}</a>
            <a href="#how" className="hover:text-foreground">{t("landing.how")}</a>
            <a href="#testimonials" className="hover:text-foreground">{t("landing.reviews")}</a>
          </nav>
          <div className="flex items-center gap-2">
            <LanguageSwitch />
            <Link to="/sign-in" className="text-sm font-medium text-muted-foreground hover:text-foreground">
              {t("landing.signIn")}
            </Link>
            <Button asChild>
              <Link to="/sign-up">{t("landing.getStarted")}</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,theme(colors.accent/40),transparent_60%)]" />
        <div className="mx-auto max-w-6xl px-6 py-20 lg:py-28 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-card px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary shadow-card">
            <Sparkles className="h-3.5 w-3.5" /> {t("landing.badge")}
          </span>
          <h1 className="mx-auto mt-6 max-w-3xl text-5xl font-extrabold leading-[1.05] tracking-tight md:text-6xl">
            {t("landing.hero1")}{" "}
            <span className="text-primary">{t("landing.hero2")}</span> {t("landing.hero3")}
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">{t("landing.heroText")}</p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg" className="rounded-full px-7">
              <Link to="/sign-up">
                {t("landing.getStartedFree")} <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="rounded-full px-7">
              <a href="#how">{t("landing.seeHow")}</a>
            </Button>
          </div>

          {/* Visual mock */}
          <div className="mx-auto mt-16 max-w-4xl rounded-2xl border border-border bg-card p-6 shadow-card-lg">
            <div className="grid gap-4 md:grid-cols-3">
              {mockFridge.map((key) => (
                <div key={key} className="rounded-xl bg-background px-4 py-3 text-left text-sm font-medium">
                  {t(key)}
                  <div className="mt-1 text-xs text-muted-foreground">{t("landing.inFridge")}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between rounded-xl bg-primary px-5 py-4 text-primary-foreground">
              <div className="text-left text-sm">
                <div className="font-semibold">{t("landing.planReady")}</div>
                <div className="opacity-80">{t("landing.planStats")}</div>
              </div>
              <Sparkles className="h-5 w-5" />
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-6xl px-6 py-20">
        <div className="mb-12 max-w-2xl">
          <h2 className="text-3xl font-bold md:text-4xl">{t("landing.featuresTitle")}</h2>
          <p className="mt-3 text-muted-foreground">{t("landing.featuresText")}</p>
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
              <h3 className="mt-5 text-lg font-semibold">{t(f.title)}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{t(f.desc)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="bg-accent/30 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-bold md:text-4xl">{t("landing.howTitle")}</h2>
            <p className="mt-3 text-muted-foreground">{t("landing.howText")}</p>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {steps.map((s) => (
              <div key={s.n} className="relative rounded-2xl bg-card p-7 shadow-card">
                <div className="grid h-12 w-12 place-items-center rounded-full bg-primary text-xl font-bold text-primary-foreground">
                  {s.n}
                </div>
                <h3 className="mt-5 text-lg font-semibold">{t(s.title)}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{t(s.desc)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" className="mx-auto max-w-6xl px-6 py-20">
        <div className="mb-12 text-center">
          <h2 className="text-3xl font-bold md:text-4xl">{t("landing.reviewsTitle")}</h2>
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          {testimonials.map((r) => (
            <div key={r.name} className="rounded-2xl border border-border bg-card p-7 shadow-card">
              <Quote className="h-6 w-6 text-secondary" />
              <p className="mt-4 text-sm leading-relaxed">{t(r.quote)}</p>
              <div className="mt-6 flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-full bg-accent font-semibold text-accent-foreground">
                  {r.name[0]}
                </div>
                <div>
                  <div className="text-sm font-semibold">{r.name}</div>
                  <div className="text-xs text-muted-foreground">{t(r.role)}</div>
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
            <a href="#features" className="hover:text-foreground">{t("landing.features")}</a>
            <a href="#how" className="hover:text-foreground">{t("landing.how")}</a>
            <Link to="/dashboard" className="hover:text-foreground">{t("nav.dashboard")}</Link>
          </nav>
          <span>© 2026 NutritionApp</span>
        </div>
      </footer>
    </div>
  );
}
