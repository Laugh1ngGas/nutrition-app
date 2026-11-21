import type { Translate } from "@/lib/i18n";
import type { MessageKey } from "@/locales/en";

// Known allergens are translated; anything new in the database shows as stored
export function allergenLabel(name: string, t: Translate): string {
  const key = `allergen.${name}` as MessageKey;
  const translated = t(key);
  return translated !== key ? translated : name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
