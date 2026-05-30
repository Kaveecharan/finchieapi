import Category from "../models/Category.js";

export const categoryRepository = {
  findByUserId: (userId, type) => {
    const filter = { userId };
    if (type) filter.type = type;
    return Category.find(filter).sort({ isDefault: -1, name: 1 });
  },

  findById: (id, userId) =>
    Category.findOne({ _id: id, userId }),

  findByName: (userId, name, type) =>
    Category.findOne({
      userId,
      name: { $regex: `^${name.trim()}$`, $options: "i" },
      type,
    }),

  create: (data) => Category.create(data),

  update: (id, userId, data) =>
    Category.findOneAndUpdate({ _id: id, userId }, { $set: data }, { new: true }),

  delete: (id, userId) =>
    Category.findOneAndDelete({ _id: id, userId }),

  addSubCategory: (id, userId, subCat) =>
    Category.findOneAndUpdate(
      { _id: id, userId },
      { $push: { subCategories: subCat } },
      { new: true }
    ),

  removeSubCategory: (id, userId, subId) =>
    Category.findOneAndUpdate(
      { _id: id, userId },
      { $pull: { subCategories: { _id: subId } } },
      { new: true }
    ),

  findSubCategoryByName: (catId, userId, name) =>
    Category.findOne({
      _id: catId,
      userId,
      "subCategories.name": { $regex: `^${name.trim()}$`, $options: "i" },
    }),

  seedDefaults: (userId, defaults) =>
    Category.insertMany(
      defaults.map((d) => ({ ...d, userId, isDefault: true })),
      { ordered: false }
    ).catch(() => {}), // ignore duplicate key errors on re-seed
};
