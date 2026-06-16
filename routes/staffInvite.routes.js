import { Router } from "express";
import { authenticate, authorize } from "../middleware/authenticate.js";
import {
  createInvite,
  listInvites,
  revokeInvite,
  validateToken,
  acceptInvite,
} from "../controllers/staffInvite.controller.js";

const router = Router();

// ── Public — no authentication required ──────────────────────────────────────
router.get("/validate/:token",  validateToken);
router.post("/accept",          acceptInvite);

// ── Protected — superAdmin only ───────────────────────────────────────────────
router.get(   "/",              authenticate, authorize("superAdmin"), listInvites);
router.post(  "/",              authenticate, authorize("superAdmin"), createInvite);
router.delete("/:inviteId",     authenticate, authorize("superAdmin"), revokeInvite);

export default router;
