import { query } from '../config/database';

// Sent with every chat message, so keep it to a few short lines
const MAX_FRIDGE_ITEMS = 40;

const GOALS: Record<string, string> = {
  weight_loss: 'lose weight',
  weight_gain: 'gain weight',
  muscle_gain: 'build muscle',
  maintenance: 'maintain weight',
  healthy_eating: 'eat healthier',
};

const num = (v: unknown) => Number(v); // pg returns DECIMAL columns as strings
const words = (s: string) => s.replace(/_/g, ' ');

// The user's profile, allergies and fridge as plain-text lines for the AI's
// system prompt, so answers fit this user instead of being generic advice.
// today: the user's local date (YYYY-MM-DD). The server runs on UTC, which is
// a different day for Ukrainian users between midnight and 2-3 am, and that
// would shift every "expires tomorrow" by a day.
export async function buildUserContext(userId: string, today: string): Promise<string> {
  const [profileResult, fridgeResult] = await Promise.all([
    query(
      `SELECT u.first_name, p.weight_kg, p.target_weight_kg, p.goal, p.diet_type,
              p.daily_calories, p.daily_protein_g, p.daily_carbs_g, p.daily_fat_g,
              array_agg(DISTINCT a.name) FILTER (WHERE a.name IS NOT NULL) AS allergens
       FROM users u
       LEFT JOIN user_profiles p ON p.user_id = u.id
       LEFT JOIN user_allergens ua ON ua.user_id = u.id
       LEFT JOIN allergens a ON a.id = ua.allergen_id
       WHERE u.id = $1
       GROUP BY u.id, p.id`,
      [userId]
    ),
    // Expired items are left out so the assistant never builds a meal on them.
    // to_char: a DATE turned into a JS Date picks up the server's timezone.
    query(
      `SELECT f.name, fi.quantity, fi.unit, to_char(fi.expiry_date, 'YYYY-MM-DD') AS expiry_date
       FROM fridge_items fi
       JOIN foods f ON f.id = fi.food_id
       WHERE fi.user_id = $1 AND (fi.expiry_date IS NULL OR fi.expiry_date >= $2::date)
       ORDER BY fi.expiry_date ASC NULLS LAST, f.name
       LIMIT $3`,
      [userId, today, MAX_FRIDGE_ITEMS]
    ),
  ]);

  const p = profileResult.rows[0] ?? {};
  const lines: string[] = [];

  if (p.first_name) lines.push(`Name: ${p.first_name}`);
  if (p.goal) lines.push(`Goal: ${GOALS[p.goal] ?? words(p.goal)}`);
  if (p.weight_kg) {
    const target = p.target_weight_kg ? `, target ${num(p.target_weight_kg)} kg` : '';
    lines.push(`Weight: ${num(p.weight_kg)} kg${target}`);
  }
  if (p.diet_type && p.diet_type !== 'standard') lines.push(`Diet: ${words(p.diet_type)}`);
  if (p.daily_calories) {
    lines.push(
      `Daily targets: ${p.daily_calories} kcal, protein ${p.daily_protein_g} g, ` +
        `carbs ${p.daily_carbs_g} g, fat ${p.daily_fat_g} g`
    );
  }
  lines.push(`Allergies: ${p.allergens?.length ? p.allergens.map(words).join(', ') : 'none'}`);

  const fridge = fridgeResult.rows.map((f) => {
    const details = [
      f.quantity ? `${num(f.quantity)} ${f.unit}` : null,
      f.expiry_date ? `expires ${f.expiry_date}` : null,
    ].filter(Boolean);
    return details.length ? `${f.name} (${details.join(', ')})` : f.name;
  });
  lines.push(`Fridge: ${fridge.length ? fridge.join('; ') : 'empty'}`);
  lines.push(`Today: ${today}`);

  return lines.join('\n');
}
