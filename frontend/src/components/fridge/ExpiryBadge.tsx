import { cn } from "@/lib/utils";
import { expiryStatus } from "@/lib/mock-data";
import { useI18n } from "@/lib/i18n";

export function ExpiryBadge({ days }: { days: number }) {
  const { t } = useI18n();
  const status = expiryStatus(days);
  const styles = {
    fresh: "bg-accent text-accent-foreground",
    soon: "bg-warning/20 text-warning-foreground border border-warning/40",
    expired: "bg-destructive/15 text-destructive border border-destructive/30",
  } as const;
  const label = {
    fresh: t("expiry.fresh", { n: days }),
    // "soon" starts at 1 day: 0 days already counts as expired
    soon: days === 1 ? t("expiry.tomorrow") : t("expiry.left", { n: days }),
    expired: t("expiry.expired"),
  } as const;
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", styles[status])}>
      {label[status]}
    </span>
  );
}
