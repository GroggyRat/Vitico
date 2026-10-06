/** Fake but realistic Pacific grocery-wholesale catalogue. Brands are invented. */
import type { VatCategory } from "../src/index";

export const seedCategories = [
  { slug: "rice-flour-grains", name: "Rice, Flour & Grains" },
  { slug: "canned-foods", name: "Canned Foods" },
  { slug: "canned-fish", name: "Canned Fish", parent: "canned-foods" },
  { slug: "canned-meat", name: "Canned Meat", parent: "canned-foods" },
  { slug: "noodles-pasta", name: "Noodles & Pasta" },
  { slug: "cooking-oils", name: "Cooking Oils & Ghee" },
  { slug: "sugar-spreads", name: "Sugar, Spreads & Baking" },
  { slug: "dairy", name: "Milk & Dairy" },
  { slug: "beverages", name: "Beverages" },
  { slug: "snacks-biscuits", name: "Snacks & Biscuits" },
  { slug: "household", name: "Household & Cleaning" },
  { slug: "personal-care", name: "Personal Care" },
];

type P = {
  sku: string;
  name: string;
  brand: string;
  category: string;
  sellUnit: string;
  units: number;
  cbm: number;
  kg: number;
  price: number;
  cost: number;
  stock: number;
  moq?: number;
  multiple?: number;
  vat?: VatCategory;
  tags?: string[];
};

