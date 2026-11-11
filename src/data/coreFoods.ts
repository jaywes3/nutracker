import type { FoodItem, Micronutrients, Sex } from '../types';

export function emptyMicros(): Micronutrients {
  return {
    fiber: 0,
    sugar: 0,
    satFat: 0,
    sodium: 0,
    potassium: 0,
    calcium: 0,
    iron: 0,
    magnesium: 0,
    zinc: 0,
    vitC: 0,
    vitD: 0,
    vitB12: 0,
  };
}

export function scaleMicros(m: Micronutrients, factor: number): Micronutrients {
  const r = (v: number) => Math.round(v * factor * 10) / 10;
  return {
    fiber: r(m.fiber),
    sugar: r(m.sugar),
    satFat: r(m.satFat),
    sodium: Math.round(m.sodium * factor),
    potassium: Math.round(m.potassium * factor),
    calcium: Math.round(m.calcium * factor),
    iron: r(m.iron),
    magnesium: Math.round(m.magnesium * factor),
    zinc: r(m.zinc),
    vitC: r(m.vitC),
    vitD: r(m.vitD),
    vitB12: Math.round(m.vitB12 * factor * 100) / 100,
  };
}

export function sumMicros(list: Micronutrients[]): Micronutrients {
  const acc = emptyMicros();
  for (const m of list) {
    acc.fiber += m.fiber || 0;
    acc.sugar += m.sugar || 0;
    acc.satFat += m.satFat || 0;
    acc.sodium += m.sodium || 0;
    acc.potassium += m.potassium || 0;
    acc.calcium += m.calcium || 0;
    acc.iron += m.iron || 0;
    acc.magnesium += m.magnesium || 0;
    acc.zinc += m.zinc || 0;
    acc.vitC += m.vitC || 0;
    acc.vitD += m.vitD || 0;
    acc.vitB12 += m.vitB12 || 0;
  }
  return scaleMicros(acc, 1);
}

export function getDriTargets(sex: Sex): Micronutrients {
  const isMale = sex === 'male';
  const isFemale = sex === 'female';
  return {
    fiber: isMale ? 38 : isFemale ? 25 : 31,
    sugar: 50, // upper reference
    satFat: 22, // upper reference
    sodium: 2300, // upper reference mg
    potassium: isMale ? 3400 : isFemale ? 2600 : 3000,
    calcium: 1000,
    iron: isFemale ? 18 : 8,
    magnesium: isMale ? 420 : isFemale ? 320 : 370,
    zinc: isMale ? 11 : isFemale ? 8 : 9.5,
    vitC: isMale ? 90 : isFemale ? 75 : 82,
    vitD: 15, // mcg (600 IU)
    vitB12: 2.4, // mcg
  };
}

const mk = (
  id: string,
  name: string,
  category: string,
  kcal: number,
  p: number,
  c: number,
  f: number,
  servings: Array<[string, number]>,
  micros: Partial<Micronutrients>,
  extra?: { brand?: string; barcode?: string; favorite?: boolean }
): FoodItem => ({
  id,
  name,
  category,
  brand: extra?.brand,
  barcode: extra?.barcode,
  favorite: extra?.favorite,
  source: 'core',
  caloriesPer100g: kcal,
  proteinPer100g: p,
  carbsPer100g: c,
  fatPer100g: f,
  microsPer100g: { ...emptyMicros(), ...micros },
  servings: [
    ...servings.map(([label, grams]) => ({ label, grams })),
    { label: '100 g', grams: 100 },
    { label: '1 oz (28g)', grams: 28.35 },
  ],
});

