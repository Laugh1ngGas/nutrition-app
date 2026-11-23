import { describe, expect, it } from 'vitest';
import {
  IngredientInfo, findIngredient, measureForDb, measureToGrams, parseMeasure, recipeNutrition,
} from '../../src/services/recipeNutrition';

// Portion weights like the USDA data has them
const info = (name: string, g: IngredientInfo['g'], kcal = 100): IngredientInfo => ({
  name, fdc: 1, usda: name, per100: { kcal, protein: 0, carbs: 0, fat: 0, fiber: 0 }, g,
});
const flour = info('Flour', { cup: 125 }, 364);
const garlic = info('Garlic', { clove: 3, cup: 136, piece: 40 }, 149);
const onion = info('Onion', { cup: 160, piece: 110 }, 40);
const lemon = info('Lemon', { piece: 85 }, 29);
const chicken = info('Chicken', { piece: 175 }, 111);
const oil = info('Olive Oil', { cup: 216, tbsp: 13.5 }, 884);

describe('parseMeasure', () => {
  it('reads whole numbers, fractions, mixed numbers and ranges', () => {
    expect(parseMeasure('2 tbsp')).toEqual({ amount: 2, unit: 'tbsp' });
    expect(parseMeasure('1/2 cup')).toEqual({ amount: 0.5, unit: 'cup' });
    expect(parseMeasure('1 1/2 cups')).toEqual({ amount: 1.5, unit: 'cup' });
    expect(parseMeasure('½ cup')).toEqual({ amount: 0.5, unit: 'cup' });
    expect(parseMeasure('2-3')).toEqual({ amount: 2.5, unit: null });
  });

  it('takes the first of two measures and units glued to numbers', () => {
    expect(parseMeasure('200g/7oz')).toEqual({ amount: 200, unit: 'g' });
    expect(parseMeasure('1 cup (240ml)')).toEqual({ amount: 1, unit: 'cup' });
    expect(parseMeasure('1kg')).toEqual({ amount: 1, unit: 'kg' });
  });

  it('knows spelling variants and skips words like "heaped"', () => {
    expect(parseMeasure('3 tblsp')).toEqual({ amount: 3, unit: 'tbsp' });
    expect(parseMeasure('1 heaped tbsp')).toEqual({ amount: 1, unit: 'tbsp' });
    expect(parseMeasure('2 Handfull')).toEqual({ amount: 2, unit: 'handful' });
    expect(parseMeasure('Half')).toEqual({ amount: 0.5, unit: null });
  });
});

describe('measureToGrams', () => {
  it('"1 1/2 cups" of flour uses the 125 g cup', () => expect(measureToGrams('1 1/2 cups', flour)).toBe(187.5));
  it('"2 cloves" of garlic uses the 3 g clove', () => expect(measureToGrams('2 cloves', garlic)).toBe(6));
  it('"200g/7oz" is 200 g', () => expect(measureToGrams('200g/7oz', flour)).toBe(200));

  it('converts ounces, pounds and kilograms', () => {
    expect(measureToGrams('8 oz', flour)).toBe(226.8);
    expect(measureToGrams('1 lb', flour)).toBe(453.6);
    expect(measureToGrams('1kg', flour)).toBe(1000);
  });

  it('counts pieces by piece weight, scaled for large/small', () => {
    expect(measureToGrams('2 chopped', onion)).toBe(220);
    expect(measureToGrams('1 large', onion)).toBe(137.5);
    expect(measureToGrams('1 small', onion)).toBe(82.5);
  });

  it('"to taste" and garnishes are 0 g; "for frying" is about a tablespoon', () => {
    expect(measureToGrams('to taste', flour)).toBe(0);
    expect(measureToGrams('garnish', onion)).toBe(0);
    expect(measureToGrams('for frying', oil)).toBe(13.5);
  });

  it('"juice of 1" lemon is about a third of the fruit; "1 whole" chicken is the bird', () => {
    expect(measureToGrams('juice of 1', lemon)).toBeCloseTo(29.75, 2); // 85 g x 0.35
    expect(measureToGrams('1 whole', chicken)).toBe(1500);
  });

  it('returns null when the amount cannot be told', () => {
    expect(measureToGrams('1', flour)).toBeNull(); // flour isn't counted in pieces
  });

  it('keeps the recipe wording for the database, converting oz/lb to grams', () => {
    expect(measureForDb('2 tbsp', 27)).toEqual({ quantity: 2, unit: 'tbsp' });
    expect(measureForDb('8 oz', 226.8)).toEqual({ quantity: 226.8, unit: 'g' });
    expect(measureForDb('3 cloves', 9)).toEqual({ quantity: 3, unit: 'piece' });
  });
});

describe('recipeNutrition', () => {
  it('sums per-100 g nutrition and divides by servings', () => {
    const n = recipeNutrition(
      [{ name: 'Flour', grams: 200, info: flour }, { name: 'Onion', grams: 100, info: onion }], 2
    );
    expect(n.calories).toBe(384); // (728 + 40) / 2
    expect(n.missing).toEqual([]);
  });

  it('counts only 10% of deep-frying oil and reports ingredients it cannot count', () => {
    const n = recipeNutrition(
      [
        { name: 'Olive Oil', grams: 500, info: oil, measure: '2 cups for frying' },
        { name: 'Mystery Spice', grams: 5, info: null },
        { name: 'Salt', grams: 0, info: null }, // 0 g isn't "missing"
      ], 1
    );
    expect(n.calories).toBe(442); // 50 g x 8.84
    expect(n.missing).toEqual(['Mystery Spice']);
  });
});

describe('findIngredient (real USDA data file)', () => {
  it('finds names case-insensitively and singular/plural', () => {
    expect(findIngredient('Onion')?.usda).toBe('Onions, raw');
    expect(findIngredient('onions')?.usda).toBe('Onions, raw');
    expect(findIngredient('Garlic Clove')?.g.clove).toBe(3);
  });
});
