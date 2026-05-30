import express from "express";
import { upcomingController } from "../controllers/upcoming.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { validate } from "../validators/validate.js";
import {
  createUpcomingSchema,
  updateUpcomingSchema,
  listUpcomingSchema,
} from "../validators/upcoming.validators.js";

const router = express.Router();

router.use(authenticate);

router.get("/",    validate(listUpcomingSchema, "query"), upcomingController.list);
router.post("/",   validate(createUpcomingSchema),        upcomingController.create);
router.get("/:id",                                        upcomingController.getOne);
router.put("/:id", validate(updateUpcomingSchema),        upcomingController.update);
router.delete("/:id",                                     upcomingController.delete);

router.post("/:id/approve", upcomingController.approve);
router.post("/:id/decline", upcomingController.decline);

export default router;