export const CORE_FOODS: FoodItem[] = [
  // Proteins & Meats
  mk('core-chicken-breast', 'Chicken Breast, Cooked (Skinless)', 'Protein', 165, 31.0, 0, 3.6, [['1 breast (170g)', 170], ['150 g', 150], ['200 g', 200]], { sodium: 74, potassium: 256, magnesium: 29, iron: 1.0, zinc: 1.0, vitB12: 0.34, satFat: 1.0 }, { favorite: true }),
  mk('core-chicken-thigh', 'Chicken Thigh, Cooked (Boneless)', 'Protein', 209, 26.0, 0, 10.9, [['1 thigh (115g)', 115], ['150 g', 150]], { sodium: 88, potassium: 240, magnesium: 25, iron: 1.3, zinc: 2.1, vitB12: 0.62, satFat: 3.0 }),
  mk('core-ground-beef-93', 'Ground Beef, 93% Lean / 7% Fat (Cooked)', 'Protein', 192, 28.2, 0, 8.1, [['4 oz cooked (113g)', 113], ['150 g', 150], ['200 g', 200]], { sodium: 72, potassium: 330, iron: 2.8, zinc: 6.5, magnesium: 23, vitB12: 2.7, satFat: 3.3 }, { favorite: true }),
  mk('core-sirloin-steak', 'Top Sirloin Steak, Cooked', 'Protein', 206, 30.3, 0, 8.6, [['6 oz steak (170g)', 170], ['200 g', 200]], { sodium: 62, potassium: 342, iron: 2.1, zinc: 5.9, magnesium: 26, vitB12: 1.9, satFat: 3.4 }),
  mk('core-ground-turkey-93', 'Ground Turkey, 93% Lean (Cooked)', 'Protein', 190, 27.4, 0, 8.3, [['4 oz cooked (113g)', 113], ['170 g', 170]], { sodium: 85, potassium: 270, iron: 1.5, zinc: 3.1, magnesium: 26, vitB12: 1.4, satFat: 2.2 }),
  mk('core-salmon-atlantic', 'Atlantic Salmon, Cooked', 'Protein', 206, 22.1, 0, 12.4, [['1 fillet (154g)', 154], ['4 oz (113g)', 113]], { sodium: 61, potassium: 384, magnesium: 30, calcium: 15, iron: 0.5, zinc: 0.6, vitD: 13.1, vitB12: 2.8, satFat: 2.5 }, { favorite: true }),
  mk('core-tuna-canned', 'Canned Light Tuna in Water (Drained)', 'Protein', 116, 25.5, 0, 0.8, [['1 can drained (113g)', 113]], { sodium: 247, potassium: 237, iron: 1.5, magnesium: 27, zinc: 0.8, vitD: 2.0, vitB12: 2.5, satFat: 0.2 }, { brand: 'StarKist', barcode: '0080000006758' }),
  mk('core-shrimp', 'Shrimp, Cooked', 'Protein', 99, 24.0, 0.2, 0.3, [['150 g', 150], ['6 oz (170g)', 170]], { sodium: 111, potassium: 259, calcium: 70, iron: 0.5, magnesium: 39, zinc: 1.6, vitB12: 1.66, satFat: 0.1 }),
  mk('core-egg-whole', 'Egg, Whole Large (Cooked)', 'Protein', 143, 12.6, 0.7, 9.5, [['1 large egg (50g)', 50], ['2 large eggs (100g)', 100], ['3 large eggs (150g)', 150]], { sodium: 142, potassium: 138, calcium: 56, iron: 1.75, magnesium: 12, zinc: 1.29, vitD: 2.0, vitB12: 0.89, satFat: 3.1 }, { favorite: true }),
  mk('core-egg-whites', 'Liquid Egg Whites', 'Protein', 52, 10.9, 0.7, 0.2, [['100 g', 100], ['150 g', 150], ['1 cup (243g)', 243]], { sodium: 166, potassium: 163, calcium: 7, magnesium: 11, vitB12: 0.09 }),
  mk('core-tofu-firm', 'Firm Tofu', 'Protein', 144, 17.3, 2.8, 8.7, [['1/2 block (170g)', 170], ['100 g', 100]], { fiber: 2.3, calcium: 683, iron: 2.7, magnesium: 58, potassium: 237, zinc: 1.6, satFat: 1.3 }),
  mk('core-turkey-bacon', 'Turkey Bacon, Cooked', 'Protein', 218, 22.0, 3.0, 14.0, [['2 slices (30g)', 30], ['3 slices (45g)', 45]], { sodium: 1150, potassium: 210, iron: 1.2, zinc: 2.2, satFat: 4.0 }),

  // Dairy & Protein Supplements
  mk('core-greek-yogurt-0', 'Greek Yogurt, Plain Nonfat (0%)', 'Dairy', 59, 10.3, 3.6, 0.4, [['170 g container', 170], ['200 g bowl', 200], ['1 cup (227g)', 227]], { sugar: 3.2, sodium: 36, potassium: 141, calcium: 110, magnesium: 11, zinc: 0.5, vitB12: 0.75 }, { brand: 'Fage Total 0%', barcode: '0689544080602', favorite: true }),
  mk('core-greek-yogurt-2', 'Greek Yogurt, Plain 2%', 'Dairy', 73, 9.9, 3.8, 1.9, [['170 g container', 170], ['200 g bowl', 200]], { sugar: 3.5, sodium: 35, potassium: 140, calcium: 115, magnesium: 11, zinc: 0.5, vitB12: 0.72, satFat: 1.2 }, { brand: 'Fage Total 2%' }),
  mk('core-cottage-cheese-2', 'Cottage Cheese, Lowfat 2%', 'Dairy', 81, 10.5, 4.3, 2.3, [['1/2 cup (113g)', 113], ['1 cup (226g)', 226]], { sugar: 4.0, sodium: 321, potassium: 120, calcium: 103, magnesium: 9, zinc: 0.5, vitB12: 0.47, satFat: 1.4 }),
  mk('core-whey-isolate', 'Whey Protein Powder (Gold Standard)', 'Supplements', 387, 77.4, 9.7, 3.2, [['1 scoop (31g)', 31], ['1.5 scoops (46.5g)', 46.5], ['2 scoops (62g)', 62]], { sugar: 3.2, sodium: 419, potassium: 516, calcium: 419, iron: 1.2, satFat: 1.6 }, { brand: 'Optimum Nutrition', barcode: '0748927028669', favorite: true }),
  mk('core-fairlife-milk-2', 'Ultra-Filtered Milk, 2% Reduced Fat', 'Dairy', 50, 5.4, 2.5, 1.9, [['1 cup (240ml)', 240], ['1/2 cup (120ml)', 120]], { sugar: 2.5, sodium: 50, potassium: 175, calcium: 158, vitD: 2.1, vitB12: 0.6, satFat: 1.2 }, { brand: 'Fairlife', barcode: '0811620020036' }),
  mk('core-cheddar-cheese', 'Sharp Cheddar Cheese', 'Dairy', 403, 22.9, 3.4, 33.3, [['1 slice / oz (28g)', 28], ['1/4 cup shredded (28g)', 28]], { sodium: 653, calcium: 710, potassium: 76, zinc: 3.6, vitB12: 1.1, satFat: 19.3 }),
  mk('core-mozzarella-part-skim', 'Part-Skim Mozzarella Cheese', 'Dairy', 280, 24.3, 2.8, 17.1, [['1 oz (28g)', 28], ['50 g', 50]], { sodium: 619, calcium: 731, potassium: 84, zinc: 2.8, vitB12: 0.9, satFat: 10.9 }),

  // Grains, Breads & Starches
  mk('core-jasmine-rice', 'White Jasmine Rice, Cooked', 'Grains', 130, 2.7, 28.2, 0.3, [['1 cup cooked (158g)', 158], ['150 g', 150], ['200 g', 200], ['250 g', 250]], { fiber: 0.4, sodium: 1, potassium: 35, magnesium: 12, iron: 1.2 }, { favorite: true }),
  mk('core-brown-rice', 'Brown Rice, Cooked', 'Grains', 123, 2.7, 25.6, 1.0, [['1 cup cooked (195g)', 195], ['150 g', 150]], { fiber: 1.6, sodium: 4, potassium: 86, magnesium: 39, iron: 0.6, zinc: 0.7 }),
  mk('core-rolled-oats', 'Rolled Oats (Dry)', 'Grains', 379, 13.2, 67.7, 6.5, [['1/2 cup dry (40g)', 40], ['60 g dry', 60], ['1 cup dry (80g)', 80]], { fiber: 10.1, sugar: 1.0, sodium: 6, potassium: 362, calcium: 52, iron: 4.3, magnesium: 138, zinc: 3.6, satFat: 1.1 }, { brand: 'Quaker', barcode: '0030000010402', favorite: true }),
  mk('core-sourdough-bread', 'Sourdough Bread, Sliced', 'Grains', 272, 10.8, 51.9, 2.1, [['1 slice (45g)', 45], ['2 slices (90g)', 90]], { fiber: 2.2, sugar: 1.8, sodium: 530, potassium: 120, iron: 3.1, calcium: 42, magnesium: 28 }, { favorite: true }),
  mk('core-ezekiel-bread', 'Sprouted Whole Grain Bread', 'Grains', 235, 14.7, 44.1, 1.5, [['1 slice (34g)', 34], ['2 slices (68g)', 68]], { fiber: 8.8, sodium: 221, potassium: 240, iron: 2.6, magnesium: 65, zinc: 2.1 }, { brand: 'Ezekiel 4:9', barcode: '0073472001202' }),
  mk('core-potato-russet', 'Russet Potato, Baked (With Skin)', 'Grains', 95, 2.6, 21.4, 0.1, [['1 medium potato (173g)', 173], ['200 g', 200], ['250 g', 250]], { fiber: 2.3, sugar: 1.2, sodium: 10, potassium: 550, magnesium: 28, iron: 1.1, vitC: 8.3 }, { favorite: true }),
  mk('core-sweet-potato', 'Sweet Potato, Baked', 'Grains', 90, 2.0, 20.7, 0.1, [['1 medium (150g)', 150], ['200 g', 200]], { fiber: 3.3, sugar: 6.5, sodium: 36, potassium: 475, calcium: 38, magnesium: 27, iron: 0.7, vitC: 19.6 }),
  mk('core-pasta-cooked', 'Pasta / Spaghetti, Cooked', 'Grains', 158, 5.8, 30.9, 0.9, [['1 cup cooked (140g)', 140], ['200 g cooked', 200]], { fiber: 1.8, sugar: 0.6, sodium: 1, potassium: 44, iron: 1.3, magnesium: 18 }),
  mk('core-quinoa-cooked', 'Quinoa, Cooked', 'Grains', 120, 4.4, 21.3, 1.9, [['1 cup cooked (185g)', 185], ['150 g', 150]], { fiber: 2.8, potassium: 172, magnesium: 64, iron: 1.5, zinc: 1.1 }),
  mk('core-flour-tortilla', 'Carb Balance Flour Tortilla', 'Grains', 167, 11.9, 45.2, 7.1, [['1 tortilla (42g)', 42], ['2 tortillas (84g)', 84]], { fiber: 35.7, sodium: 762, calcium: 180, iron: 2.4 }, { brand: 'Mission', barcode: '0073731004152' }),

  // Fruits
  mk('core-banana', 'Banana, Raw', 'Fruits', 89, 1.1, 22.8, 0.3, [['1 medium banana (118g)', 118], ['1 large banana (136g)', 136]], { fiber: 2.6, sugar: 12.2, sodium: 1, potassium: 358, magnesium: 27, vitC: 8.7 }, { favorite: true }),
  mk('core-blueberries', 'Blueberries, Raw or Frozen', 'Fruits', 57, 0.7, 14.5, 0.3, [['1/2 cup (74g)', 74], ['100 g', 100], ['1 cup (148g)', 148]], { fiber: 2.4, sugar: 10.0, potassium: 77, vitC: 9.7, iron: 0.3, magnesium: 6 }, { favorite: true }),
  mk('core-strawberries', 'Strawberries, Raw', 'Fruits', 32, 0.7, 7.7, 0.3, [['100 g', 100], ['1 cup halves (152g)', 152]], { fiber: 2.0, sugar: 4.9, potassium: 153, vitC: 58.8, magnesium: 13, calcium: 16 }),
  mk('core-apple', 'Apple (Honeycrisp / Gala), Raw', 'Fruits', 52, 0.3, 13.8, 0.2, [['1 medium apple (182g)', 182]], { fiber: 2.4, sugar: 10.4, potassium: 107, vitC: 4.6, magnesium: 5 }),
  mk('core-orange', 'Navel Orange, Raw', 'Fruits', 49, 0.9, 12.5, 0.1, [['1 medium orange (140g)', 140]], { fiber: 2.2, sugar: 8.5, potassium: 166, calcium: 43, vitC: 59.1, magnesium: 11 }),
  mk('core-avocado', 'Avocado, Hass', 'Fruits', 160, 2.0, 8.5, 14.7, [['1/2 avocado (68g)', 68], ['1 whole avocado (136g)', 136], ['50 g', 50]], { fiber: 6.7, sugar: 0.7, sodium: 7, potassium: 485, magnesium: 29, iron: 0.6, zinc: 0.6, vitC: 10.0, satFat: 2.1 }, { favorite: true }),

  // Vegetables & Legumes
  mk('core-broccoli', 'Broccoli Florets, Steamed', 'Vegetables', 35, 2.4, 7.2, 0.4, [['1 cup (156g)', 156], ['100 g', 100], ['200 g', 200]], { fiber: 3.3, sugar: 1.4, sodium: 41, potassium: 293, calcium: 40, iron: 0.7, magnesium: 21, vitC: 64.9 }),
  mk('core-spinach', 'Baby Spinach, Raw or Sauteed', 'Vegetables', 23, 2.9, 3.6, 0.4, [['2 cups raw (60g)', 60], ['100 g', 100]], { fiber: 2.2, sugar: 0.4, sodium: 79, potassium: 558, calcium: 99, iron: 2.7, magnesium: 79, vitC: 28.1 }),
  mk('core-bell-pepper', 'Red Bell Pepper, Raw', 'Vegetables', 31, 1.0, 6.0, 0.3, [['1 medium pepper (119g)', 119], ['100 g', 100]], { fiber: 2.1, sugar: 4.2, sodium: 4, potassium: 211, vitC: 127.7, magnesium: 12 }),
  mk('core-asparagus', 'Asparagus, Roasted / Steamed', 'Vegetables', 22, 2.4, 4.1, 0.2, [['6 spears (90g)', 90], ['150 g', 150]], { fiber: 2.0, sugar: 1.3, potassium: 224, iron: 0.9, magnesium: 14, vitC: 7.7 }),
  mk('core-mixed-greens', 'Spring Mix Salad Greens', 'Vegetables', 20, 1.8, 3.3, 0.2, [['2 cups (85g)', 85]], { fiber: 1.8, potassium: 310, calcium: 55, iron: 1.4, magnesium: 24, vitC: 18.0 }),
  mk('core-black-beans', 'Black Beans, Cooked / Canned (Drained)', 'Legumes', 132, 8.9, 23.7, 0.5, [['1/2 cup (86g)', 86], ['1 cup (172g)', 172]], { fiber: 8.7, sugar: 0.3, sodium: 140, potassium: 355, calcium: 27, iron: 2.1, magnesium: 70, zinc: 1.1 }),
  mk('core-lentils', 'Lentils, Cooked', 'Legumes', 116, 9.0, 20.1, 0.4, [['1 cup cooked (198g)', 198], ['100 g', 100]], { fiber: 7.9, sugar: 1.8, sodium: 2, potassium: 369, iron: 3.3, magnesium: 36, zinc: 1.3 }),

  // Healthy Fats, Nuts & Oils
  mk('core-olive-oil', 'Extra Virgin Olive Oil', 'Fats & Oils', 884, 0, 0, 100.0, [['1 tsp (4.5g)', 4.5], ['1 tbsp (14g)', 14], ['10 g', 10]], { satFat: 13.8 }, { favorite: true }),
  mk('core-butter', 'Grass-Fed Butter, Salted', 'Fats & Oils', 717, 0.9, 0.1, 81.1, [['1 pat / tsp (5g)', 5], ['1 tbsp (14g)', 14]], { sodium: 643, vitD: 1.5, satFat: 51.4 }, { brand: 'Kerrygold', barcode: '0767707001055' }),
  mk('core-peanut-butter', 'Natural Creamy Peanut Butter', 'Nuts & Seeds', 588, 25.1, 20.0, 50.4, [['1 tbsp (16g)', 16], ['2 tbsp (32g)', 32]], { fiber: 6.0, sugar: 9.0, sodium: 426, potassium: 649, magnesium: 168, iron: 1.9, zinc: 2.8, satFat: 10.3 }, { favorite: true }),
  mk('core-almonds', 'Roasted Almonds', 'Nuts & Seeds', 579, 21.2, 21.6, 49.9, [['1 oz / ~23 almonds (28g)', 28], ['15 g', 15]], { fiber: 12.5, sugar: 4.4, potassium: 733, calcium: 269, iron: 3.7, magnesium: 270, zinc: 3.1, satFat: 3.8 }),
  mk('core-chia-seeds', 'Chia Seeds', 'Nuts & Seeds', 486, 16.5, 42.1, 30.7, [['1 tbsp (12g)', 12], ['2 tbsp (24g)', 24]], { fiber: 34.4, calcium: 631, iron: 7.7, magnesium: 335, potassium: 407, zinc: 4.6, satFat: 3.3 }),
  mk('core-walnuts', 'Walnut Halves', 'Nuts & Seeds', 654, 15.2, 13.7, 65.2, [['1 oz (28g)', 28], ['15 g', 15]], { fiber: 6.7, potassium: 441, magnesium: 158, iron: 2.9, zinc: 3.1, satFat: 6.1 }),

  // Everyday Snacks, Condiments & Drinks
  mk('core-protein-bar', 'Built / Quest Style Protein Bar', 'Snacks', 333, 35.0, 36.7, 11.7, [['1 bar (60g)', 60]], { fiber: 23.3, sugar: 1.7, sodium: 350, calcium: 200, potassium: 190, satFat: 4.2 }, { brand: 'Quest Nutrition', barcode: '0888849000036' }),
  mk('core-dark-chocolate-85', 'Dark Chocolate (85% Cacao)', 'Snacks', 598, 7.8, 45.9, 42.6, [['2 squares (20g)', 20], ['1 oz (28g)', 28]], { fiber: 10.9, sugar: 14.0, iron: 11.9, magnesium: 228, potassium: 715, zinc: 3.3, satFat: 24.5 }),
  mk('core-rice-cakes', 'Lightly Salted Rice Cakes', 'Snacks', 387, 8.2, 81.5, 2.8, [['1 cake (9g)', 9], ['2 cakes (18g)', 18]], { fiber: 4.2, sodium: 165, magnesium: 131 }, { brand: 'Lundberg' }),
  mk('core-honey', 'Raw Honey', 'Condiments', 304, 0.3, 82.4, 0, [['1 tsp (7g)', 7], ['1 tbsp (21g)', 21]], { sugar: 82.1, potassium: 52 }),
  mk('core-salsa', 'Chunky Tomato Salsa', 'Condiments', 29, 1.5, 6.5, 0.2, [['2 tbsp (30g)', 30], ['1/4 cup (60g)', 60]], { fiber: 1.8, sugar: 3.6, sodium: 620, potassium: 270, vitC: 12.0 }),
  mk('core-soy-sauce', 'Reduced Sodium Soy Sauce', 'Condiments', 53, 8.1, 4.9, 0.6, [['1 tbsp (15g)', 15]], { sodium: 3800, potassium: 212, iron: 1.5, magnesium: 40 }),
  mk('core-espresso-latte', 'Iced Oatmilk Latte (Unsweetened)', 'Beverages', 43, 0.8, 6.2, 1.6, [['12 oz cup (355g)', 355], ['16 oz grande (473g)', 473]], { fiber: 0.6, sugar: 2.8, sodium: 42, calcium: 120, potassium: 95, vitD: 1.0, vitB12: 0.3 }),

  // Raw Meats & Poultry (For Weighing Raw in Recipes!)
  mk('core-chicken-breast-raw', 'Chicken Breast, Raw (Boneless Skinless)', 'Protein', 120, 22.5, 0, 2.6, [['4 oz raw (113g)', 113], ['1 lb raw (454g)', 454]], { sodium: 45, potassium: 334, magnesium: 28, iron: 0.4, zinc: 0.7, vitB12: 0.21, satFat: 0.6 }),
  mk('core-chicken-thigh-raw', 'Chicken Thigh, Raw (Boneless Skinless)', 'Protein', 121, 19.7, 0, 4.1, [['4 oz raw (113g)', 113], ['1 lb raw (454g)', 454]], { sodium: 95, potassium: 269, iron: 0.9, zinc: 1.6, vitB12: 0.5, satFat: 1.1 }),
  mk('core-ground-beef-80-raw', 'Ground Beef, 80% Lean / 20% Fat (Raw)', 'Protein', 254, 17.2, 0, 20.0, [['4 oz raw (113g)', 113], ['1 lb raw (454g)', 454]], { sodium: 66, potassium: 270, iron: 1.9, zinc: 4.2, vitB12: 2.1, satFat: 7.6 }),
  mk('core-ground-beef-90-raw', 'Ground Beef, 90% Lean / 10% Fat (Raw)', 'Protein', 176, 20.0, 0, 10.0, [['4 oz raw (113g)', 113], ['1 lb raw (454g)', 454]], { sodium: 66, potassium: 318, iron: 2.2, zinc: 4.8, vitB12: 2.2, satFat: 3.9 }),
  mk('core-ground-beef-93-raw', 'Ground Beef, 93% Lean / 7% Fat (Raw)', 'Protein', 152, 20.9, 0, 7.0, [['4 oz raw (113g)', 113], ['1 lb raw (454g)', 454]], { sodium: 66, potassium: 336, iron: 2.3, zinc: 5.0, vitB12: 2.2, satFat: 2.9 }),
  mk('core-ground-turkey-93-raw', 'Ground Turkey, 93% Lean (Raw)', 'Protein', 150, 19.7, 0, 7.4, [['4 oz raw (113g)', 113], ['1 lb raw (454g)', 454]], { sodium: 70, potassium: 250, iron: 1.2, zinc: 2.4, vitB12: 1.2, satFat: 2.0 }),
  mk('core-ground-turkey-99-raw', 'Ground Turkey Breast, 99% Fat Free (Raw)', 'Protein', 107, 24.0, 0, 1.0, [['4 oz raw (113g)', 113], ['1 lb raw (454g)', 454]], { sodium: 55, potassium: 302, iron: 0.9, zinc: 1.5, vitB12: 0.8, satFat: 0.3 }),
  mk('core-pork-tenderloin', 'Pork Tenderloin, Cooked', 'Protein', 143, 26.2, 0, 3.5, [['4 oz (113g)', 113], ['6 oz (170g)', 170]], { sodium: 57, potassium: 421, iron: 1.1, zinc: 2.5, magnesium: 30, vitB12: 0.6, satFat: 1.2 }),
  mk('core-pork-bacon', 'Pork Bacon, Pan-Fried / Crispy', 'Protein', 541, 37.0, 1.4, 41.8, [['1 slice (8g)', 8], ['2 slices (16g)', 16], ['3 slices (24g)', 24]], { sodium: 1717, potassium: 565, iron: 1.4, zinc: 3.5, vitB12: 1.2, satFat: 13.7 }),
  mk('core-deli-turkey', 'Oven Roasted Deli Turkey Breast', 'Protein', 98, 18.0, 3.6, 1.2, [['2 oz (56g)', 56], ['4 oz (112g)', 112]], { sodium: 890, potassium: 210, iron: 0.8, zinc: 1.1, vitB12: 0.4 }),
  mk('core-rotisserie-chicken', 'Rotisserie Chicken (Pulled Breast & Thigh)', 'Protein', 190, 27.5, 0.3, 8.2, [['3 oz (85g)', 85], ['5 oz (140g)', 140], ['1 cup shredded (140g)', 140]], { sodium: 335, potassium: 245, iron: 1.0, zinc: 1.6, vitB12: 0.45, satFat: 2.3 }),
  mk('core-cod-cooked', 'Pacific / Atlantic Cod, Cooked', 'Protein', 105, 22.8, 0, 0.9, [['1 fillet (150g)', 150], ['6 oz (170g)', 170]], { sodium: 78, potassium: 244, magnesium: 42, calcium: 14, vitD: 1.2, vitB12: 1.0, satFat: 0.2 }),
  mk('core-ribeye-steak', 'Ribeye Steak, Grilled', 'Protein', 291, 24.0, 0, 21.2, [['6 oz (170g)', 170], ['8 oz (227g)', 227]], { sodium: 58, potassium: 305, iron: 2.3, zinc: 6.2, vitB12: 2.6, satFat: 8.8 }),

  // Additional Dairy, Cheeses & Milks
  mk('core-milk-whole', 'Whole Milk (3.25% Fat)', 'Dairy', 61, 3.2, 4.8, 3.3, [['1 cup (244g)', 244], ['1/2 cup (122g)', 122]], { sugar: 5.1, sodium: 43, potassium: 132, calcium: 113, vitD: 1.3, vitB12: 0.45, satFat: 1.9 }),
  mk('core-milk-2pct', '2% Reduced Fat Milk', 'Dairy', 50, 3.3, 4.8, 2.0, [['1 cup (244g)', 244], ['1/2 cup (122g)', 122]], { sugar: 5.1, sodium: 47, potassium: 140, calcium: 120, vitD: 1.2, vitB12: 0.5, satFat: 1.3 }),
  mk('core-milk-skim', 'Nonfat / Skim Milk', 'Dairy', 34, 3.4, 5.0, 0.1, [['1 cup (245g)', 245]], { sugar: 5.1, sodium: 42, potassium: 156, calcium: 122, vitD: 1.2, vitB12: 0.5 }),
  mk('core-almond-milk-unsweet', 'Unsweetened Almond Milk', 'Dairy', 13, 0.4, 0.6, 1.1, [['1 cup (240g)', 240]], { fiber: 0.4, sodium: 63, calcium: 188, potassium: 70, vitD: 1.0 }),
  mk('core-parmesan', 'Parmesan Cheese, Grated / Shredded', 'Dairy', 431, 38.5, 4.1, 28.6, [['1 tbsp (5g)', 5], ['1 oz (28g)', 28]], { sodium: 1529, calcium: 1184, potassium: 125, zinc: 4.2, vitB12: 1.4, satFat: 17.3 }),
  mk('core-feta', 'Crumbled Feta Cheese', 'Dairy', 264, 14.2, 4.1, 21.3, [['1 oz (28g)', 28], ['1/4 cup (38g)', 38]], { sugar: 4.1, sodium: 1116, calcium: 493, zinc: 2.9, vitB12: 1.7, satFat: 14.9 }),
  mk('core-mexican-cheese', 'Shredded Mexican 4-Cheese Blend', 'Dairy', 375, 23.2, 3.6, 30.4, [['1/4 cup (28g)', 28], ['1/2 cup (56g)', 56]], { sodium: 640, calcium: 680, satFat: 18.0 }),
  mk('core-cream-cheese', 'Cream Cheese, Regular', 'Dairy', 342, 5.9, 4.1, 34.2, [['1 tbsp (14.5g)', 14.5], ['2 tbsp / 1 oz (28g)', 28]], { sugar: 3.2, sodium: 321, calcium: 98, satFat: 19.3 }),
  mk('core-sour-cream', 'Sour Cream, Regular', 'Dairy', 198, 2.4, 4.6, 19.4, [['2 tbsp (30g)', 30]], { sugar: 3.4, sodium: 31, calcium: 101, satFat: 11.5 }),
  mk('core-light-sour-cream', 'Light Sour Cream', 'Dairy', 136, 3.5, 7.1, 10.6, [['2 tbsp (30g)', 30]], { sugar: 4.5, sodium: 70, calcium: 125, satFat: 6.6 }),
  mk('core-heavy-cream', 'Heavy Whipping Cream', 'Dairy', 340, 2.8, 2.7, 36.1, [['1 tbsp (15g)', 15], ['1/4 cup (60g)', 60]], { sugar: 2.7, sodium: 27, calcium: 66, vitD: 0.7, satFat: 23.0 }),

  // Dry Grains, Baking, Tortillas & Breads
  mk('core-rice-white-dry', 'White / Jasmine Rice, Dry (Uncooked)', 'Grains', 365, 7.1, 80.0, 0.7, [['1/4 cup dry (45g)', 45], ['1 cup dry (185g)', 185]], { fiber: 1.3, potassium: 115, magnesium: 25, iron: 4.3 }),
  mk('core-pasta-dry', 'Pasta / Penne / Spaghetti, Dry (Uncooked)', 'Grains', 371, 13.0, 74.7, 1.5, [['2 oz dry serving (56g)', 56], ['8 oz half box (227g)', 227], ['16 oz box (454g)', 454]], { fiber: 3.2, sugar: 2.7, sodium: 6, potassium: 223, iron: 3.3, magnesium: 53 }),
  mk('core-flour-all-purpose', 'All-Purpose Wheat Flour', 'Grains', 364, 10.3, 76.3, 1.0, [['1 tbsp (8g)', 8], ['1/4 cup (30g)', 30], ['1 cup (120g)', 120]], { fiber: 2.7, potassium: 107, iron: 4.6, magnesium: 22 }),
  mk('core-corn-tortilla', 'Corn Tortilla (Street / Taco Size)', 'Grains', 218, 5.7, 44.6, 2.9, [['1 tortilla (26g)', 26], ['2 tortillas (52g)', 52], ['3 tortillas (78g)', 78]], { fiber: 6.3, sodium: 45, calcium: 81, magnesium: 72, potassium: 186 }),
  mk('core-burrito-tortilla', 'Large Flour Burrito Tortilla', 'Grains', 304, 8.2, 50.8, 7.6, [['1 large tortilla (70g)', 70]], { fiber: 2.9, sugar: 2.5, sodium: 610, calcium: 130, iron: 3.4 }),
  mk('core-bagel-plain', 'Plain Bagel', 'Grains', 275, 10.6, 53.4, 1.6, [['1 bagel (95g)', 95]], { fiber: 2.3, sugar: 6.0, sodium: 443, iron: 3.6, potassium: 101 }),
  mk('core-english-muffin', 'Whole Wheat English Muffin', 'Grains', 203, 8.8, 40.5, 1.8, [['1 muffin (66g)', 66]], { fiber: 4.5, sugar: 4.2, sodium: 360, iron: 2.2, magnesium: 52 }),
  mk('core-breadcrumbs-panko', 'Panko Breadcrumbs', 'Grains', 380, 12.0, 74.0, 2.5, [['1/4 cup (28g)', 28], ['1/2 cup (56g)', 56]], { fiber: 3.5, sodium: 320, iron: 3.2 }),

  // Cooking Vegetables, Aromatics & Canned Tomatoes
  mk('core-onion-yellow', 'Yellow / White Onion, Raw or Diced', 'Vegetables', 40, 1.1, 9.3, 0.1, [['1/2 cup diced (80g)', 80], ['1 medium onion (150g)', 150]], { fiber: 1.7, sugar: 4.2, potassium: 146, vitC: 7.4, magnesium: 10 }),
  mk('core-red-onion', 'Red Onion, Raw or Sliced', 'Vegetables', 40, 1.1, 9.3, 0.1, [['1/2 cup (80g)', 80], ['1 medium (150g)', 150]], { fiber: 1.7, sugar: 4.2, potassium: 146, vitC: 7.4 }),
  mk('core-garlic', 'Garlic Cloves, Minced / Raw', 'Vegetables', 149, 6.4, 33.1, 0.5, [['1 clove (3g)', 3], ['3 cloves / 1 tbsp (9g)', 9]], { fiber: 2.1, potassium: 401, calcium: 181, vitC: 31.2, magnesium: 25 }),
  mk('core-mushrooms', 'Cremini / White Mushrooms, Sliced', 'Vegetables', 22, 3.1, 3.3, 0.3, [['1 cup sliced (70g)', 70], ['8 oz pack (227g)', 227]], { fiber: 1.0, sugar: 2.0, potassium: 318, iron: 0.5, magnesium: 9, zinc: 0.5, vitD: 0.2 }),
  mk('core-zucchini', 'Zucchini, Sliced / Roasted', 'Vegetables', 17, 1.2, 3.1, 0.3, [['1 medium (196g)', 196], ['1 cup chopped (124g)', 124]], { fiber: 1.0, sugar: 2.5, potassium: 261, vitC: 17.9, magnesium: 18 }),
  mk('core-carrots', 'Carrots, Raw or Chopped', 'Vegetables', 41, 0.9, 9.6, 0.2, [['1 medium carrot (61g)', 61], ['1 cup chopped (128g)', 128]], { fiber: 2.8, sugar: 4.7, sodium: 69, potassium: 320, calcium: 33, vitC: 5.9 }),
  mk('core-celery', 'Celery Stalks, Chopped', 'Vegetables', 14, 0.7, 3.0, 0.2, [['2 stalks (80g)', 80], ['1 cup chopped (101g)', 101]], { fiber: 1.6, sugar: 1.3, sodium: 80, potassium: 260, calcium: 40 }),
  mk('core-tomato-raw', 'Roma / Vine Tomato, Raw', 'Vegetables', 18, 0.9, 3.9, 0.2, [['1 medium tomato (123g)', 123], ['1 cup cherry tomatoes (149g)', 149]], { fiber: 1.2, sugar: 2.6, potassium: 237, vitC: 13.7 }),
  mk('core-cucumber', 'Cucumber, Sliced', 'Vegetables', 15, 0.7, 3.6, 0.1, [['1 cup sliced (104g)', 104], ['1 medium (201g)', 201]], { fiber: 0.5, sugar: 1.7, potassium: 147, magnesium: 13 }),
  mk('core-romaine-lettuce', 'Romaine Lettuce, Shredded', 'Vegetables', 17, 1.2, 3.3, 0.3, [['2 cups shredded (94g)', 94]], { fiber: 2.1, sugar: 1.2, potassium: 247, calcium: 33, iron: 1.0, vitC: 4.0 }),
  mk('core-cauliflower', 'Cauliflower Florets / Cauliflower Rice', 'Vegetables', 25, 1.9, 5.0, 0.3, [['1 cup (107g)', 107], ['1 bag riced (340g)', 340]], { fiber: 2.0, sugar: 1.9, sodium: 30, potassium: 299, vitC: 48.2, magnesium: 15 }),
  mk('core-green-beans', 'Green Beans, Steamed / Roasted', 'Vegetables', 31, 1.8, 7.0, 0.2, [['1 cup (125g)', 125]], { fiber: 2.7, sugar: 3.3, potassium: 211, calcium: 37, iron: 1.0, vitC: 12.2 }),
  mk('core-sweet-corn', 'Sweet Yellow Corn, Cooked / Canned', 'Vegetables', 96, 3.4, 21.0, 1.5, [['1/2 cup (82g)', 82], ['1 ear (102g)', 102]], { fiber: 2.4, sugar: 4.5, potassium: 218, magnesium: 26, vitC: 5.5 }),
  mk('core-green-peas', 'Green Peas, Frozen / Cooked', 'Vegetables', 84, 5.4, 15.6, 0.2, [['1/2 cup (80g)', 80], ['1 cup (160g)', 160]], { fiber: 5.5, sugar: 5.9, potassium: 271, iron: 1.5, vitC: 14.2 }),
  mk('core-canned-diced-tomatoes', 'Canned Diced / Crushed Tomatoes', 'Vegetables', 32, 1.6, 7.3, 0.3, [['1/2 cup (121g)', 121], ['14.5 oz can (411g)', 411], ['28 oz can (794g)', 794]], { fiber: 1.9, sugar: 4.4, sodium: 130, potassium: 290, iron: 1.0, vitC: 9.0 }),
  mk('core-tomato-paste', 'Tomato Paste', 'Vegetables', 82, 4.3, 18.9, 0.5, [['1 tbsp (16g)', 16], ['2 tbsp (32g)', 32], ['6 oz can (170g)', 170]], { fiber: 4.1, sugar: 12.2, sodium: 59, potassium: 1014, iron: 3.0, magnesium: 42, vitC: 21.9 }),
  mk('core-chickpeas', 'Chickpeas / Garbanzo Beans (Drained)', 'Legumes', 164, 8.9, 27.4, 2.6, [['1/2 cup (82g)', 82], ['1 can drained (240g)', 240]], { fiber: 7.6, sugar: 4.8, sodium: 170, potassium: 291, iron: 2.9, magnesium: 48, zinc: 1.5 }),
  mk('core-kidney-beans', 'Red Kidney Beans, Cooked / Canned', 'Legumes', 127, 8.7, 22.8, 0.5, [['1/2 cup (88g)', 88], ['1 can drained (250g)', 250]], { fiber: 6.4, sodium: 190, potassium: 403, iron: 2.2, magnesium: 45 }),
  mk('core-edamame', 'Shelled Edamame, Steamed', 'Legumes', 121, 11.9, 8.9, 5.2, [['1/2 cup (78g)', 78], ['1 cup (155g)', 155]], { fiber: 5.2, sugar: 2.2, potassium: 436, calcium: 63, iron: 2.3, magnesium: 64, zinc: 1.4 }),

  // Additional Fruits
  mk('core-raspberries', 'Raspberries, Raw or Frozen', 'Fruits', 52, 1.2, 11.9, 0.7, [['1/2 cup (62g)', 62], ['1 cup (123g)', 123]], { fiber: 6.5, sugar: 4.4, potassium: 151, vitC: 26.2, magnesium: 22 }),
  mk('core-mango', 'Mango Chunks, Raw or Frozen', 'Fruits', 60, 0.8, 15.0, 0.4, [['1 cup (165g)', 165]], { fiber: 1.6, sugar: 13.7, potassium: 168, vitC: 36.4 }),
  mk('core-pineapple', 'Pineapple Chunks, Fresh', 'Fruits', 50, 0.5, 13.1, 0.1, [['1 cup (165g)', 165]], { fiber: 1.4, sugar: 9.9, potassium: 109, vitC: 47.8 }),
  mk('core-grapes', 'Seedless Grapes', 'Fruits', 69, 0.7, 18.1, 0.2, [['1 cup (151g)', 151]], { fiber: 0.9, sugar: 15.5, potassium: 191, vitC: 3.2 }),

  // Cooking Oils, Sauces, Condiments & Broths
  mk('core-avocado-oil', 'Avocado Oil', 'Fats & Oils', 884, 0, 0, 100.0, [['1 tsp (4.5g)', 4.5], ['1 tbsp (14g)', 14]], { satFat: 11.6 }),
  mk('core-coconut-oil', 'Virgin Coconut Oil', 'Fats & Oils', 892, 0, 0, 99.1, [['1 tsp (4.5g)', 4.5], ['1 tbsp (14g)', 14]], { satFat: 82.5 }),
  mk('core-sesame-oil', 'Toasted Sesame Oil', 'Fats & Oils', 884, 0, 0, 100.0, [['1 tsp (4.5g)', 4.5], ['1 tbsp (14g)', 14]], { satFat: 14.2 }),
  mk('core-marinara-sauce', 'Marinara / Tomato Basil Pasta Sauce', 'Condiments', 72, 1.6, 7.2, 4.0, [['1/2 cup (125g)', 125], ['1 cup (250g)', 250], ['24 oz jar (680g)', 680]], { fiber: 1.6, sugar: 4.8, sodium: 336, potassium: 280, iron: 0.8, satFat: 0.6 }, { brand: "Rao's Homemade", barcode: '0747479000017' }),
  mk('core-pesto-basil', 'Basil Pesto Sauce', 'Condiments', 467, 6.7, 6.7, 45.0, [['1 tbsp (15g)', 15], ['1/4 cup (60g)', 60]], { fiber: 1.7, sodium: 780, calcium: 180, satFat: 7.5 }),
  mk('core-mayonnaise', 'Mayonnaise, Real', 'Condiments', 680, 1.0, 0.6, 74.9, [['1 tbsp (14g)', 14]], { sodium: 635, satFat: 11.7 }),
  mk('core-light-mayo', 'Light Mayonnaise', 'Condiments', 233, 0.7, 6.7, 23.3, [['1 tbsp (15g)', 15]], { sugar: 3.3, sodium: 520, satFat: 3.3 }),
  mk('core-ketchup', 'Tomato Ketchup', 'Condiments', 101, 1.0, 27.4, 0.1, [['1 tbsp (17g)', 17]], { sugar: 21.3, sodium: 907, potassium: 281 }),
  mk('core-bbq-sauce', 'BBQ Sauce', 'Condiments', 172, 0.8, 40.8, 0.6, [['2 tbsp (34g)', 34]], { sugar: 33.0, sodium: 1027, potassium: 210 }),
  mk('core-ranch-dressing', 'Ranch Salad Dressing', 'Condiments', 430, 1.3, 5.9, 44.5, [['2 tbsp (30g)', 30]], { sugar: 3.3, sodium: 901, satFat: 7.0 }),
  mk('core-maple-syrup', 'Pure Maple Syrup', 'Condiments', 260, 0, 67.0, 0.1, [['1 tbsp (20g)', 20], ['2 tbsp (40g)', 40]], { sugar: 60.5, potassium: 212, calcium: 102, magnesium: 21 }),
  mk('core-pb2-powder', 'Powdered Peanut Butter (PB2)', 'Nuts & Seeds', 462, 46.2, 38.5, 11.5, [['2 tbsp (13g)', 13]], { fiber: 15.4, sugar: 15.4, sodium: 577, potassium: 1030, iron: 3.1 }),
  mk('core-chicken-broth', 'Chicken Bone Broth / Low-Sodium Stock', 'Condiments', 19, 3.8, 0.4, 0.2, [['1 cup (240g)', 240], ['32 oz carton (946g)', 946]], { sodium: 230, potassium: 110 }),
  mk('core-coconut-milk-canned', 'Canned Coconut Milk (Full Fat, Cooking)', 'Condiments', 197, 2.0, 2.8, 21.3, [['1/3 cup (80g)', 80], ['13.5 oz can (400g)', 400]], { sodium: 13, potassium: 220, iron: 3.3, magnesium: 46, satFat: 18.9 }),
];
