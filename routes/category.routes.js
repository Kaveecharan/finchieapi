import express from "express";
import { categoryController } from "../controllers/category.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { validate } from "../validators/validate.js";
import {
  createCategorySchema,
  updateCategorySchema,
  addSubCategorySchema,
  listCategorySchema,
} from "../validators/category.validators.js";

const router = express.Router();

router.use(authenticate);

router.get("/", validate(listCategorySchema, "query"), categoryController.list);
router.post("/", validate(createCategorySchema), categoryController.create);
router.post("/find-or-create", categoryController.findOrCreate);
router.post("/seed-defaults", categoryController.seedDefaults);
router.put("/:id", validate(updateCategorySchema), categoryController.update);
router.delete("/:id", categoryController.delete);

router.post("/:id/subcategories", validate(addSubCategorySchema), categoryController.addSubCategory);
router.post("/:id/subcategories/find-or-create", categoryController.findOrCreateSubCategory);
router.delete("/:id/subcategories/:subId", categoryController.removeSubCategory);

export default router;
