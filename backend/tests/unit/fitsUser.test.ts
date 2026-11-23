import { describe, expect, it } from 'vitest';
import { fitsUser } from '../../src/services/mealPlan.service';

// Recipes carry no allergen data, so fitsUser checks ingredient names
const recipe = (ingredients: string[], diet_types: string[] | null = null) => ({ ingredients, diet_types });
const fits = (ingredients: string[], diet: string | null, allergens: string[] = [], tags: string[] | null = null) =>
  fitsUser(recipe(ingredients, tags), diet, allergens);

describe('fitsUser: diets', () => {
  it('vegetarian rejects meat and fish, keeps eggs and dairy', () => {
    expect(fits(['chicken breast', 'onion'], 'vegetarian')).toBe(false);
    expect(fits(['salmon', 'lemon'], 'vegetarian')).toBe(false);
    expect(fits(['shredded meat', 'arepa'], 'vegetarian')).toBe(false); // generic "meat"
    expect(fits(['worcestershire sauce', 'cheddar cheese'], 'vegetarian')).toBe(false); // contains anchovies
    expect(fits(['eggs', 'milk', 'cheddar cheese'], 'vegetarian')).toBe(true);
  });

  it('vegan also rejects dairy, eggs and honey, unless the recipe is tagged vegan', () => {
    expect(fits(['oats', 'honey'], 'vegan')).toBe(false);
    expect(fits(['flour', 'eggs'], 'vegan')).toBe(false);
    expect(fits(['pasta', 'butter'], 'vegan')).toBe(false);
    expect(fits(['chickpeas', 'tahini', 'lemon'], 'vegan')).toBe(true);
  });

  it('a "vegetarian"/"vegan" label does not override the ingredients (TheMealDB mislabels some)', () => {
    expect(fits(['beans', 'bacon'], 'vegetarian', [], ['vegetarian'])).toBe(false);
    expect(fits(['rice noodles', 'fish sauce'], 'vegetarian', [], ['vegetarian'])).toBe(false);
    expect(fits(['tofu', 'honey'], 'vegan', [], ['vegan'])).toBe(false);
    expect(fits(['tofu', 'rice'], 'vegan', [], ['vegan'])).toBe(true);
  });

  it('halal rejects pork and alcohol; pescatarian allows fish but not meat', () => {
    expect(fits(['bacon', 'eggs'], 'halal')).toBe(false);
    expect(fits(['beef', 'red wine'], 'halal')).toBe(false);
    expect(fits(['beef', 'onion'], 'halal')).toBe(true);
    expect(fits(['cod', 'potatoes'], 'pescatarian')).toBe(true);
    expect(fits(['lamb', 'potatoes'], 'pescatarian')).toBe(false);
  });

  it('gluten-free rejects wheat, soy sauce and pasta, but not buckwheat', () => {
    expect(fits(['soy sauce', 'rice'], 'gluten_free')).toBe(false);
    expect(fits(['spaghetti', 'tomato'], 'gluten_free')).toBe(false);
    expect(fits(['buckwheat', 'mushrooms'], 'gluten_free')).toBe(true);
  });

  it('a standard diet with no allergies accepts anything', () => {
    expect(fits(['pork', 'beer', 'peanuts'], 'standard')).toBe(true);
    expect(fits(['pork'], null)).toBe(true);
  });
});

describe('fitsUser: allergens and look-alike names', () => {
  it('tree nuts: "pine nuts" and "almonds" are nuts, "nutmeg" and "coconut" are not', () => {
    expect(fits(['pine nuts', 'basil'], null, ['tree_nuts'])).toBe(false);
    expect(fits(['ground almonds', 'sugar'], null, ['tree_nuts'])).toBe(false);
    expect(fits(['walnuts'], null, ['tree_nuts'])).toBe(false);
    expect(fits(['nutmeg', 'milk'], null, ['tree_nuts'])).toBe(true);
    expect(fits(['coconut milk', 'rice'], null, ['tree_nuts'])).toBe(true);
  });

  it('eggs: "eggs" and "mayonnaise" contain egg, "eggplant" does not', () => {
    expect(fits(['eggs'], null, ['eggs'])).toBe(false);
    expect(fits(['mayonnaise'], null, ['eggs'])).toBe(false);
    expect(fits(['eggplant', 'tomato'], null, ['eggs'])).toBe(true);
  });

  it('peanuts are their own allergen: peanut butter fails peanuts, not tree nuts', () => {
    expect(fits(['peanut butter'], null, ['peanuts'])).toBe(false);
    expect(fits(['peanut butter'], null, ['tree_nuts'])).toBe(true);
  });

  it('dairy: butter and cheese contain dairy, butternut squash does not', () => {
    expect(fits(['butter'], null, ['dairy'])).toBe(false);
    expect(fits(['parmesan'], null, ['dairy'])).toBe(false);
    expect(fits(['butternut squash', 'onion'], null, ['dairy'])).toBe(true);
  });

  it('dairy: coconut milk and coconut cream are plant-based', () => {
    expect(fits(['coconut milk', 'chickpeas'], null, ['dairy'])).toBe(true);
    expect(fits(['coconut cream', 'mango'], null, ['dairy'])).toBe(true);
    expect(fits(['coconut milk', 'chickpeas', 'curry powder'], 'vegan')).toBe(true);
  });

  it('fish allergy covers anchovy-based Worcestershire sauce; shellfish covers prawns', () => {
    expect(fits(['worcestershire sauce'], null, ['fish'])).toBe(false);
    expect(fits(['king prawns'], null, ['shellfish'])).toBe(false);
  });

  it('several allergens at once: any one is enough to reject', () => {
    expect(fits(['rice', 'sesame seed oil'], null, ['dairy', 'sesame'])).toBe(false);
    expect(fits(['rice', 'carrots'], null, ['dairy', 'sesame'])).toBe(true);
  });
});
