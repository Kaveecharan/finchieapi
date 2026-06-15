import { Router } from "express";
import { authenticate, authorize } from "../middleware/authenticate.js";
import { adminController } from "../controllers/admin.controller.js";

const router = Router();

// Every admin route requires a valid JWT + admin or superAdmin role
router.use(authenticate, authorize("admin", "superAdmin"));

router.get("/overview",                       adminController.getOverview);
router.get("/users",                          adminController.listUsers);
router.get("/users/:userId",                  adminController.getUser);
router.patch("/users/:userId",                adminController.updateUser);
router.get("/subscriptions",                  adminController.listSubscriptions);
router.get("/ai-usage",                       adminController.getAiUsage);
router.get("/support/tickets",                adminController.listTickets);
router.get("/support/tickets/:ticketId",      adminController.getTicket);
router.patch("/support/tickets/:ticketId",    adminController.updateTicket);

export default router;
