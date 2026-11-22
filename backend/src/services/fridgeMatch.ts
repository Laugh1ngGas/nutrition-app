// Which recipe ingredients the user already has. Matched by foods.match_key
// (the USDA food, see migration 004), so a fridge "Onion" counts for a
// recipe's "Onions" or "Red Onions" and "Eggs" for "Egg".

/**
 * A subquery of the user's fridge, one row per match_key, with the soonest
 * expiry date. Join it as `... LEFT JOIN ${fridgeKeys('$1')} fi ON fi.match_key = f.match_key`.
 * fresh: leave out expired items.
 */
export function fridgeKeys(userParam: string, { fresh = false } = {}): string {
  return `(SELECT ff.match_key, MIN(fi_.expiry_date) AS expiry_date
           FROM fridge_items fi_ JOIN foods ff ON ff.id = fi_.food_id
           WHERE fi_.user_id = ${userParam}${fresh ? ' AND (fi_.expiry_date IS NULL OR fi_.expiry_date >= CURRENT_DATE)' : ''}
           GROUP BY ff.match_key)`;
}
