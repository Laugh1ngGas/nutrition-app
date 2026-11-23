// A user must not be able to read or change another user's data
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, assertLocal, foodId, monday, newUser, psql, removeUser, TestUser } from './helpers';

let a: TestUser, b: TestUser;
let fridgeItemId: string, planId: string, entryIds: string[], listId: string, listItemId: string, privateRecipeId: string;

beforeAll(async () => {
  assertLocal();
  [a, b] = [await newUser('own-a'), await newUser('own-b')];
  const tomato = await foodId('Tomatoes', a.access);
  fridgeItemId = (await api('POST', '/fridge', { food_id: tomato, quantity: 3, unit: 'piece' }, a.access)).body.data.id;
  const week = (await api('POST', '/meal-plans/week', { start: monday() }, a.access)).body.data;
  planId = week.id;
  entryIds = week.entries.map((e: { id: string }) => e.id);
  listId = (await api('POST', '/shopping', { name: 'A list' }, a.access)).body.data.id;
  listItemId = (await api('POST', `/shopping/${listId}/items`, { food_id: tomato, quantity: 2, unit: 'piece' }, a.access)).body.data.id;
  // A private recipe of A's, as if saved from the assistant
  privateRecipeId = psql(`INSERT INTO recipes (title, is_public, created_by, source, servings)
                          VALUES ('Itest private recipe', FALSE, '${a.id}', 'ai', 2) RETURNING id`)[0][0];
});
// B first: a list B built from A's plan (the bug below) would block deleting A
afterAll(async () => { await removeUser(b); await removeUser(a); });

describe("another user's fridge", () => {
  it("can't change or delete A's fridge item", async () => {
    expect((await api('PATCH', `/fridge/${fridgeItemId}`, { quantity: 99 }, b.access)).status).toBe(404);
    expect((await api('DELETE', `/fridge/${fridgeItemId}`, undefined, b.access)).status).toBe(404);
    const item = (await api('GET', '/fridge', undefined, a.access)).body.data.find((i: { id: string }) => i.id === fridgeItemId);
    expect(Number(item.quantity)).toBe(3);
  });

  it("doesn't see A's fridge", async () => {
    expect((await api('GET', '/fridge', undefined, b.access)).body.data).toEqual([]);
  });
});

describe("another user's meal plan", () => {
  it("can't rearrange A's plan", async () => {
    const moves = entryIds.slice(0, 2).map((id) => ({ id, planned_date: monday(), meal_type: 'lunch' }));
    expect((await api('PUT', `/meal-plans/${planId}/entries`, { entries: moves }, b.access)).status).toBe(404);
  });

  it("doesn't get A's week", async () => {
    expect((await api('GET', `/meal-plans/week?start=${monday()}`, undefined, b.access)).body.data).toBeNull();
  });
});

describe("another user's private recipe", () => {
  it("can't open it or find it; the owner can", async () => {
    expect((await api('GET', `/recipes/${privateRecipeId}`, undefined, b.access)).status).toBe(404);
    const search = await api('GET', '/recipes?q=Itest%20private&limit=50', undefined, b.access);
    expect(search.body.data.map((r: { id: string }) => r.id)).not.toContain(privateRecipeId);
    expect((await api('GET', `/recipes/${privateRecipeId}`, undefined, a.access)).status).toBe(200);
  });
});

describe("another user's shopping list", () => {
  it("can't read A's list or add, toggle or remove its items", async () => {
    expect((await api('GET', `/shopping/${listId}`, undefined, b.access)).status).toBe(404);
    expect((await api('POST', `/shopping/${listId}/items`, { food_id: (await foodId('Onion', b.access)), quantity: 1 }, b.access)).status).toBe(404);
    expect((await api('PATCH', `/shopping/${listId}/items/${listItemId}/toggle`, undefined, b.access)).status).toBe(404);
    await api('DELETE', `/shopping/${listId}/items/${listItemId}`, undefined, b.access);
    const list = await api('GET', `/shopping/${listId}`, undefined, a.access);
    expect(list.body.data.items.map((i: { id: string }) => i.id)).toContain(listItemId); // still there
  });

  it("can't build a shopping list from A's meal plan", async () => {
    const r = await api('POST', '/shopping/generate-from-plan',
      { plan_id: planId, start_date: monday(), end_date: monday() }, b.access);
    expect(r.status).toBe(404);
  });
});
