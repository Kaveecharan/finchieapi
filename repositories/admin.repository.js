import User from "../models/User.js";
import Subscription from "../models/Subscription.js";
import ChatUsage from "../models/ChatUsage.js";
import SupportTicket from "../models/SupportTicket.js";

const AI_COST_PER_CALL = 0.01; // $0.01 estimated cost per AI call

const monthKey = (offsetMonths = 0) => {
  const d = new Date();
  d.setMonth(d.getMonth() - offsetMonths);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const adminRepository = {
  // ── Overview ────────────────────────────────────────────────────────────────
  async getOverview() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const currentMonthKey = monthKey();

    const [totalUsers, activeUsers, newToday, newThisMonth, subStats, aiStats, ticketStats] =
      await Promise.all([
        User.countDocuments({ deletedAt: null }),
        User.countDocuments({ status: "active", deletedAt: null }),
        User.countDocuments({ createdAt: { $gte: startOfToday }, deletedAt: null }),
        User.countDocuments({ createdAt: { $gte: startOfMonth }, deletedAt: null }),
        Subscription.aggregate([
          { $group: { _id: "$status", count: { $sum: 1 } } },
        ]),
        ChatUsage.aggregate([
          { $match: { monthKey: currentMonthKey } },
          {
            $group: {
              _id: null,
              totalAiCalls: { $sum: "$aiCallsMonth" },
              totalMsgs: { $sum: "$totalMsgsMonth" },
              activeUsers: { $sum: 1 },
            },
          },
        ]),
        SupportTicket.aggregate([
          { $group: { _id: "$status", count: { $sum: 1 } } },
        ]),
      ]);

    const subMap = Object.fromEntries(subStats.map((s) => [s._id, s.count]));
    const ai = aiStats[0] ?? { totalAiCalls: 0, totalMsgs: 0, activeUsers: 0 };
    const ticketMap = Object.fromEntries(ticketStats.map((t) => [t._id, t.count]));
    const totalTickets = Object.values(ticketMap).reduce((a, b) => a + b, 0);

    return {
      users: {
        total: totalUsers,
        active: activeUsers,
        newToday,
        newThisMonth,
      },
      subscriptions: {
        active: subMap.active ?? 0,
        trialing: subMap.trialing ?? 0,
        pastDue: subMap.past_due ?? 0,
        cancelled: subMap.cancelled ?? 0,
        expired: subMap.expired ?? 0,
        premium: (subMap.active ?? 0) + (subMap.trialing ?? 0),
      },
      ai: {
        totalCallsThisMonth: ai.totalAiCalls,
        totalMsgsThisMonth: ai.totalMsgs,
        activeAiUsers: ai.activeUsers,
        estimatedCostUsd: +(ai.totalAiCalls * AI_COST_PER_CALL).toFixed(2),
      },
      support: {
        open: ticketMap.open ?? 0,
        inProgress: ticketMap.in_progress ?? 0,
        resolved: ticketMap.resolved ?? 0,
        total: totalTickets,
      },
    };
  },

  // ── Chart data ───────────────────────────────────────────────────────────────
  async getUserGrowthData() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    return User.aggregate([
      { $match: { createdAt: { $gte: thirtyDaysAgo }, deletedAt: null } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
      { $project: { _id: 0, date: "$_id", count: 1 } },
    ]);
  },

  async getAiTrend() {
    const months = Array.from({ length: 6 }, (_, i) => monthKey(5 - i));
    const rows = await ChatUsage.aggregate([
      { $match: { monthKey: { $in: months } } },
      {
        $group: {
          _id: "$monthKey",
          totalAiCalls: { $sum: "$aiCallsMonth" },
          uniqueUsers: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
      {
        $project: {
          _id: 0,
          month: "$_id",
          totalAiCalls: 1,
          uniqueUsers: 1,
          estimatedCostUsd: { $round: [{ $multiply: ["$totalAiCalls", AI_COST_PER_CALL] }, 2] },
        },
      },
    ]);
    // Fill in months with no data so the chart is always 6 bars
    return months.map((m) => rows.find((r) => r.month === m) ?? { month: m, totalAiCalls: 0, uniqueUsers: 0, estimatedCostUsd: 0 });
  },

  async getSubscriptionDistribution() {
    return Subscription.aggregate([
      { $group: { _id: "$status", count: { $sum: 1 } } },
      { $project: { _id: 0, status: "$_id", count: 1 } },
    ]);
  },

  // ── Users ────────────────────────────────────────────────────────────────────
  async listUsers({ page, limit, filter, search, role }) {
    const skip = (page - 1) * limit;
    const match = { deletedAt: null };

    if (search) {
      const re = new RegExp(escapeRegex(search), "i");
      match.$or = [{ email: re }, { firstName: re }, { lastName: re }, { username: re }];
    }

    if (role) match.roles = role;

    // Subscription-based filters: resolve to userIds first
    const subFilters = ["premium", "trialing", "past_due", "cancelled", "free"];
    if (subFilters.includes(filter)) {
      let subMatch;
      if (filter === "premium") subMatch = { status: { $in: ["active", "trialing"] } };
      else if (filter === "free") subMatch = { status: { $in: ["expired", "cancelled"] } };
      else subMatch = { status: filter };
      const subs = await Subscription.find(subMatch).select("userId").lean();
      match.userId = { $in: subs.map((s) => s.userId) };
    } else if (filter === "active") {
      match.status = "active";
    } else if (filter === "banned") {
      match.status = "banned";
    } else if (filter === "deactivated") {
      match.status = "deactivated";
    } else if (filter === "admin") {
      match.roles = { $in: ["admin", "superAdmin"] };
    }

    const [total, users] = await Promise.all([
      User.countDocuments(match),
      User.aggregate([
        { $match: match },
        { $sort: { createdAt: -1 } },
        { $skip: skip },
        { $limit: limit },
        {
          $project: {
            userId: 1, firstName: 1, lastName: 1, email: 1, username: 1,
            displayName: 1, roles: 1, status: 1, isEmailVerified: 1,
            lastActiveAt: 1, createdAt: 1, avatarUrl: 1, country: 1,
          },
        },
        {
          $lookup: {
            from: "subscriptions",
            localField: "userId",
            foreignField: "userId",
            as: "subscription",
          },
        },
        { $addFields: { subscription: { $arrayElemAt: ["$subscription", 0] } } },
      ]),
    ]);

    return { users, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  },

  async getUserDetail(userId) {
    const currentMonthKey = monthKey();

    const [user, subscription, aiHistory, tickets] = await Promise.all([
      User.findOne({ userId })
        .select(
          "-passwordHash -passwordHistory -mfaSecret -mfaBackupCodes " +
          "-verificationCodeHash -resetCodeHash -emailChangeCodeHash " +
          "-phoneChangeCodeHash -deactivationCodeHash"
        )
        .lean(),
      Subscription.findOne({ userId }).lean(),
      ChatUsage.find({ userId }).sort({ monthKey: -1 }).limit(6).lean(),
      SupportTicket.find({ userId }).sort({ createdAt: -1 }).limit(10).lean(),
    ]);

    if (!user) return null;

    const currentAi = aiHistory.find((u) => u.monthKey === currentMonthKey);

    return {
      ...user,
      subscription: subscription ?? null,
      ai: {
        current: currentAi ?? { aiCallsMonth: 0, totalMsgsMonth: 0, aiCallsDay: 0 },
        history: aiHistory,
        estimatedCostUsd: +((currentAi?.aiCallsMonth ?? 0) * AI_COST_PER_CALL).toFixed(2),
      },
      tickets,
    };
  },

  async updateUser(userId, { status, roles }) {
    const update = {};
    if (status) {
      update.status = status;
      if (status === "banned") update.bannedAt = new Date();
      if (status === "active") { update.bannedAt = null; update.bannedReason = null; }
    }
    if (roles) update.roles = roles;

    return User.findOneAndUpdate({ userId }, { $set: update }, {
      new: true,
      select: "-passwordHash -passwordHistory -mfaSecret -mfaBackupCodes -verificationCodeHash -resetCodeHash",
    }).lean();
  },

  // ── Subscriptions ────────────────────────────────────────────────────────────
  async listSubscriptions({ page, limit, status }) {
    const skip = (page - 1) * limit;
    const match = status ? { status } : {};

    const [total, subscriptions, statsRows] = await Promise.all([
      Subscription.countDocuments(match),
      Subscription.aggregate([
        { $match: match },
        { $sort: { updatedAt: -1 } },
        { $skip: skip },
        { $limit: limit },
        {
          $lookup: {
            from: "users",
            localField: "userId",
            foreignField: "userId",
            as: "user",
          },
        },
        { $addFields: { user: { $arrayElemAt: ["$user", 0] } } },
        {
          $project: {
            userId: 1, plan: 1, status: 1,
            stripeSubscriptionId: 1,
            trialStart: 1, trialEnd: 1,
            currentPeriodStart: 1, currentPeriodEnd: 1,
            cancelAtPeriodEnd: 1, cancelledAt: 1,
            createdAt: 1, updatedAt: 1,
            "user.firstName": 1, "user.lastName": 1,
            "user.email": 1, "user.avatarUrl": 1,
          },
        },
      ]),
      Subscription.aggregate([
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
    ]);

    const stats = Object.fromEntries(statsRows.map((s) => [s._id, s.count]));
    return { subscriptions, stats, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  },

  // ── AI Usage ─────────────────────────────────────────────────────────────────
  async getAiUsage({ page, limit, month }) {
    const skip = (page - 1) * limit;
    const mk = month || monthKey();

    const [total, summaryRows, usage] = await Promise.all([
      ChatUsage.countDocuments({ monthKey: mk }),
      ChatUsage.aggregate([
        { $match: { monthKey: mk } },
        {
          $group: {
            _id: null,
            totalAiCalls: { $sum: "$aiCallsMonth" },
            totalMsgs:    { $sum: "$totalMsgsMonth" },
            userCount:    { $sum: 1 },
          },
        },
      ]),
      ChatUsage.aggregate([
        { $match: { monthKey: mk } },
        { $sort: { aiCallsMonth: -1 } },
        { $skip: skip },
        { $limit: limit },
        {
          $lookup: {
            from: "users",
            localField: "userId",
            foreignField: "userId",
            as: "user",
          },
        },
        { $addFields: { user: { $arrayElemAt: ["$user", 0] } } },
        {
          $project: {
            userId: 1, monthKey: 1, aiCallsMonth: 1, totalMsgsMonth: 1, aiCallsDay: 1, dayKey: 1,
            estimatedCostUsd: { $round: [{ $multiply: ["$aiCallsMonth", AI_COST_PER_CALL] }, 4] },
            "user.firstName": 1, "user.lastName": 1, "user.email": 1, "user.avatarUrl": 1,
          },
        },
      ]),
    ]);

    const summary = summaryRows[0] ?? { totalAiCalls: 0, totalMsgs: 0, userCount: 0 };
    return {
      usage,
      summary: { ...summary, estimatedTotalCostUsd: +(summary.totalAiCalls * AI_COST_PER_CALL).toFixed(2) },
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  },

  // ── Support Tickets ───────────────────────────────────────────────────────────
  async listTickets({ page, limit, status }) {
    const skip = (page - 1) * limit;
    const match = status ? { status } : {};

    const [tickets, total] = await Promise.all([
      SupportTicket.find(match)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select("-adminNotes")
        .lean(),
      SupportTicket.countDocuments(match),
    ]);

    return { tickets, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  },

  async getTicket(ticketId) {
    return SupportTicket.findOne({ ticketId }).select("+adminNotes").lean();
  },

  async updateTicket(ticketId, { status, priority, adminReply, adminNotes }) {
    const update = {};
    if (status)            update.status = status;
    if (priority)          update.priority = priority;
    if (adminNotes !== undefined) update.adminNotes = adminNotes;
    if (status === "resolved") update.resolvedAt = new Date();

    const ticket = await SupportTicket.findOneAndUpdate(
      { ticketId },
      { $set: update },
      { new: true }
    );
    if (!ticket) return null;

    if (adminReply?.trim()) {
      ticket.messages.push({ from: "admin", content: adminReply.trim() });
      await ticket.save();
    }

    return ticket.toObject();
  },
};
