import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Camera, Plug, AlertTriangle, Loader2, Pencil, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import {
  useProfile,
  updateProfile as apiUpdateProfile,
  useAllergens,
  updateUserAllergens,
} from "@/integrations/api/hooks";
import type { UserGoal, ActivityLevel, DietType, Gender, ProfileWithUser } from "@/integrations/api/types";
import { toast } from "sonner";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/profile")({ component: Profile });

const GOAL_OPTIONS: { value: UserGoal; label: string }[] = [
  { value: "weight_loss", label: "Lose weight" },
  { value: "weight_gain", label: "Gain weight" },
  { value: "muscle_gain", label: "Build muscle" },
  { value: "maintenance", label: "Maintain weight" },
  { value: "healthy_eating", label: "Eat healthier" },
];

const ACTIVITY_OPTIONS: { value: ActivityLevel; label: string }[] = [
  { value: "sedentary", label: "Sedentary (little to no exercise)" },
  { value: "lightly_active", label: "Lightly active (1-3 days/week)" },
  { value: "moderately_active", label: "Moderately active (3-5 days/week)" },
  { value: "very_active", label: "Very active (6-7 days/week)" },
  { value: "extra_active", label: "Extra active (hard training or physical job)" },
];

const DIET_OPTIONS: { value: DietType; label: string }[] = [
  { value: "standard", label: "Standard" },
  { value: "vegetarian", label: "Vegetarian" },
  { value: "vegan", label: "Vegan" },
  { value: "pescatarian", label: "Pescatarian" },
  { value: "keto", label: "Keto" },
  { value: "paleo", label: "Paleo" },
  { value: "gluten_free", label: "Gluten-free" },
  { value: "dairy_free", label: "Dairy-free" },
  { value: "halal", label: "Halal" },
  { value: "kosher", label: "Kosher" },
];

const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
];

