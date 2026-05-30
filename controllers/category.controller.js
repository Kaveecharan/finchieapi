import { categoryService } from "../services/category.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const categoryController = {
  list: asyncHandler(async (req, res) => {
    const { type, search } = req.query;
    const categories = await categoryService.list(req.user.userId, type, search);
    res.json({ success: true, data: categories });
  }),

  create: asyncHandler(async (req, res) => {
    const category = await categoryService.create(req.user.userId, req.body);
    res.status(201).json({ success: true, data: category });
  }),

  findOrCreate: asyncHandler(async (req, res) => {
    const { name, type, color } = req.body;
    const category = await categoryService.findOrCreate(req.user.userId, name, type, color);
    res.json({ success: true, data: category });
  }),

  update: asyncHandler(async (req, res) => {
    const category = await categoryService.update(req.params.id, req.user.userId, req.body);
    res.json({ success: true, data: category });
  }),

  delete: asyncHandler(async (req, res) => {
    await categoryService.delete(req.params.id, req.user.userId);
    res.json({ success: true, message: "Category deleted" });
  }),

  addSubCategory: asyncHandler(async (req, res) => {
    const { name } = req.body;
    const category = await categoryService.addSubCategory(req.params.id, req.user.userId, name);
    res.status(201).json({ success: true, data: category });
  }),

  findOrCreateSubCategory: asyncHandler(async (req, res) => {
    const { name } = req.body;
    const result = await categoryService.findOrCreateSubCategory(
      req.params.id, req.user.userId, name
    );
    res.json({ success: true, data: result });
  }),

  removeSubCategory: asyncHandler(async (req, res) => {
    const category = await categoryService.removeSubCategory(
      req.params.id, req.user.userId, req.params.subId
    );
    res.json({ success: true, data: category });
  }),

  seedDefaults: asyncHandler(async (req, res) => {
    await categoryService.seedDefaults(req.user.userId);
    res.json({ success: true, message: "Default categories seeded" });
  }),
};
