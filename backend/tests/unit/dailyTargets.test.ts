import { describe, expect, it } from 'vitest';
import { calculateDailyTargets } from '../../src/services/auth.service';

// Mifflin-St Jeor: BMR = 10*kg + 6.25*cm - 5*age (+5 men, -161 women),
// x activity factor, + goal adjustment; macros 25/30/45 % of calories
describe('calculateDailyTargets', () => {
  it('man, 80 kg, 180 cm, 30 y, moderately active, maintenance', () => {
    // BMR 1780 x 1.55 = 2759
    expect(calculateDailyTargets('male', 80, 180, 30, 'moderately_active', 'maintenance')).toEqual({
      dailyCalories: 2759, protein_g: 172, fat_g: 92, carbs_g: 310, fiber_g: 39,
    });
  });

  it('woman, 60 kg, 165 cm, 30 y, lightly active, weight loss (-500 kcal)', () => {
    // BMR 1320.25 x 1.375 = 1815.3, - 500 = 1315
    expect(calculateDailyTargets('female', 60, 165, 30, 'lightly_active', 'weight_loss').dailyCalories).toBe(1315);
  });

  it('applies each goal adjustment to the same body', () => {
    const kcal = (goal: Parameters<typeof calculateDailyTargets>[5]) =>
      calculateDailyTargets('male', 80, 180, 30, 'moderately_active', goal).dailyCalories;
    expect(kcal('weight_gain') - kcal('maintenance')).toBe(300);
    expect(kcal('muscle_gain') - kcal('maintenance')).toBe(200);
    expect(kcal('healthy_eating')).toBe(kcal('maintenance'));
  });

  it('uses the activity multipliers (sedentary 1.2 ... extra active 1.9)', () => {
    expect(calculateDailyTargets('male', 80, 180, 30, 'sedentary', 'maintenance').dailyCalories).toBe(2136); // 1780 x 1.2
    expect(calculateDailyTargets('male', 80, 180, 30, 'extra_active', 'maintenance').dailyCalories).toBe(3382); // 1780 x 1.9
  });
});