function formatAllergenName(name: string) {
  return name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

type Form = {
  first_name: string;
  last_name: string;
  gender: Gender | "";
  date_of_birth: string;
  height_cm: string;
  weight_kg: string;
  target_weight_kg: string;
  goal: UserGoal;
  activity_level: ActivityLevel;
  diet_type: DietType;
};

function buildForm(profile?: ProfileWithUser | null): Form {
  return {
    first_name: profile?.first_name ?? "",
    last_name: profile?.last_name ?? "",
    gender: profile?.gender ?? "",
    date_of_birth: profile?.date_of_birth?.slice(0, 10) ?? "",
    height_cm: profile?.height_cm != null ? String(profile.height_cm) : "",
    weight_kg: profile?.weight_kg != null ? String(profile.weight_kg) : "",
    target_weight_kg: profile?.target_weight_kg != null ? String(profile.target_weight_kg) : "",
    goal: profile?.goal ?? "maintenance",
    activity_level: profile?.activity_level ?? "moderately_active",
    diet_type: profile?.diet_type ?? "standard",
  };
}

function Profile() {
  const { logout } = useAuth();
  const { data: profile, isLoading, refetch } = useProfile();
  const { data: allergensList } = useAllergens();

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Form>(() => buildForm(null));
  const [initial, setInitial] = useState<Form>(form);
  const [selectedAllergens, setSelectedAllergens] = useState<Set<string>>(new Set());
  const [initialAllergens, setInitialAllergens] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    if (profile) {
      const f = buildForm(profile);
      setForm(f);
      setInitial(f);
      const names = new Set(profile.allergens ?? []);
      setSelectedAllergens(names);
      setInitialAllergens(names);
    }
  }, [profile]);

  const dirty = useMemo(
    () =>
      JSON.stringify(form) !== JSON.stringify(initial) ||
      JSON.stringify([...selectedAllergens].sort()) !== JSON.stringify([...initialAllergens].sort()),
    [form, initial, selectedAllergens, initialAllergens]
  );

  const update = <K extends keyof Form>(k: K, v: Form[K]) => setForm((p) => ({ ...p, [k]: v }));

  const toggleAllergen = (name: string) => {
    setSelectedAllergens((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  const onSave = async () => {
    setSaving(true);
    try {
      await apiUpdateProfile({
        first_name: form.first_name || undefined,
        last_name: form.last_name || undefined,
        gender: (form.gender || undefined) as Gender | undefined,
        date_of_birth: form.date_of_birth || undefined,
        height_cm: form.height_cm ? Number(form.height_cm) : undefined,
        weight_kg: form.weight_kg ? Number(form.weight_kg) : undefined,
        target_weight_kg: form.target_weight_kg ? Number(form.target_weight_kg) : undefined,
        goal: form.goal,
        activity_level: form.activity_level,
        diet_type: form.diet_type,
      });

      if (allergensList) {
        const ids = allergensList.filter((a) => selectedAllergens.has(a.name)).map((a) => a.id);
        await updateUserAllergens(ids);
      }

      await refetch();
      setEditing(false);
      toast.success("Profile updated successfully");
    } catch {
      toast.error("Couldn't save changes — please try again");
    } finally {
      setSaving(false);
    }
  };

  const onCancel = () => {
    setForm(initial);
    setSelectedAllergens(initialAllergens);
    setEditing(false);
  };

  const displayName = `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim() || profile?.email || "";
  const initials = (displayName || "?").split(" ").map((s) => s[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

  if (isLoading) {
    return (
      <AppShell>
        <div className="grid h-64 place-items-center text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Profile & Settings</h1>
        {!editing ? (
          <div className="relative">
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Pencil className="h-4 w-4" /> Edit Profile
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onCancel} disabled={saving}>Cancel</Button>
            <Button onClick={onSave} disabled={saving || !dirty}>
              {saving ? (<><Loader2 className="h-4 w-4 animate-spin" /> Saving...</>) : "Save Changes"}
            </Button>
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-card text-center">
          <div className="relative mx-auto h-24 w-24 group">
            <div className="grid h-24 w-24 place-items-center rounded-full bg-accent text-3xl font-bold text-accent-foreground">{initials}</div>
            {editing && (
              <button className="absolute inset-0 hidden h-24 w-24 place-items-center rounded-full bg-foreground/60 text-xs font-medium text-white group-hover:grid">
                <Camera className="h-5 w-5" />
                Change photo
              </button>
            )}
            <button className="absolute bottom-0 right-0 grid h-8 w-8 place-items-center rounded-full bg-primary text-primary-foreground shadow-card">
              <Camera className="h-4 w-4" />
            </button>
          </div>
          <h2 className="mt-4 font-bold">{displayName || "Your profile"}</h2>
          <p className="text-xs text-muted-foreground">{profile?.email}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Goal: {GOAL_OPTIONS.find((g) => g.value === profile?.goal)?.label ?? "—"}
          </p>
        </div>

        <div className="lg:col-span-2 rounded-2xl border border-border bg-card p-6 shadow-card">
          <h3 className="font-semibold">Personal info</h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="First name" value={form.first_name} editing={editing} onChange={(v) => update("first_name", v)} />
            <Field label="Last name" value={form.last_name} editing={editing} onChange={(v) => update("last_name", v)} />
            {/* <Field label="Date of birth" type="date" value={form.date_of_birth} editing={editing} onChange={(v) => update("date_of_birth", v)} /> */}
            <SelectField
              label="Gender"
              editing={editing}
              value={form.gender}
              onChange={(v) => update("gender", v as Gender)}
              options={GENDER_OPTIONS}
            />
            <Field label="Height (cm)" type="number" value={form.height_cm} editing={editing} onChange={(v) => update("height_cm", v)} />
            <Field label="Weight (kg)" type="number" value={form.weight_kg} editing={editing} onChange={(v) => update("weight_kg", v)} />
            <Field label="Target weight (kg)" type="number" value={form.target_weight_kg} editing={editing} onChange={(v) => update("target_weight_kg", v)} />
          </div>
        </div>

        {/* <div className="rounded-2xl border border-border bg-card p-6 shadow-card">
          <h3 className="font-semibold">Notifications</h3>
          <div className="mt-4 space-y-4">
            {["Expiry reminders", "Meal time reminders", "Weekly plan ready"].map((n, i) => (
              <div key={n} className="flex items-center justify-between">
                <span className="text-sm">{n}</span>
                <Switch defaultChecked={i !== 1} />
              </div>
            ))}
          </div>
        </div> */}

        <div className="lg:col-span-3 rounded-2xl border border-border bg-card p-6 shadow-card">
          <h3 className="font-semibold">Nutrition preferences</h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <SelectField label="Goal" editing={editing} value={form.goal} onChange={(v) => update("goal", v as UserGoal)} options={GOAL_OPTIONS} />
            <SelectField label="Activity level" editing={editing} value={form.activity_level} onChange={(v) => update("activity_level", v as ActivityLevel)} options={ACTIVITY_OPTIONS} />
            <SelectField label="Diet type" editing={editing} value={form.diet_type} onChange={(v) => update("diet_type", v as DietType)} options={DIET_OPTIONS} />
          </div>
          {!!profile?.daily_calories && (
            <p className="mt-4 text-xs text-muted-foreground">
              Daily target: {profile.daily_calories} kcal · {profile.daily_protein_g}g protein · {profile.daily_carbs_g}g carbs · {profile.daily_fat_g}g fat
            </p>
          )}
        </div>

        <div className="lg:col-span-3 rounded-2xl border border-border bg-card p-6 shadow-card">
          <h3 className="font-semibold">Allergens & restrictions</h3>
          <p className="mt-1 text-xs text-muted-foreground">We'll filter recipes and flag ingredients that contain these.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {(allergensList ?? []).map((a) => {
              const active = selectedAllergens.has(a.name);
              return (
                <button
                  key={a.id}
                  type="button"
                  disabled={!editing}
                  onClick={() => toggleAllergen(a.name)}
                  className={cn(
                    "rounded-full border px-4 py-2 text-sm font-medium transition disabled:cursor-default",
                    active ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary/40",
                    !editing && "opacity-70"
                  )}
                >
                  {formatAllergenName(a.name)}
                </button>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-3 rounded-2xl border border-border bg-card p-2 shadow-card">
          <Accordion type="single" collapsible>
            <AccordionItem value="pw" className="border-none">
              <AccordionTrigger className="px-4 hover:no-underline">Change Password</AccordionTrigger>
              <AccordionContent className="px-4 pb-4">
                <PasswordChange />
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>

        {/* <div className="lg:col-span-3 rounded-2xl border border-border bg-card p-6 shadow-card">
          <h3 className="font-semibold">Connected services</h3>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {["Apple Health", "Google Fit", "Instacart"].map((s) => (
              <div key={s} className="flex items-center justify-between rounded-xl border border-dashed border-border p-4">
                <div className="flex items-center gap-3">
                  <div className="grid h-9 w-9 place-items-center rounded-lg bg-muted"><Plug className="h-4 w-4" /></div>
                  <span className="font-medium">{s}</span>
                </div>
                <Button size="sm" variant="outline">Connect</Button>
              </div>
            ))}
          </div>
        </div> */}

        <div className="lg:col-span-3 rounded-2xl border-2 border-destructive/30 bg-destructive/5 p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
            <div className="flex-1">
              <h3 className="font-semibold text-destructive">Danger Zone</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Permanently delete your account and all associated data. This action cannot be undone.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => setDeleteOpen(true)}
              className="border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
            >
              Delete Account
            </Button>
          </div>
        </div>
      </div>

      {editing && dirty && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#F59E0B]/40 bg-[#FFFBEB] px-4 py-3 text-sm text-[#92400E] shadow-card-lg">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
            <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[#F59E0B]" /> You have unsaved changes</span>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={onCancel}><X className="h-4 w-4" /> Discard</Button>
              <Button size="sm" onClick={onSave} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Changes"}
              </Button>
            </div>
          </div>
        </div>
      )}

      <DeleteAccountDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        email={profile?.email ?? ""}
        onConfirm={() => {
          setDeleteOpen(false);
          logout();
          toast.success("Account deleted");
        }}
      />
    </AppShell>
  );
}

function Field({
  label,
  value,
  editing,
  onChange,
  type = "text",
  prefix,
  suffix,
}: {
  label: string;
  value: string;
  editing: boolean;
  onChange: (v: string) => void;
  type?: string;
  prefix?: string;
  suffix?: string;
}) {
  return (
    <div>
      <Label>{label}</Label>
      {editing ? (
        <Input className="mt-1.5" type={type} value={value} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <div className="mt-1.5 flex h-10 items-center rounded-md border border-transparent bg-muted/40 px-3 text-sm">
          {value ? <>{prefix}{value}{suffix}</> : <span className="text-muted-foreground">—</span>}
        </div>
      )}
    </div>
  );
}

function SelectField<T extends string>({
  label,
  value,
  editing,
  onChange,
  options,
}: {
  label: string;
  value: T | "";
  editing: boolean;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div>
      <Label>{label}</Label>
      {editing ? (
        <Select value={value || undefined} onValueChange={(v) => onChange(v as T)}>
          <SelectTrigger className="mt-1.5">
            <SelectValue placeholder={`Select ${label.toLowerCase()}`} />
          </SelectTrigger>
          <SelectContent>
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <div className="mt-1.5 flex h-10 items-center rounded-md border border-transparent bg-muted/40 px-3 text-sm">
          {options.find((o) => o.value === value)?.label ?? <span className="text-muted-foreground">—</span>}
        </div>
      )}
    </div>
  );
}

function PasswordChange() {
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [conf, setConf] = useState("");
  const [busy, setBusy] = useState(false);

  const score = (() => {
    let s = 0;
    if (next.length >= 8) s++;
    if (/[A-Z]/.test(next) && /[a-z]/.test(next)) s++;
    if (/\d/.test(next)) s++;
    if (/[^A-Za-z0-9]/.test(next)) s++;
    return s;
  })();
  const meta = [
    { l: "", c: "" },
    { l: "Weak", c: "bg-[#EF4444]" },
    { l: "Fair", c: "bg-[#F59E0B]" },
    { l: "Good", c: "bg-[#86EFAC]" },
    { l: "Strong", c: "bg-primary" },
  ][score];
  const widths = ["0%", "25%", "50%", "75%", "100%"][score];

  const submit = () => {
    if (!cur || next.length < 8 || next !== conf) {
      toast.error("Please complete all fields correctly");
      return;
    }
    setBusy(true);
    setTimeout(() => {
      setBusy(false);
      setCur(""); setNext(""); setConf("");
      toast.success("Password updated");
    }, 700);
  };

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <div>
        <Label>Current Password</Label>
        <Input type="password" value={cur} onChange={(e) => setCur(e.target.value)} className="mt-1.5" />
      </div>
      <div>
        <Label>New Password</Label>
        <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} className="mt-1.5" />
        <div className="mt-2 flex items-center gap-2">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
            <div className={cn("h-full transition-all duration-300", meta.c)} style={{ width: widths }} />
          </div>
          <span className="w-12 text-right text-xs text-muted-foreground">{meta.l}</span>
        </div>
      </div>
      <div>
        <Label>Confirm New Password</Label>
        <Input type="password" value={conf} onChange={(e) => setConf(e.target.value)} className="mt-1.5" />
      </div>
      <div className="sm:col-span-3">
        <Button onClick={submit} disabled={busy}>
          {busy ? (<><Loader2 className="h-4 w-4 animate-spin" /> Updating...</>) : "Update Password"}
        </Button>
      </div>
    </div>
  );
}

function DeleteAccountDialog({
  open,
  onClose,
  email,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  email: string;
  onConfirm: () => void;
}) {
  const [typed, setTyped] = useState("");
  useEffect(() => { if (!open) setTyped(""); }, [open]);
  const enabled = typed.trim().toLowerCase() === email.toLowerCase();
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <div className="mx-auto mb-2 grid h-12 w-12 place-items-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-6 w-6 text-destructive" />
          </div>
          <DialogTitle className="text-center">Delete your account?</DialogTitle>
          <DialogDescription className="text-center">
            This permanently deletes your account and all data. Type your email to confirm.
          </DialogDescription>
        </DialogHeader>
        <div>
          <Label>Email</Label>
          <Input className="mt-1.5" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={email} />
        </div>
        <DialogFooter className="sm:justify-between">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!enabled}
            onClick={onConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
          >
            Yes, delete my account
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
