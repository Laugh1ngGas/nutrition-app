import { describe, expect, it } from 'vitest';
import { fillWeek, mulberry32, score } from '../../src/services/mealPlan.service';

type Candidate = Parameters<typeof score>[0];
type Pools = Parameters<typeof fillWeek>[0];

const recipe = (id: string, extra: Partial<Candidate> = {}): Candidate => ({
  id, meal_type: 'dinner', diet_types: null, ingredients: [], total: 10, matched: 0,
  expiring: 0, favorite: false, eaten_recently: false, calories: 500, ...extra,
});
const noRandom = () => 0;

describe('score', () => {
  it('adds fridge share, expiring items (max 2) and favourites; subtracts recently eaten', () => {
    expect(score(recipe('a', { total: 4, matched: 2 }), noRandom)).toBeCloseTo(0.5);
    expect(score(recipe('a', { total: 4, matched: 2, expiring: 1, favorite: true }), noRandom)).toBeCloseTo(1.2);
    expect(score(recipe('a', { expiring: 5 }), noRandom)).toBeCloseTo(0.8); // capped at 2 items
    expect(score(recipe('a', { eaten_recently: true }), noRandom)).toBeCloseTo(-0.3);
  });

  it('a recipe with no ingredients scores 0 fridge share instead of NaN', () => {
    expect(score(recipe('a', { total: 0, matched: 0 }), noRandom)).toBe(0);
  });

  it('randomness adds at most 0.35', () => {
    expect(score(recipe('a'), () => 0.999)).toBeLessThan(0.35);
  });
});

const ids = (plan: ReturnType<typeof fillWeek>, slot: keyof Pools) => plan[slot].map((m) => m.recipe.id);
const days = (plan: ReturnType<typeof fillWeek>) =>
  [0, 1, 2, 3, 4, 5, 6].map((d) => [plan.breakfast[d], plan.lunch[d], plan.dinner[d]].map((m) => m.recipe.id));

describe('fillWeek', () => {
  const breakfasts = Array.from({ length: 7 }, (_, i) => recipe(`b${i}`, { meal_type: 'breakfast' }));
  const mains = Array.from({ length: 14 }, (_, i) => recipe(`m${i}`));
  const pools: Pools = { breakfast: breakfasts, lunch: mains, dinner: mains };

  it('fills 7 days x 3 meals', () => {
    const plan = fillWeek(pools, mulberry32(1), null);
    for (const slot of ['breakfast', 'lunch', 'dinner'] as const) expect(plan[slot]).toHaveLength(7);
  });

  it('never repeats a recipe on the same day', () => {
    for (const seed of [1, 2, 3, 42, 1000]) {
      for (const day of days(fillWeek(pools, mulberry32(seed), null))) expect(new Set(day).size).toBe(3);
    }
  });

  it('with enough recipes, nothing repeats in the whole week', () => {
    const plan = fillWeek(pools, mulberry32(7), null);
    const all = [...ids(plan, 'breakfast'), ...ids(plan, 'lunch'), ...ids(plan, 'dinner')];
    expect(new Set(all).size).toBe(21);
  });

  it('never puts the same recipe in the same slot on consecutive days, even with only 2 mains', () => {
    const two = [recipe('x'), recipe('y')];
    const plan = fillWeek({ breakfast: breakfasts, lunch: two, dinner: two }, mulberry32(5), null);
    for (const slot of ['lunch', 'dinner'] as const) {
      const s = ids(plan, slot);
      for (let d = 1; d < 7; d++) expect(s[d]).not.toBe(s[d - 1]);
    }
  });

  it('small-pool fallback: with a single main dish it still fills every meal', () => {
    const one = [recipe('only')];
    const plan = fillWeek({ breakfast: one, lunch: one, dinner: one }, mulberry32(9), null);
    expect([...ids(plan, 'breakfast'), ...ids(plan, 'lunch'), ...ids(plan, 'dinner')]).toEqual(Array(21).fill('only'));
  });

  it('prefers recipes made from the fridge', () => {
    const fridge = recipe('fridge', { total: 5, matched: 5 });
    const plan = fillWeek({ breakfast: breakfasts, lunch: [fridge, ...mains], dinner: [fridge, ...mains] }, mulberry32(3), null);
    expect(ids(plan, 'lunch')[0]).toBe('fridge'); // first chance to use it
  });

  it('is reproducible: the same seed gives the same week', () => {
    expect(days(fillWeek(pools, mulberry32(123), null))).toEqual(days(fillWeek(pools, mulberry32(123), null)));
  });

  it('with a calorie goal, portions bring every day within 10% of it', () => {
    const varied = Array.from({ length: 14 }, (_, i) => recipe(`v${i}`, { calories: 300 + i * 60 })); // 300..1080 kcal
    const goal = 2400;
    const plan = fillWeek({ breakfast: varied, lunch: varied, dinner: varied }, mulberry32(11), goal);
    for (let d = 0; d < 7; d++) {
      const total = [plan.breakfast[d], plan.lunch[d], plan.dinner[d]]
        .reduce((sum, m) => sum + (m.recipe.calories ?? 0) * m.servings, 0);
      expect(Math.abs(total - goal) / goal).toBeLessThanOrEqual(0.1);
      for (const m of [plan.breakfast[d], plan.lunch[d], plan.dinner[d]]) {
        expect([0.5, 0.75, 1, 1.25, 1.5, 2]).toContain(m.servings);
      }
    }
  });
});
