import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, assertLocal, monday, newUser, psql, removeUser, TestUser } from './helpers';

// Checked independently of the app's own filter, on the ingredient names in the DB
const MEAT_OR_FISH = /\b(chicken|beef|pork|lamb|bacon|ham|sausage|chorizo|turkey|duck|veal|mince|steak|salmon|tuna|cod|prawn|shrimp|anchov|fish|meat)/i;
const TREE_NUTS = /\b(almond|walnut|cashew|pecan|hazelnut|pistachio|macadamia|pine nut|nuts?\b)/i;

let u: TestUser;
beforeAll(async () => {
  assertLocal();
  u = await newUser();
  const allergens = (await api('GET', '/allergens', undefined, u.access)).body.data as { id: number; name: string }[];
  await api('PATCH', '/profile', { diet_type: 'vegetarian' }, u.access);
  await api('PUT', '/profile/allergens', { allergen_ids: [allergens.find((a) => a.name === 'tree_nuts')!.id] }, u.access);
});
afterAll(async () => { await removeUser(u); });

describe('meal plan generation', () => {
  it('a vegetarian with a tree-nut allergy gets no meat, fish or nuts in 3 generated weeks', async () => {
    for (let run = 0; run < 3; run++) {
      const r = await api('POST', '/meal-plans/week', { start: monday() }, u.access);
      expect(r.status).toBe(201);
      expect(r.body.data.entries).toHaveLength(21);
      const ids = [...new Set(r.body.data.entries.map((e: { recipe_id: string }) => e.recipe_id))];
      const rows = psql(`SELECT r.title, f.name FROM recipe_ingredients ri JOIN foods f ON f.id = ri.food_id
                         JOIN recipes r ON r.id = ri.recipe_id WHERE ri.recipe_id IN ('${ids.join("','")}')`);
      const bad = rows.filter(([, food]) => MEAT_OR_FISH.test(food) || TREE_NUTS.test(food) && !/nutmeg|coconut/i.test(food));
      expect(bad).toEqual([]);
    }
  });

  it('only accepts a Monday as the week start (422)', async () => {
    const tuesday = new Date(monday()); tuesday.setDate(tuesday.getDate() + 1);
    expect((await api('POST', '/meal-plans/week', { start: tuesday.toISOString().slice(0, 10) }, u.access)).status).toBe(422);
  });
});
