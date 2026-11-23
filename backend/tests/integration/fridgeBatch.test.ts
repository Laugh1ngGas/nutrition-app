import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, assertLocal, foodId, newUser, psql, removeUser, TestUser } from './helpers';

let u: TestUser;
beforeAll(async () => { assertLocal(); u = await newUser(); });
afterAll(async () => {
  await removeUser(u);
  // Foods the batch created for this user (photo-scan foods keep a creator link)
  psql(`DELETE FROM foods WHERE source = 'ai_photo' AND name LIKE 'Itest %' AND created_by IS NULL`);
});

const fridgeNames = async () =>
  ((await api('GET', '/fridge', undefined, u.access)).body.data as { name: string }[]).map((i) => i.name).sort();

describe('/fridge/batch (items confirmed after a photo scan)', () => {
  it('adds every item, reusing known foods and creating new ones', async () => {
    const tomato = await foodId('Tomatoes', u.access);
    const r = await api('POST', '/fridge/batch', {
      items: [
        { food_id: tomato, name: 'tomato', quantity: 4, unit: 'piece' },
        { food_id: null, name: 'onion', name_uk: 'цибуля', quantity: 2 }, // matched by name
        { food_id: null, name: 'itest dragonfruit', name_uk: 'пітахая', quantity: 1, expiry_date: '2030-01-01' }, // new
      ],
    }, u.access);
    expect(r.status).toBe(201);
    expect(r.body.data).toHaveLength(3);
    expect(await fridgeNames()).toEqual(expect.arrayContaining(['Tomatoes', 'Onion', 'Itest dragonfruit']));
    // The new food got USDA-style capitalisation and the photo-scan source
    expect(psql(`SELECT source FROM foods WHERE name = 'Itest dragonfruit'`)).toEqual([['ai_photo']]);
  });

  it('is one transaction: if one item fails, none are saved', async () => {
    const before = await fridgeNames();
    const r = await api('POST', '/fridge/batch', {
      items: [
        { food_id: null, name: 'garlic', quantity: 1 },
        // DECIMAL(8,2) overflow: the database rejects this row
        { food_id: null, name: 'carrots', quantity: 99999999999 },
      ],
    }, u.access);
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(await fridgeNames()).toEqual(before); // garlic was rolled back too
  });

  it('rejects invalid input before touching the database (422)', async () => {
    expect((await api('POST', '/fridge/batch', { items: [] }, u.access)).status).toBe(422);
    expect((await api('POST', '/fridge/batch', { items: [{ name: 'x', unit: 'bucket' }] }, u.access)).status).toBe(422);
    expect((await api('POST', '/fridge/batch', { items: Array(31).fill({ name: 'egg' }) }, u.access)).status).toBe(422);
  });
});
