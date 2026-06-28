import { adminRepository } from "../repositories/admin.repository.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError, NotFoundError } from "../errors/AppError.js";
import { financeScoreService } from "../services/financeScore.service.js";

export const adminController = {
  // GET /admin/overview
  getOverview: asyncHandler(async (req, res) => {
    const [overview, growthData, aiTrend, subDist] = await Promise.all([
      adminRepository.getOverview(),
      adminRepository.getUserGrowthData(),
      adminRepository.getAiTrend(),
      adminRepository.getSubscriptionDistribution(),
    ]);
    res.json({ success: true, data: { ...overview, charts: { growthData, aiTrend, subDist } } });
  }),

  // GET /admin/users
  listUsers: asyncHandler(async (req, res) => {
    const { page = "1", limit = "20", filter = "all", search = "", role = "" } = req.query;
    const data = await adminRepository.listUsers({
      page: Math.max(1, parseInt(page, 10)),
      limit: Math.min(100, Math.max(1, parseInt(limit, 10))),
      filter,
      search: search.trim(),
      role,
    });
    res.json({ success: true, ...data });
  }),

  // GET /admin/users/:userId
  getUser: asyncHandler(async (req, res) => {
    const user = await adminRepository.getUserDetail(req.params.userId);
    if (!user) throw new NotFoundError("User not found");
    res.json({ success: true, data: user });
  }),

  // PATCH /admin/users/:userId
  updateUser: asyncHandler(async (req, res) => {
    const { userId } = req.params;
    if (req.user.userId === userId) {
      throw new AppError("Cannot modify your own account via admin panel", 400, "SELF_MODIFY");
    }

    const { status, roles } = req.body;
    const validStatuses = ["active", "deactivated", "banned", "suspended"];
    const validRoles    = ["user", "admin", "superAdmin", "affiliate"];

    if (status && !validStatuses.includes(status)) {
      throw new AppError(`Invalid status. Must be one of: ${validStatuses.join(", ")}`, 400, "INVALID_STATUS");
    }
    if (roles) {
      if (!Array.isArray(roles) || roles.some((r) => !validRoles.includes(r))) {
        throw new AppError(`Invalid roles. Must be subset of: ${validRoles.join(", ")}`, 400, "INVALID_ROLES");
      }
      if (roles.includes("superAdmin") && !req.user.roles?.includes("superAdmin")) {
        throw new AppError("Only superAdmins can assign the superAdmin role", 403, "FORBIDDEN");
      }
    }

    const user = await adminRepository.updateUser(userId, { status, roles });
    if (!user) throw new NotFoundError("User not found");
    res.json({ success: true, data: user });
  }),

  // GET /admin/subscriptions
  listSubscriptions: asyncHandler(async (req, res) => {
    const { page = "1", limit = "20", status = "" } = req.query;
    const data = await adminRepository.listSubscriptions({
      page: Math.max(1, parseInt(page, 10)),
      limit: Math.min(100, Math.max(1, parseInt(limit, 10))),
      status,
    });
    res.json({ success: true, ...data });
  }),

  // GET /admin/ai-usage
  getAiUsage: asyncHandler(async (req, res) => {
    const { page = "1", limit = "20", month = "" } = req.query;
    // Basic month format validation
    if (month && !/^\d{4}-\d{2}$/.test(month)) {
      throw new AppError("month must be in YYYY-MM format", 400, "INVALID_MONTH");
    }
    const data = await adminRepository.getAiUsage({
      page: Math.max(1, parseInt(page, 10)),
      limit: Math.min(100, Math.max(1, parseInt(limit, 10))),
      month,
    });
    res.json({ success: true, ...data });
  }),

  // GET /admin/support/tickets
  listTickets: asyncHandler(async (req, res) => {
    const { page = "1", limit = "20", status = "" } = req.query;
    const data = await adminRepository.listTickets({
      page: Math.max(1, parseInt(page, 10)),
      limit: Math.min(100, Math.max(1, parseInt(limit, 10))),
      status,
    });
    res.json({ success: true, ...data });
  }),

  // GET /admin/support/tickets/:ticketId
  getTicket: asyncHandler(async (req, res) => {
    const ticket = await adminRepository.getTicket(req.params.ticketId);
    if (!ticket) throw new NotFoundError("Ticket not found");
    res.json({ success: true, data: ticket });
  }),

  // PATCH /admin/support/tickets/:ticketId
  updateTicket: asyncHandler(async (req, res) => {
    const { status, priority, adminReply, adminNotes } = req.body;
    const ticket = await adminRepository.updateTicket(req.params.ticketId, {
      status, priority, adminReply, adminNotes,
    });
    if (!ticket) throw new NotFoundError("Ticket not found");
    res.json({ success: true, data: ticket });
  }),

  // POST /admin/finance-score/calculate/:userId
  calculateScore: asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const result = await financeScoreService.calculateForUser(userId, { force: true });
    res.json({ success: true, data: result });
  }),
};
