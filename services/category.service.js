import { categoryRepository } from "../repositories/category.repository.js";
import { AppError } from "../errors/AppError.js";
import { DEFAULT_EXPENSE_CATEGORIES, DEFAULT_INCOME_CATEGORIES } from "../config/defaultCategories.js";

const ICON_KEYWORDS = [
  { kw: ["food", "dining", "restaurant", "eat", "meal", "cafe", "grocery"], icon: "restaurant" },
  { kw: ["transport", "car", "taxi", "bus", "train", "fuel", "gas", "ride", "auto", "motorbike"], icon: "car" },
  { kw: ["shop", "shopping", "clothes", "clothing", "fashion", "apparel"], icon: "bag" },
  { kw: ["entertainment", "movie", "film", "cinema", "game", "sport", "event", "streaming"], icon: "film" },
  { kw: ["health", "medical", "doctor", "hospital", "pharmacy", "gym", "dental", "wellness"], icon: "medkit" },
  { kw: ["bill", "utility", "electric", "water", "internet", "phone", "subscription"], icon: "flash" },
  { kw: ["education", "school", "college", "university", "course", "book", "tuition"], icon: "book" },
  { kw: ["personal", "care", "beauty", "haircut", "salon", "grooming", "barber"], icon: "person" },
  { kw: ["travel", "flight", "hotel", "vacation", "trip", "holiday", "airfare"], icon: "airplane" },
  { kw: ["salary", "employment", "paycheck", "wages", "payroll", "work", "job"], icon: "briefcase" },
  { kw: ["freelance", "contract", "gig", "consulting"], icon: "laptop" },
  { kw: ["business", "venture", "enterprise", "revenue", "sales"], icon: "storefront" },
  { kw: ["invest", "stock", "dividend", "portfolio", "fund", "trading"], icon: "trending-up" },
  { kw: ["gift", "present", "bonus", "reward", "donation"], icon: "gift" },
  { kw: ["rental", "rent", "lease", "property"], icon: "home" },
  { kw: ["government", "pension", "benefit", "allowance", "welfare", "grant"], icon: "shield" },
  { kw: ["insurance", "premium", "policy"], icon: "shield-checkmark" },
  { kw: ["pet", "animal", "vet", "dog", "cat"], icon: "paw" },
  { kw: ["baby", "child", "kid", "toy", "daycare"], icon: "happy" },
  { kw: ["repair", "maintenance", "fix", "plumber", "handyman"], icon: "construct" },
  { kw: ["charity", "donate", "church", "religious", "temple"], icon: "heart" },
  { kw: ["bank", "transfer", "saving", "deposit", "withdraw"], icon: "card" },
  { kw: ["tech", "software", "hardware", "gadget", "device", "computer"], icon: "hardware-chip" },
];

const inferIcon = (name = "") => {
  const lower = name.toLowerCase();
  for (const { kw, icon } of ICON_KEYWORDS) {
    if (kw.some((k) => lower.includes(k))) return icon;
  }
  return "ellipse";
};

export const categoryService = {
  list: async (userId, type, search) => {
    let categories = await categoryRepository.findByUserId(userId, type);
    if (search) {
      const re = new RegExp(search, "i");
      categories = categories.filter((c) => re.test(c.name));
    }
    return categories;
  },

  create: async (userId, data) => {
    const existing = await categoryRepository.findByName(userId, data.name, data.type);
    if (existing) throw new AppError(409, "Category already exists", "CATEGORY_EXISTS");
    return categoryRepository.create({ ...data, userId });
  },

  // Find or create — used by the "type-to-create" flow in the dropdown
  findOrCreate: async (userId, name, type, color) => {
    const existing = await categoryRepository.findByName(userId, name, type);
    if (existing) return existing;
    return categoryRepository.create({
      userId,
      name:  name.trim(),
      type,
      color: color || "#4A8A66",
      icon:  inferIcon(name),
    });
  },

  update: async (id, userId, data) => {
    const updated = await categoryRepository.update(id, userId, data);
    if (!updated) throw new AppError(404, "Category not found", "NOT_FOUND");
    return updated;
  },

  delete: async (id, userId) => {
    const deleted = await categoryRepository.delete(id, userId);
    if (!deleted) throw new AppError(404, "Category not found", "NOT_FOUND");
  },

  addSubCategory: async (catId, userId, name) => {
    const category = await categoryRepository.findById(catId, userId);
    if (!category) throw new AppError(404, "Category not found", "NOT_FOUND");

    const exists = category.subCategories.some(
      (s) => s.name.toLowerCase() === name.toLowerCase().trim()
    );
    if (exists) throw new AppError(409, "Sub-category already exists", "SUBCATEGORY_EXISTS");

    return categoryRepository.addSubCategory(catId, userId, { name: name.trim() });
  },

  // Find or create subcategory within a parent category
  findOrCreateSubCategory: async (catId, userId, name) => {
    const category = await categoryRepository.findById(catId, userId);
    if (!category) throw new AppError(404, "Category not found", "NOT_FOUND");

    const existing = category.subCategories.find(
      (s) => s.name.toLowerCase() === name.toLowerCase().trim()
    );
    if (existing) return { category, subCategory: existing };

    const updated = await categoryRepository.addSubCategory(catId, userId, { name: name.trim() });
    const newSub = updated.subCategories[updated.subCategories.length - 1];
    return { category: updated, subCategory: newSub };
  },

  removeSubCategory: async (catId, userId, subId) => {
    const updated = await categoryRepository.removeSubCategory(catId, userId, subId);
    if (!updated) throw new AppError(404, "Category not found", "NOT_FOUND");
    return updated;
  },

  seedDefaults: async (userId) => {
    await Promise.all([
      categoryRepository.seedDefaults(userId, DEFAULT_EXPENSE_CATEGORIES),
      categoryRepository.seedDefaults(userId, DEFAULT_INCOME_CATEGORIES),
    ]);
  },
};
