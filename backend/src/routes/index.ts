import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate, optionalAuth, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/errorHandler';

// Controllers
import * as authCtrl from '../controllers/auth.controller';
import * as profileCtrl from '../controllers/profile.controller';
import * as foodsCtrl from '../controllers/foods.controller';
import * as foodLogsCtrl from '../controllers/foodLogs.controller';
import * as fridgeCtrl from '../controllers/fridge.controller';
import * as shoppingCtrl from '../controllers/shoppingList.controller';
import * as recipesCtrl from '../controllers/recipes.controller';
import * as aiCtrl from '../controllers/ai.controller';
import * as waterCtrl from '../controllers/water.controller';
import * as mealPlanCtrl from '../controllers/mealPlan.controller';
import * as progressCtrl from '../controllers/progress.controller';

const router = Router();

// Password guessing through a stolen session: 10 wrong passwords per account
// per 15 min for password change and account deletion (runs after
// authenticate, so it can key by the signed-in user)
const passwordCheckLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `password-check:${(req as AuthRequest).user?.id ?? req.ip}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many wrong passwords. Please try again in 15 minutes.' },
});

// ── Health check ────────────────────────────────────────────────────
router.get('/health', (_req, res) => {
  res.json({ success: true, message: 'MealPrepRoulette API is running 🚀', timestamp: new Date() });
});

// ── Auth ────────────────────────────────────────────────────────────
router.post('/auth/register', authCtrl.registerValidation, validate, authCtrl.register);
router.post('/auth/login', authCtrl.loginValidation, validate, authCtrl.login);
router.post('/auth/refresh', authCtrl.refresh);
router.post('/auth/logout', authCtrl.logout);
router.post('/auth/change-password', authenticate, passwordCheckLimiter, authCtrl.changePasswordValidation, validate, authCtrl.changePassword);
router.delete('/auth/account', authenticate, passwordCheckLimiter, authCtrl.deleteAccountValidation, validate, authCtrl.deleteAccount);

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

// ── Progress ─────────────────────────────────────────────────────────
router.get('/progress', authenticate, progressCtrl.progressValidation, validate, progressCtrl.getProgress);

// ── Meal planner ─────────────────────────────────────────────────────
router.get('/meal-plans/week', authenticate, mealPlanCtrl.getWeekValidation, validate, mealPlanCtrl.getWeek);
router.post('/meal-plans/week', authenticate, mealPlanCtrl.generateWeekValidation, validate, mealPlanCtrl.generateWeek);
router.put('/meal-plans/:planId/entries', authenticate, mealPlanCtrl.rearrangeValidation, validate, mealPlanCtrl.rearrange);

// ── Water ────────────────────────────────────────────────────────────
router.get('/water', authenticate, waterCtrl.getWaterValidation, validate, waterCtrl.getWater);
router.put('/water', authenticate, waterCtrl.setWaterValidation, validate, waterCtrl.setWater);

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

// ── AI assistant ─────────────────────────────────────────────────────
router.get('/ai/status', authenticate, aiCtrl.getStatus);
router.get('/ai/messages', authenticate, aiCtrl.getMessages);
router.delete('/ai/messages', authenticate, aiCtrl.clearMessages);
router.post('/ai/chat', authenticate, aiCtrl.chatValidation, validate, aiCtrl.chat);
router.post('/ai/recognize', authenticate, aiCtrl.recognizeValidation, validate, aiCtrl.recognize);

export default router;
