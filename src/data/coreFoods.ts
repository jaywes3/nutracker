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
];
