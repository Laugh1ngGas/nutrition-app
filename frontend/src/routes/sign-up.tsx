import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Leaf, Mail, Lock, Eye, EyeOff, Loader2, AlertCircle, CheckCircle2, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { OAuthButton } from "@/routes/sign-in";

export const Route = createFileRoute("/sign-up")({ component: SignUp });

function strengthScore(pw: string): 0 | 1 | 2 | 3 | 4 {
  if (!pw) return 0;
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return Math.min(s, 4) as 0 | 1 | 2 | 3 | 4;
}

const STRENGTH = [
  { label: "", color: "" },
  { label: "Weak",   color: "bg-[#EF4444]" },
  { label: "Fair",   color: "bg-[#F59E0B]" },
  { label: "Good",   color: "bg-[#86EFAC]" },
  { label: "Strong", color: "bg-primary"   },
] as const;

function SignUp() {
  const { isAuthenticated, hydrated, signUp } = useAuth();
  const navigate = useNavigate();

  const [first, setFirst]       = useState("");
  const [last, setLast]         = useState("");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm]   = useState("");
  const [show, setShow]         = useState(false);
  const [terms, setTerms]       = useState(false);
  const [errors, setErrors]     = useState<Record<string, string>>({});
  const [status, setStatus]     = useState<"idle" | "loading" | "success">("idle");

  useEffect(() => {
    if (hydrated && isAuthenticated && status === "idle") navigate({ to: "/dashboard" });
  }, [hydrated, isAuthenticated, navigate, status]);

  const score = useMemo(() => strengthScore(password), [password]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();

    // Валідація
    const next: Record<string, string> = {};
    if (!first)   next.first    = "Required";
    if (!last)    next.last     = "Required";
    if (!email)   next.email    = "This field is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) next.email = "Please enter a valid email address";
    if (password.length < 8)    next.password = "Password must be at least 8 characters";
    if (confirm !== password)   next.confirm  = "Passwords do not match";
    if (!terms)                 next.terms    = "You must accept the terms to continue";
    setErrors(next);
    if (Object.keys(next).length) return;

    setStatus("loading");
    try {
      await signUp(email, password, first, last);
      setStatus("success");
    } catch (err: unknown) {
      const apiError = err as { response?: { data?: { message?: string } } };
      const message = apiError?.response?.data?.message || "Registration failed. Please try again.";

      if (message.toLowerCase().includes("email already")) {
        setErrors({ banner: "An account with this email already exists." });
      } else {
        setErrors({ banner: message });
      }
      setStatus("idle");
    }
  };

  if (status === "success") {
    return <SuccessScreen email={email} />;
  }

  return (
    <div className="min-h-screen w-full bg-[linear-gradient(135deg,#F0FAF4_0%,#E8F5EE_100%)] px-4 py-10">
      <div className="mx-auto flex w-full max-w-[480px] flex-col items-center">
        <Link to="/" className="flex items-center gap-2">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary text-primary-foreground shadow-card">
            <Leaf className="h-6 w-6" />
          </div>
          <span className="text-2xl font-bold tracking-tight">NutritionApp</span>
        </Link>
        <p className="mt-2 text-sm text-muted-foreground">Your smart kitchen companion</p>

        <div className="mt-6 w-full animate-in fade-in slide-in-from-bottom-4 duration-300 rounded-2xl border border-border bg-card p-6 sm:p-10 shadow-[0_8px_32px_rgba(0,0,0,0.08)]">
          <h1 className="text-2xl font-bold">Create your account</h1>
          <p className="mt-1 text-sm text-muted-foreground">Start planning smarter meals today — it's free</p>

          {errors.banner && (
            <div className="mt-5 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{errors.banner}</span>
            </div>
          )}

          <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
            <div className="grid grid-cols-2 gap-3">
              <NameField label="First name" value={first} onChange={setFirst} error={errors.first} />
              <NameField label="Last name"  value={last}  onChange={setLast}  error={errors.last}  />
            </div>

            <div>
              <Label htmlFor="su-email">Email</Label>
              <div className="relative mt-1.5">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="su-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={cn("pl-9", errors.email && "border-destructive")}
                  placeholder="you@example.com"
                />
              </div>
              {errors.email && <p className="mt-1 text-xs text-destructive">{errors.email}</p>}
            </div>

            <div>
              <Label htmlFor="su-pw">Password</Label>
              <div className="relative mt-1.5">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="su-pw"
                  type={show ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={cn("pl-9 pr-10", errors.password && "border-destructive")}
                  placeholder="At least 8 characters"
                />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:text-foreground"
                >
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <StrengthBar score={score} />
              {errors.password && <p className="mt-1 text-xs text-destructive">{errors.password}</p>}
            </div>

            <div>
              <Label htmlFor="su-cpw">Confirm password</Label>
              <div className="relative mt-1.5">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="su-cpw"
                  type={show ? "text" : "password"}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className={cn("pl-9", errors.confirm && "border-destructive")}
                />
              </div>
              {errors.confirm && <p className="mt-1 text-xs text-destructive">{errors.confirm}</p>}
            </div>

            <div className="flex items-start gap-2 pt-1">
              <Checkbox id="terms" checked={terms} onCheckedChange={(v) => setTerms(!!v)} className="mt-0.5" />
              <label htmlFor="terms" className="text-sm text-muted-foreground leading-relaxed">
                I agree to the <a className="underline text-foreground" href="#">Terms of Service</a> and{" "}
                <a className="underline text-foreground" href="#">Privacy Policy</a>
              </label>
            </div>
            {errors.terms && (
              <div className="rounded-md border border-[#F59E0B]/40 bg-[#F59E0B]/10 px-3 py-2 text-xs text-[#92400E]">
                {errors.terms}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={status !== "idle"}>
              {status === "loading"
                ? (<><Loader2 className="h-4 w-4 animate-spin" /> Creating account...</>)
                : "Create Account"}
            </Button>
          </form>

          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs uppercase tracking-wider text-muted-foreground">or continue with</span>
            <div className="h-px flex-1 bg-border" />
          </div>
          <div className="space-y-2">
            <OAuthButton provider="google" />
            <OAuthButton provider="github" />
          </div>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link to="/sign-in" className="font-semibold text-primary hover:underline">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

function NameField({ label, value, onChange, error }: { label: string; value: string; onChange: (v: string) => void; error?: string }) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="relative mt-1.5">
        <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={value} onChange={(e) => onChange(e.target.value)} className={cn("pl-9", error && "border-destructive")} />
      </div>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}

function StrengthBar({ score }: { score: 0 | 1 | 2 | 3 | 4 }) {
  const widths = ["0%", "25%", "50%", "75%", "100%"] as const;
  const meta = STRENGTH[score];
  return (
    <div className="mt-2 flex items-center gap-2">
      <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full transition-all duration-300 ease-out", meta.color)} style={{ width: widths[score] }} />
      </div>
      <span className="w-12 text-right text-xs text-muted-foreground">{meta.label}</span>
    </div>
  );
}

function SuccessScreen({ email }: { email: string }) {
  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[linear-gradient(135deg,#F0FAF4_0%,#E8F5EE_100%)] px-4 py-10">
      <Confetti />
      <div className="relative mx-auto flex w-full max-w-[480px] flex-col items-center">
        <Link to="/" className="flex items-center gap-2">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary text-primary-foreground shadow-card">
            <Leaf className="h-6 w-6" />
          </div>
          <span className="text-2xl font-bold tracking-tight">NutritionApp</span>
        </Link>

        <div className="mt-8 w-full rounded-2xl border border-border bg-card p-10 text-center shadow-[0_8px_32px_rgba(0,0,0,0.08)]">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-primary/10 animate-in zoom-in duration-500">
            <CheckCircle2 className="h-10 w-10 text-primary" strokeWidth={2.2} />
          </div>
          <h1 className="mt-5 text-2xl font-bold">Account created!</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Welcome to NutritionApp, <span className="font-medium text-foreground">{email}</span>
          </p>
          <Link to="/onboarding" className="mt-6 inline-block">
            <Button className="w-full">Continue to setup →</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

function Confetti() {
  const pieces = Array.from({ length: 30 });
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {pieces.map((_, i) => {
        const left     = (i * 37) % 100;
        const delay    = (i % 10) * 80;
        const duration = 1800 + (i % 5) * 200;
        const isGreen  = i % 2 === 0;
        return (
          <span
            key={i}
            className="absolute top-[-20px] block h-2 w-2 rounded-sm"
            style={{
              left:            `${left}%`,
              backgroundColor: isGreen ? "#52B788" : "#FFFFFF",
              boxShadow:       isGreen ? "none" : "0 0 0 1px rgba(0,0,0,0.05)",
              animation:       `nm-confetti-fall ${duration}ms ${delay}ms ease-in forwards`,
            }}
          />
        );
      })}
    </div>
  );
}
