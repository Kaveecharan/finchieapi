import { upcomingService } from "../services/upcoming.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const upcomingController = {
  list: asyncHandler(async (req, res) => {
    const result = await upcomingService.list(req.user.userId, req.query);
    res.json({ success: true, ...result });
  }),

  getOne: asyncHandler(async (req, res) => {
    const item = await upcomingService.getOne(req.params.id, req.user.userId);
    res.json({ success: true, data: item });
  }),

  create: asyncHandler(async (req, res) => {
    const item = await upcomingService.create(req.user.userId, req.body);
    res.status(201).json({ success: true, data: item });
  }),

  update: asyncHandler(async (req, res) => {
    const item = await upcomingService.update(req.params.id, req.user.userId, req.body);
    res.json({ success: true, data: item });
  }),

  delete: asyncHandler(async (req, res) => {
    await upcomingService.delete(req.params.id, req.user.userId);
    res.json({ success: true, message: "Upcoming transaction deleted" });
  }),

  approve: asyncHandler(async (req, res) => {
    const result = await upcomingService.approve(req.params.id, req.user.userId);
    res.json({ success: true, ...result });
  }),

  decline: asyncHandler(async (req, res) => {
    const item = await upcomingService.decline(req.params.id, req.user.userId);
    res.json({ success: true, data: item });
  }),
};
