import { cn } from "@/lib/utils";
import { expiryStatus } from "@/lib/mock-data";

export function ExpiryBadge({ days }: { days: number }) {
  const status = expiryStatus(days);
  const styles = {
    fresh: "bg-accent text-accent-foreground",
    soon: "bg-warning/20 text-warning-foreground border border-warning/40",
    expired: "bg-destructive/15 text-destructive border border-destructive/30",
  } as const;
  const label = {
    fresh: `Fresh · ${days}d`,
    soon: days <= 1 ? "Expires today" : `${days}d left`,
    expired: "Expired",
  } as const;
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", styles[status])}>
      {label[status]}
    </span>
  );
}
