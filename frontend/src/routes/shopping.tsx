import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { shoppingList } from "@/lib/mock-data";
import { ChevronDown, RefreshCw, Share2, FileDown, Plus, ShoppingCart } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/shopping")({ component: Shopping });

type ItemKey = string;

function Shopping() {
  const [checked, setChecked] = useState<Set<ItemKey>>(new Set());
  const [have, setHave] = useState<Set<ItemKey>>(new Set());
  const [open, setOpen] = useState<Set<string>>(new Set(shoppingList.map((s) => s.category)));

  const toggle = <T,>(set: Set<T>, fn: (s: Set<T>) => void, v: T) => {
    const next = new Set(set);
    next.has(v) ? next.delete(v) : next.add(v);
    fn(next);
  };

  // let total = 0;
  let count = 0;
  shoppingList.forEach((s) =>
    s.items.forEach((i) => {
      const k = `${s.category}-${i.name}`;
      if (!have.has(k)) {
        // total += i.price;
        count += 1;
      }
    })
  );

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Shopping List</h1>
          <p className="mt-1 text-sm text-muted-foreground">Mon 20 – Sun 26 · {count} items</p>
        </div>
        <Button variant="outline" size="icon"><RefreshCw className="h-4 w-4" /></Button>
      </div>

      <div className="mb-6 flex items-start gap-3 rounded-2xl border border-accent bg-accent/40 p-4">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
          <ShoppingCart className="h-4 w-4" />
        </div>
        <p className="text-sm">
          <span className="font-semibold">Auto-generated</span> from your meal plan for the week of Mon 20 – Sun 26.
        </p>
      </div>

      <div className="space-y-3 pb-32">
        {shoppingList.map((section) => {
          const isOpen = open.has(section.category);
          return (
            <div key={section.category} className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
              <button
                onClick={() => toggle(open, setOpen, section.category)}
                className="flex w-full items-center justify-between p-4 hover:bg-muted/40"
              >
                <div className="flex items-center gap-3">
                  <span className="font-semibold">{section.category}</span>
                  <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-accent-foreground">
                    {section.items.length}
                  </span>
                </div>
                <ChevronDown className={cn("h-4 w-4 transition", isOpen && "rotate-180")} />
              </button>
              {isOpen && (
                <div className="divide-y divide-border">
                  {section.items.map((i) => {
                    const k = `${section.category}-${i.name}`;
                    const isChecked = checked.has(k);
                    const isHave = have.has(k);
                    return (
                      <div key={k} className={cn("flex items-center gap-3 px-4 py-3", isHave && "opacity-50")}>
                        <button
                          onClick={() => toggle(checked, setChecked, k)}
                          className={cn(
                            "grid h-5 w-5 shrink-0 place-items-center rounded-md border-2 transition",
                            isChecked ? "border-primary bg-primary text-primary-foreground" : "border-border"
                          )}
                        >
                          {isChecked && <span className="text-xs">✓</span>}
                        </button>
                        <div className="flex-1 min-w-0">
                          <div className={cn("font-medium", isChecked && "line-through text-muted-foreground")}>{i.name}</div>
                          <div className="text-xs text-muted-foreground">{i.qty}</div>
                        </div>
                        {/* <span className="text-sm font-semibold tabular-nums">€{i.price.toFixed(2)}</span> */}
                        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <input type="checkbox" checked={isHave} onChange={() => toggle(have, setHave, k)} className="accent-primary" />
                          Have it
                        </label>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-10 border-t border-border bg-card/95 p-4 backdrop-blur lg:left-60">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
          <div>
            <div className="text-xs text-muted-foreground">{count} items</div>
            {/* <div className="text-xl font-bold">€{total.toFixed(2)}</div> */}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="icon"><Share2 className="h-4 w-4" /></Button>
            <Button variant="outline" size="icon"><FileDown className="h-4 w-4" /></Button>
            <Button><Plus className="mr-1 h-4 w-4" /> Add Item</Button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
