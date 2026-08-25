import { createFileRoute, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Leaf, Mail, Lock, Eye, EyeOff, Loader2, Check, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useAuth, DEMO_USER } from "@/lib/auth-context";

export const Route = createFileRoute("/sign-in")({ component: SignIn });

function SignIn() {
  const { isAuthenticated, hydrated, signIn } = useAuth();
  const navigate = useNavigate();
  const search = useRouterState({ select: (s) => s.location.search }) as { from?: string };

  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow]         = useState(false);
  const [errors, setErrors]     = useState<{ email?: string; password?: string; banner?: string }>({});
  const [status, setStatus]     = useState<"idle" | "loading" | "success">("idle");

  useEffect(() => {
    if (hydrated && isAuthenticated) navigate({ to: "/dashboard" });
  }, [hydrated, isAuthenticated, navigate]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();

    // Валідація
    const next: typeof errors = {};
    if (!email) next.email = "This field is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) next.email = "Please enter a valid email address";
    if (!password) next.password = "This field is required";
    setErrors(next);
    if (Object.keys(next).length) return;

    setStatus("loading");
    try {
      await signIn(email, password);
      setStatus("success");
      setTimeout(() => navigate({ to: "/dashboard" }), 600);
    } catch (err: unknown) {
      const message =
        err instanceof Error && (err as { response?: { data?: { message?: string } } }).response?.data?.message
          ? (err as { response: { data: { message: string } } }).response.data.message
          : "Invalid email or password. Please try again.";
      setErrors({ banner: message });
      setStatus("idle");
    }
  };

  const fillDemo = () => {
    setEmail(DEMO_USER.email);
    setPassword("Demo1234!");
  };

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

        {search?.from && (
          <div className="mt-4 w-full rounded-lg border border-primary/30 bg-primary/5 px-4 py-2 text-center text-xs text-primary">
            Please sign in to access NutritionApp
          </div>
        )}

        <div className="mt-6 w-full animate-in fade-in slide-in-from-bottom-4 duration-300 rounded-2xl border border-border bg-card p-6 sm:p-10 shadow-[0_8px_32px_rgba(0,0,0,0.08)]">
          <h1 className="text-2xl font-bold">Welcome back</h1>
          <p className="mt-1 text-sm text-muted-foreground">Sign in to continue your nutrition journey</p>

          {errors.banner && (
            <div className="mt-5 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{errors.banner}</span>
            </div>
          )}

          <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
            <div>
              <Label htmlFor="email">Email</Label>
              <div className="relative mt-1.5">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={cn("pl-9 transition-colors focus-visible:ring-primary/30", errors.email && "border-destructive focus-visible:ring-destructive/30")}
                  placeholder="you@example.com"
                />
              </div>
              {errors.email && <p className="mt-1 text-xs text-destructive">{errors.email}</p>}
            </div>

            <div>
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <button type="button" className="text-xs text-muted-foreground hover:text-primary">
                  Forgot password?
                </button>
              </div>
              <div className="relative mt-1.5">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="password"
                  type={show ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={cn("pl-9 pr-10 transition-colors focus-visible:ring-primary/30", errors.password && "border-destructive focus-visible:ring-destructive/30")}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground transition-opacity hover:text-foreground"
                  aria-label="Toggle password visibility"
                >
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && <p className="mt-1 text-xs text-destructive">{errors.password}</p>}
            </div>

            <Button type="submit" className="w-full" disabled={status !== "idle"}>
              {status === "loading" && (<><Loader2 className="h-4 w-4 animate-spin" /> Signing in...</>)}
              {status === "success" && (<><Check className="h-4 w-4" /> Signed in!</>)}
              {status === "idle" && "Sign In"}
            </Button>

            <button type="button" onClick={fillDemo} className="block w-full text-center text-xs text-muted-foreground hover:text-primary">
              Use demo account
            </button>
          </form>

          <Divider />

          <div className="space-y-2">
            <OAuthButton provider="google" />
            <OAuthButton provider="github" />
          </div>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Don't have an account?{" "}
            <Link to="/sign-up" className="font-semibold text-primary hover:underline">Sign up</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

function Divider() {
  return (
    <div className="my-6 flex items-center gap-3">
      <div className="h-px flex-1 bg-border" />
      <span className="text-xs uppercase tracking-wider text-muted-foreground">or continue with</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

export function OAuthButton({ provider }: { provider: "google" | "github" }) {
  if (provider === "google") {
    return (
      <button
        type="button"
        className="flex h-10 w-full items-center justify-center gap-3 rounded-md border border-border bg-white text-sm font-medium text-[#1A1A2E] transition hover:bg-muted"
      >
        <GoogleIcon />
        Continue with Google
      </button>
    );
  }
  return (
    <button
      type="button"
      className="flex h-10 w-full items-center justify-center gap-3 rounded-md bg-[#1A1A2E] text-sm font-medium text-white transition hover:bg-[#1A1A2E]/90"
    >
      <GithubIcon />
      Continue with GitHub
    </button>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.8 32.4 29.4 35.5 24 35.5c-6.4 0-11.5-5.1-11.5-11.5S17.6 12.5 24 12.5c2.9 0 5.6 1.1 7.6 2.9l5.7-5.7C33.6 6.1 29 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 12.5 24 12.5c2.9 0 5.6 1.1 7.6 2.9l5.7-5.7C33.6 6.1 29 4 24 4 16.3 4 9.6 8.3 6.3 14.7z"/>
      <path fill="#4CAF50" d="M24 44c5 0 9.5-1.9 12.9-5l-6-5c-1.9 1.3-4.3 2-6.9 2-5.4 0-9.7-3.1-11.3-7.5l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.3 5.5l6 5C40.9 35.7 44 30.3 44 24c0-1.2-.1-2.3-.4-3.5z"/>
    </svg>
  );
}

function GithubIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 .5C5.7.5.5 5.7.5 12c0 5.1 3.3 9.4 7.9 10.9.6.1.8-.2.8-.6v-2c-3.2.7-3.9-1.5-3.9-1.5-.5-1.3-1.3-1.7-1.3-1.7-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.4-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.2 1.2.9-.3 1.9-.4 2.9-.4s2 .1 2.9.4c2.2-1.5 3.2-1.2 3.2-1.2.6 1.6.2 2.8.1 3.1.7.8 1.2 1.8 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6 4.6-1.5 7.9-5.8 7.9-10.9C23.5 5.7 18.3.5 12 .5z"/>
    </svg>
  );
}
