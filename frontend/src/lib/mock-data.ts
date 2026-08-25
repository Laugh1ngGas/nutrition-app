export type ExpiryStatus = "fresh" | "soon" | "expired";

export type FridgeItem = {
  id: string;
  name: string;
  emoji: string;
  quantity: string;
  daysToExpiry: number;
  category: "Fridge" | "Freezer" | "Pantry" | "Spices";
};

export const fridgeItems: FridgeItem[] = [
  { id: "1", name: "Chicken breast", emoji: "🍗", quantity: "400g", daysToExpiry: 2, category: "Fridge" },
  { id: "2", name: "Broccoli", emoji: "🥦", quantity: "1 head", daysToExpiry: 1, category: "Fridge" },
  { id: "3", name: "Eggs", emoji: "🥚", quantity: "6 pcs", daysToExpiry: 10, category: "Fridge" },
  { id: "4", name: "Greek yogurt", emoji: "🥛", quantity: "200g", daysToExpiry: 3, category: "Fridge" },
  { id: "5", name: "Pasta", emoji: "🍝", quantity: "500g", daysToExpiry: 180, category: "Pantry" },
  { id: "6", name: "Canned tomatoes", emoji: "🥫", quantity: "400g", daysToExpiry: 365, category: "Pantry" },
  { id: "7", name: "Cheddar cheese", emoji: "🧀", quantity: "150g", daysToExpiry: 7, category: "Fridge" },
  { id: "8", name: "Spinach", emoji: "🥬", quantity: "100g", daysToExpiry: 2, category: "Fridge" },
  { id: "9", name: "Olive oil", emoji: "🫒", quantity: "500ml", daysToExpiry: 300, category: "Pantry" },
  { id: "10", name: "Garlic", emoji: "🧄", quantity: "4 cloves", daysToExpiry: 14, category: "Pantry" },
];

export function expiryStatus(days: number): ExpiryStatus {
  if (days <= 0) return "expired";
  if (days <= 5) return "soon";
  return "fresh";
}

export type Recipe = {
  id: string;
  name: string;
  image: string;
  kcal: number;
  prepMin: number;
  servings: number;
  match: number;
  usesIds: string[];
  needIds: string[];
  diet: string[];
  instructions: string[];
};

export const recipes: Recipe[] = [
  {
    id: "r1",
    name: "Chicken & Broccoli Stir-fry",
    image: "https://placehold.co/300x200/95D5B2/2D6A4F?text=Stir-fry",
    kcal: 480,
    prepMin: 25,
    servings: 2,
    match: 91,
    usesIds: ["1", "2", "10", "9"],
    needIds: ["soy sauce", "ginger"],
    diet: ["Gluten-Free"],
    instructions: [
      "Slice chicken and season.",
      "Sauté garlic in olive oil.",
      "Add chicken, cook until golden.",
      "Toss in broccoli, finish with soy.",
    ],
  },
  {
    id: "r2",
    name: "Spinach & Egg Frittata",
    image: "https://placehold.co/300x200/52B788/ffffff?text=Frittata",
    kcal: 320,
    prepMin: 20,
    servings: 2,
    match: 88,
    usesIds: ["3", "8", "7", "9"],
    needIds: ["onion"],
    diet: ["Vegetarian", "Gluten-Free"],
    instructions: ["Whisk eggs.", "Sauté spinach.", "Combine in pan with cheese.", "Bake until set."],
  },
  {
    id: "r3",
    name: "Pasta Arrabbiata",
    image: "https://placehold.co/300x200/2D6A4F/ffffff?text=Pasta",
    kcal: 540,
    prepMin: 20,
    servings: 2,
    match: 82,
    usesIds: ["5", "6", "10"],
    needIds: ["chili", "parsley"],
    diet: ["Vegetarian"],
    instructions: ["Boil pasta.", "Sauté garlic & chili.", "Add tomatoes, simmer.", "Toss with pasta."],
  },
  {
    id: "r4",
    name: "Greek Yogurt Parfait",
    image: "https://placehold.co/300x200/95D5B2/2D6A4F?text=Parfait",
    kcal: 240,
    prepMin: 5,
    servings: 1,
    match: 70,
    usesIds: ["4"],
    needIds: ["berries", "granola"],
    diet: ["Vegetarian"],
    instructions: ["Layer yogurt and toppings.", "Drizzle with honey."],
  },
  {
    id: "r5",
    name: "Cheesy Broccoli Soup",
    image: "https://placehold.co/300x200/52B788/ffffff?text=Soup",
    kcal: 380,
    prepMin: 30,
    servings: 3,
    match: 86,
    usesIds: ["2", "7", "10", "9"],
    needIds: ["cream", "stock"],
    diet: ["Vegetarian"],
    instructions: ["Sauté garlic.", "Add broccoli & stock, simmer.", "Blend.", "Stir in cheese."],
  },
  {
    id: "r6",
    name: "Garlic Chicken with Spinach",
    image: "https://placehold.co/300x200/2D6A4F/ffffff?text=Chicken",
    kcal: 460,
    prepMin: 30,
    servings: 2,
    match: 94,
    usesIds: ["1", "8", "10", "9", "7"],
    needIds: ["lemon"],
    diet: ["Gluten-Free", "Keto"],
    instructions: ["Sear chicken.", "Add garlic.", "Wilt spinach.", "Top with cheese."],
  },
];

export const user = {
  name: "Alex Johnson",
  goal: "Reduce Food Waste",
  // budget: 80,
  // currency: "€",
  household: 2,
};

export type MealPlan = Record<string, { breakfast: string; lunch: string; dinner: string }>;
export const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const mealPlan: MealPlan = {
  Mon: { breakfast: "r4", lunch: "r2", dinner: "r1" },
  Tue: { breakfast: "r4", lunch: "r3", dinner: "r6" },
  Wed: { breakfast: "r2", lunch: "r5", dinner: "r1" },
  Thu: { breakfast: "r4", lunch: "r3", dinner: "r6" },
  Fri: { breakfast: "r2", lunch: "r5", dinner: "r1" },
  Sat: { breakfast: "r4", lunch: "r6", dinner: "r3" },
  Sun: { breakfast: "r2", lunch: "r1", dinner: "r5" },
};

export const shoppingList = [
  { category: "Produce", items: [{ name: "Onion", qty: "2 pcs" /* price: 0.8 */ }, { name: "Lemon", qty: "2 pcs" /* price: 0.6 */ }, { name: "Parsley", qty: "1 bunch" /* price: 1.2 */ }] },
  { category: "Dairy", items: [{ name: "Cream", qty: "200ml" /* price: 1.5 */ }] },
  { category: "Meat & Fish", items: [{ name: "Chicken thigh", qty: "500g" /* price: 4.5 */ }] },
  { category: "Grains & Pasta", items: [{ name: "Granola", qty: "300g" /* price: 3.2 */ }] },
  { category: "Canned Goods", items: [{ name: "Chicken stock", qty: "500ml" /* price: 1.8 */ }] },
  { category: "Other", items: [{ name: "Soy sauce", qty: "150ml" /* price: 2.1 */ }, { name: "Chili flakes", qty: "50g" /* price: 1.4 */ }] },
];
