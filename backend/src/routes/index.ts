import { Router } from 'express';
import { authenticate, optionalAuth } from '../middleware/auth';
import { validate } from '../middleware/errorHandler';

// Controllers
import * as authCtrl from '../controllers/auth.controller';
import * as profileCtrl from '../controllers/profile.controller';
import * as foodsCtrl from '../controllers/foods.controller';
import * as foodLogsCtrl from '../controllers/foodLogs.controller';
import * as fridgeCtrl from '../controllers/fridge.controller';
import * as shoppingCtrl from '../controllers/shoppingList.controller';
import * as recipesCtrl from '../controllers/recipes.controller';

const router = Router();

// ── Health check ────────────────────────────────────────────────────
router.get('/health', (_req, res) => {
  res.json({ success: true, message: 'MealPrepRoulette API is running 🚀', timestamp: new Date() });
});

// ── Auth ────────────────────────────────────────────────────────────
router.post('/auth/register', authCtrl.registerValidation, validate, authCtrl.register);
router.post('/auth/login', authCtrl.loginValidation, validate, authCtrl.login);
router.post('/auth/refresh', authCtrl.refresh);
router.post('/auth/logout', authCtrl.logout);

// ── Profile ─────────────────────────────────────────────────────────
router.get('/profile', authenticate, profileCtrl.getMyProfile);
router.patch('/profile', authenticate, profileCtrl.profileValidation, validate, profileCtrl.updateProfile);
router.put('/profile/allergens', authenticate, profileCtrl.updateAllergens);
router.get('/allergens', profileCtrl.getAllergens);

// ── Foods ────────────────────────────────────────────────────────────
router.get('/foods', foodsCtrl.searchFoods);
router.get('/foods/categories', foodsCtrl.getFoodCategories);
router.get('/foods/barcode/:barcode', foodsCtrl.getFoodByBarcode);
router.get('/foods/:id', foodsCtrl.getFoodById);
router.post('/foods', authenticate, foodsCtrl.createFood);

// ── Food Logs ────────────────────────────────────────────────────────
router.get('/logs', authenticate, foodLogsCtrl.getDailyLog);
router.get('/logs/weekly', authenticate, foodLogsCtrl.getWeeklyStats);
router.post('/logs', authenticate, foodLogsCtrl.logFoodValidation, validate, foodLogsCtrl.addFoodLog);
router.delete('/logs/:id', authenticate, foodLogsCtrl.removeFoodLog);

// ── Fridge ───────────────────────────────────────────────────────────
router.get('/fridge', authenticate, fridgeCtrl.getFridgeItems);
router.get('/fridge/expiring', authenticate, fridgeCtrl.getExpiringItems);
router.post('/fridge', authenticate, fridgeCtrl.fridgeItemValidation, validate, fridgeCtrl.addFridgeItem);
router.patch('/fridge/:id', authenticate, fridgeCtrl.updateFridgeItem);
router.delete('/fridge/:id', authenticate, fridgeCtrl.removeFridgeItem);

// ── Recipes ──────────────────────────────────────────────────────────
router.get('/recipes', optionalAuth, recipesCtrl.searchRecipes);
router.get('/recipes/:id', optionalAuth, recipesCtrl.getRecipeById);
router.post('/recipes/:id/favorite', authenticate, recipesCtrl.toggleFavorite);

// ── Shopping Lists ───────────────────────────────────────────────────
router.get('/shopping', authenticate, shoppingCtrl.getShoppingLists);
router.post('/shopping', authenticate, shoppingCtrl.createShoppingList);
router.get('/shopping/:id', authenticate, shoppingCtrl.getShoppingListById);
router.post('/shopping/:id/items', authenticate, shoppingCtrl.addItemToList);
router.patch('/shopping/:id/items/:itemId/toggle', authenticate, shoppingCtrl.toggleItemPurchased);
router.delete('/shopping/:id/items/:itemId', authenticate, shoppingCtrl.removeItemFromList);
router.post('/shopping/generate-from-plan', authenticate, shoppingCtrl.generateFromPlan);

export default router;
