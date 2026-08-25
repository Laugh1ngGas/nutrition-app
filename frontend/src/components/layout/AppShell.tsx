import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Refrigerator,
  CalendarDays,
  UtensilsCrossed,
  ShoppingCart,
  TrendingUp,
  User as UserIcon,
  Bell,
  Search,
  Leaf,
  Menu,
  Settings,
  LogOut,
  Moon,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/fridge", label: "My Fridge", icon: Refrigerator, dot: true },
  { to: "/planner", label: "Meal Planner", icon: CalendarDays },
  { to: "/recipes", label: "Recipes", icon: UtensilsCrossed },
  // { to: "/shopping", label: "Shopping List", icon: ShoppingCart, dot: true },
  { to: "/progress", label: "Progress", icon: TrendingUp },
  { to: "/profile", label: "Profile", icon: UserIcon },
];

export function AppShell({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [mobileOpen, setMobileOpen] = useState(false);
  const { isAuthenticated, hydrated, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (hydrated && !isAuthenticated) {
      navigate({ to: "/sign-in", search: { from: path } as never });
    }
  }, [hydrated, isAuthenticated, navigate, path]);

  if (!hydrated || !isAuthenticated) {
    return (
      <div className="grid min-h-screen place-items-center bg-background text-sm text-muted-foreground">
        Loading...
      </div>
    );
  }

  const initials = (user?.name || "AJ")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="min-h-screen bg-background">
      {/* Top navbar */}
      <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-border bg-card px-4 lg:px-6">
        <button
          className="lg:hidden rounded-md p-2 hover:bg-muted"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label="Toggle menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <Link to="/dashboard" className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground">
            <Leaf className="h-5 w-5" />
          </div>
          <span className="text-lg font-bold tracking-tight">NutritionApp</span>
        </Link>
        <div className="ml-4 hidden flex-1 max-w-xl md:flex">
          <div className="relative w-full">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              className="h-10 w-full rounded-full border border-border bg-background pl-10 pr-4 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              placeholder="Search recipes, ingredients..."
            />
          </div>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <button className="relative rounded-full p-2 hover:bg-muted">
            <Bell className="h-5 w-5" />
            <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-secondary" />
          </button>
          <UserMenu initials={initials} />
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside
          className={cn(
            "fixed lg:sticky top-16 z-20 h-[calc(100vh-4rem)] w-60 shrink-0 border-r border-sidebar-border bg-sidebar transition-transform",
            mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
          )}
        >
          <nav className="flex flex-col gap-1 p-3">
            {nav.map((item) => {
              const active = path === item.to;
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition",
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent/60"
                  )}
                >
                  {active && (
                    <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-primary" />
                  )}
                  <Icon className="h-5 w-5" />
                  <span className="flex-1">{item.label}</span>
                  {item.dot && <span className="h-2 w-2 rounded-full bg-secondary" />}
                </Link>
              );
            })}
          </nav>
        </aside>
        {mobileOpen && (
          <div
            className="fixed inset-0 top-16 z-10 bg-foreground/30 lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}

        <main className="min-w-0 flex-1 p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
}

function UserMenu({ initials }: { initials: string }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [dark, setDark] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  const handleLogout = () => {
    logout();
    setOpen(false);
    navigate({ to: "/sign-in" });
  };

  return (
    <DropdownMenu open={open} onOpenChange={(v) => { setOpen(v); if (!v) setConfirming(false); }}>
      <DropdownMenuTrigger asChild>
        <button className="relative outline-none">
          <div className="grid h-10 w-10 place-items-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">
            {initials}
          </div>
          <span className="absolute -bottom-0.5 -right-0.5 block h-2.5 w-2.5 rounded-full border-2 border-card bg-primary" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-60 rounded-xl p-0 shadow-[0_8px_24px_rgba(0,0,0,0.12)]"
      >
        <div className="flex items-center gap-3 p-4">
          <div className="grid h-12 w-12 place-items-center rounded-full bg-accent text-base font-bold text-accent-foreground">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="truncate text-sm font-semibold">{user?.name}</p>
              <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold uppercase text-primary">Pro</span>
            </div>
            <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
          </div>
        </div>

        {!confirming ? (
          <>
            <div className="h-px bg-border" />
            <div className="p-1.5">
              <MenuItem icon={UserIcon} label="My Profile" onClick={() => { setOpen(false); navigate({ to: "/profile" }); }} />
              <MenuItem icon={Settings} label="Account Settings" onClick={() => { setOpen(false); navigate({ to: "/profile" }); }} />
              <MenuItem icon={TrendingUp} label="My Progress" onClick={() => { setOpen(false); navigate({ to: "/progress" }); }} />
              <div className="flex items-center justify-between rounded-md px-3 py-2 text-sm">
                <span className="flex items-center gap-3"><Moon className="h-4 w-4" /> Dark Mode</span>
                <Switch checked={dark} onCheckedChange={setDark} />
              </div>
            </div>
            <div className="h-px bg-border" />
            <div className="p-1.5">
              <button
                onClick={() => setConfirming(true)}
                className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/5"
              >
                <LogOut className="h-4 w-4" /> Log Out
              </button>
            </div>
          </>
        ) : (
          <div className="p-4 animate-in fade-in slide-in-from-top-2 duration-200">
            <p className="text-sm font-medium">Are you sure you want to log out?</p>
            <div className="mt-3 flex gap-2">
              <Button variant="ghost" size="sm" className="flex-1" onClick={() => setConfirming(false)}>Cancel</Button>
              <Button
                size="sm"
                className="flex-1 bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={handleLogout}
              >
                Log Out
              </Button>
            </div>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MenuItem({ icon: Icon, label, onClick }: { icon: typeof UserIcon; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-muted"
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}
