// Shared by the fridge page and the dashboard

const CATEGORY_EMOJI: Record<string, string> = {
  dairy: "🥛", produce: "🥦", meat: "🍗", poultry: "🍗", fish: "🐟", seafood: "🦐",
  grains: "🌾", bakery: "🍞", fruit: "🍎", fruits: "🍎", vegetables: "🥕",
  spices: "🧂", condiments: "🧴", beverages: "🥤", snacks: "🍿", frozen: "🧊",
  canned: "🥫", eggs: "🥚", oils: "🫒", nuts: "🥜", legumes: "🫘",
};

export function categoryEmoji(category?: string | null): string {
  if (!category) return "🥘";
  return CATEGORY_EMOJI[category.toLowerCase()] ?? "🥘";
}

export function daysUntil(dateStr?: string | null): number | null {
  if (!dateStr) return null;
  // Build the target date from its Y/M/D parts directly (local time) — parsing the
  // string via `new Date(dateStr)` reads it as UTC midnight, which rounds down a day
  // once flattened to local midnight in any timezone behind UTC.
  const [y, m, d] = dateStr.slice(0, 10).split("-").map(Number);
  const target = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}