export const seedProducts: P[] = [
  { sku: "RIC-JAS-25", name: "Jasmine Rice 25kg", brand: "Golden Paddy", category: "rice-flour-grains", sellUnit: "Bag 25kg", units: 1, cbm: 0.035, kg: 25.2, price: 52.5, cost: 44.1, stock: 820, tags: ["staple"] },
  { sku: "RIC-LG-10X2", name: "Long Grain Rice 10 × 2kg", brand: "Pacific Choice", category: "rice-flour-grains", sellUnit: "Bale 10 × 2kg", units: 10, cbm: 0.03, kg: 20.4, price: 44.9, cost: 37.2, stock: 610, tags: ["staple"] },
  { sku: "FLR-PLN-25", name: "Plain Flour 25kg", brand: "Island Mills", category: "rice-flour-grains", sellUnit: "Bag 25kg", units: 1, cbm: 0.036, kg: 25.1, price: 38.75, cost: 32.5, stock: 540, vat: "ZERO_RATED", tags: ["staple", "baking"] },
  { sku: "FLR-SR-10X1", name: "Self-Raising Flour 10 × 1kg", brand: "Island Mills", category: "rice-flour-grains", sellUnit: "Bale 10 × 1kg", units: 10, cbm: 0.016, kg: 10.3, price: 21.4, cost: 17.9, stock: 260, tags: ["baking"] },
  { sku: "OAT-RLD-12", name: "Rolled Oats 12 × 750g", brand: "Morning Harvest", category: "rice-flour-grains", sellUnit: "Carton 12 × 750g", units: 12, cbm: 0.028, kg: 9.4, price: 46.8, cost: 38.1, stock: 95 },
  { sku: "TUN-OIL-48", name: "Tuna Chunks in Oil 48 × 185g", brand: "Reef Catch", category: "canned-fish", sellUnit: "Carton 48 × 185g", units: 48, cbm: 0.012, kg: 10.1, price: 98.4, cost: 81.0, stock: 430, tags: ["protein"] },
  { sku: "MCK-TOM-48", name: "Mackerel in Tomato Sauce 48 × 425g", brand: "Reef Catch", category: "canned-fish", sellUnit: "Carton 48 × 425g", units: 48, cbm: 0.024, kg: 21.6, price: 142.0, cost: 118.5, stock: 380, tags: ["protein"] },
  { sku: "SRD-CHL-100", name: "Sardines in Chilli 100 × 155g", brand: "Ocean Pride", category: "canned-fish", sellUnit: "Carton 100 × 155g", units: 100, cbm: 0.02, kg: 17.4, price: 118.0, cost: 97.0, stock: 6, tags: ["protein"] },
  { sku: "CBF-340-24", name: "Corned Beef 24 × 340g", brand: "Kakana", category: "canned-meat", sellUnit: "Carton 24 × 340g", units: 24, cbm: 0.013, kg: 8.9, price: 112.8, cost: 94.2, stock: 520, tags: ["protein", "halal"] },
  { sku: "CBF-2.7-6", name: "Corned Beef Catering 6 × 2.7kg", brand: "Kakana", category: "canned-meat", sellUnit: "Carton 6 × 2.7kg", units: 6, cbm: 0.03, kg: 17.6, price: 204.0, cost: 171.0, stock: 140, tags: ["catering", "halal"] },
  { sku: "LNC-MT-24", name: "Luncheon Meat 24 × 340g", brand: "Kakana", category: "canned-meat", sellUnit: "Carton 24 × 340g", units: 24, cbm: 0.013, kg: 8.8, price: 79.2, cost: 64.0, stock: 0 },
  { sku: "NDL-CHK-40", name: "Instant Noodles Chicken 40 × 74g", brand: "Bula Bowl", category: "noodles-pasta", sellUnit: "Carton 40 × 74g", units: 40, cbm: 0.03, kg: 3.2, price: 21.6, cost: 16.8, stock: 1400, moq: 5, multiple: 5 },
  { sku: "NDL-CUR-40", name: "Instant Noodles Curry 40 × 74g", brand: "Bula Bowl", category: "noodles-pasta", sellUnit: "Carton 40 × 74g", units: 40, cbm: 0.03, kg: 3.2, price: 21.6, cost: 16.8, stock: 1150, moq: 5, multiple: 5 },
  { sku: "SPG-500-20", name: "Spaghetti 20 × 500g", brand: "Pacific Choice", category: "noodles-pasta", sellUnit: "Carton 20 × 500g", units: 20, cbm: 0.022, kg: 10.4, price: 36.0, cost: 29.5, stock: 210 },
  { sku: "OIL-VEG-4X5", name: "Vegetable Oil 4 × 5L", brand: "Sun Coast", category: "cooking-oils", sellUnit: "Carton 4 × 5L", units: 4, cbm: 0.03, kg: 19.2, price: 82.5, cost: 70.4, stock: 360 },
  { sku: "OIL-VEG-20", name: "Vegetable Oil 20L Drum", brand: "Sun Coast", category: "cooking-oils", sellUnit: "Drum 20L", units: 1, cbm: 0.028, kg: 19.0, price: 76.9, cost: 65.0, stock: 180, tags: ["catering"] },
  { sku: "OIL-COC-12", name: "Virgin Coconut Oil 12 × 500ml", brand: "Vanua Gold", category: "cooking-oils", sellUnit: "Carton 12 × 500ml", units: 12, cbm: 0.012, kg: 6.8, price: 96.0, cost: 72.0, stock: 75, tags: ["local"] },
  { sku: "GHE-PUR-12", name: "Pure Ghee 12 × 800g", brand: "Royal Dairy", category: "cooking-oils", sellUnit: "Carton 12 × 800g", units: 12, cbm: 0.015, kg: 10.8, price: 168.0, cost: 141.0, stock: 64 },
  { sku: "SUG-BRN-25", name: "Brown Sugar 25kg", brand: "Lautoka Sweet", category: "sugar-spreads", sellUnit: "Bag 25kg", units: 1, cbm: 0.03, kg: 25.1, price: 41.0, cost: 35.2, stock: 700, vat: "ZERO_RATED", tags: ["local", "staple"] },
  { sku: "SUG-WHT-10X2", name: "White Sugar 10 × 2kg", brand: "Lautoka Sweet", category: "sugar-spreads", sellUnit: "Bale 10 × 2kg", units: 10, cbm: 0.025, kg: 20.3, price: 39.6, cost: 33.4, stock: 430, tags: ["local"] },
  { sku: "PNB-SMT-12", name: "Peanut Butter Smooth 12 × 375g", brand: "Morning Harvest", category: "sugar-spreads", sellUnit: "Carton 12 × 375g", units: 12, cbm: 0.008, kg: 5.2, price: 54.0, cost: 43.0, stock: 120 },
  { sku: "JAM-PNA-12", name: "Pineapple Jam 12 × 500g", brand: "Vanua Gold", category: "sugar-spreads", sellUnit: "Carton 12 × 500g", units: 12, cbm: 0.009, kg: 7.4, price: 45.6, cost: 35.0, stock: 88, tags: ["local"] },
  { sku: "YST-DRY-50", name: "Dry Yeast 50 × 10g sachets", brand: "Island Mills", category: "sugar-spreads", sellUnit: "Box 50 × 10g", units: 50, cbm: 0.002, kg: 0.6, price: 14.5, cost: 10.2, stock: 300, tags: ["baking"] },
  { sku: "MLK-PWD-12", name: "Full Cream Milk Powder 12 × 1kg", brand: "Royal Dairy", category: "dairy", sellUnit: "Carton 12 × 1kg", units: 12, cbm: 0.03, kg: 12.9, price: 198.0, cost: 168.0, stock: 240 },
  { sku: "MLK-UHT-12", name: "UHT Full Cream Milk 12 × 1L", brand: "Royal Dairy", category: "dairy", sellUnit: "Carton 12 × 1L", units: 12, cbm: 0.014, kg: 12.8, price: 39.0, cost: 32.4, stock: 510 },
  { sku: "MLK-CND-48", name: "Sweetened Condensed Milk 48 × 395g", brand: "Royal Dairy", category: "dairy", sellUnit: "Carton 48 × 395g", units: 48, cbm: 0.022, kg: 20.5, price: 144.0, cost: 120.0, stock: 9 },
  { sku: "BTR-SLT-40", name: "Salted Butter 40 × 250g (chilled)", brand: "Royal Dairy", category: "dairy", sellUnit: "Carton 40 × 250g", units: 40, cbm: 0.014, kg: 10.4, price: 186.0, cost: 158.0, stock: 70, tags: ["chilled"] },
  { sku: "WTR-SPR-24", name: "Spring Water 24 × 600ml", brand: "Nadi Springs", category: "beverages", sellUnit: "Carton 24 × 600ml", units: 24, cbm: 0.018, kg: 15.2, price: 18.0, cost: 13.5, stock: 980, moq: 10, multiple: 10, tags: ["local"] },
  { sku: "SFT-COL-24", name: "Cola 24 × 330ml cans", brand: "Bula Fizz", category: "beverages", sellUnit: "Carton 24 × 330ml", units: 24, cbm: 0.013, kg: 8.6, price: 22.8, cost: 17.6, stock: 640 },
  { sku: "JCE-ORG-12", name: "Orange Juice 12 × 1L", brand: "Sun Coast", category: "beverages", sellUnit: "Carton 12 × 1L", units: 12, cbm: 0.014, kg: 12.9, price: 42.0, cost: 34.2, stock: 150 },
  { sku: "TEA-BAG-12", name: "Black Tea 12 × 100 bags", brand: "Highland Leaf", category: "beverages", sellUnit: "Carton 12 × 100 bags", units: 12, cbm: 0.018, kg: 2.8, price: 57.6, cost: 44.4, stock: 175 },
  { sku: "COF-INS-12", name: "Instant Coffee 12 × 200g", brand: "Highland Leaf", category: "beverages", sellUnit: "Carton 12 × 200g", units: 12, cbm: 0.009, kg: 3.1, price: 129.6, cost: 104.0, stock: 60 },
  { sku: "BIS-CRM-24", name: "Cream Crackers 24 × 250g", brand: "Tropic Bake", category: "snacks-biscuits", sellUnit: "Carton 24 × 250g", units: 24, cbm: 0.04, kg: 6.6, price: 50.4, cost: 40.0, stock: 330, tags: ["local"] },
  { sku: "BIS-SWT-24", name: "Coconut Biscuits 24 × 200g", brand: "Tropic Bake", category: "snacks-biscuits", sellUnit: "Carton 24 × 200g", units: 24, cbm: 0.035, kg: 5.4, price: 45.6, cost: 35.8, stock: 280, tags: ["local"] },
  { sku: "CHP-CAS-30", name: "Cassava Chips 30 × 100g", brand: "Vanua Gold", category: "snacks-biscuits", sellUnit: "Carton 30 × 100g", units: 30, cbm: 0.06, kg: 3.6, price: 42.0, cost: 30.0, stock: 120, tags: ["local"] },
  { sku: "DET-PWD-6", name: "Laundry Powder 6 × 3kg", brand: "CleanWave", category: "household", sellUnit: "Carton 6 × 3kg", units: 6, cbm: 0.03, kg: 18.6, price: 87.0, cost: 70.5, stock: 200 },
  { sku: "DSH-LIQ-12", name: "Dishwashing Liquid 12 × 750ml", brand: "CleanWave", category: "household", sellUnit: "Carton 12 × 750ml", units: 12, cbm: 0.013, kg: 9.8, price: 46.8, cost: 36.0, stock: 160 },
  { sku: "TIS-TLT-48", name: "Toilet Tissue 48 rolls", brand: "SoftCloud", category: "household", sellUnit: "Bale 48 rolls", units: 48, cbm: 0.09, kg: 5.4, price: 38.4, cost: 29.0, stock: 210 },
  { sku: "SOP-BAR-72", name: "Bath Soap 72 × 100g", brand: "Frangipani", category: "personal-care", sellUnit: "Carton 72 × 100g", units: 72, cbm: 0.012, kg: 7.6, price: 79.2, cost: 61.0, stock: 140, tags: ["local"] },
  { sku: "TPS-FLU-72", name: "Fluoride Toothpaste 72 × 120g", brand: "BrightSmile", category: "personal-care", sellUnit: "Carton 72 × 120g", units: 72, cbm: 0.02, kg: 10.2, price: 151.2, cost: 122.0, stock: 85 },
];
