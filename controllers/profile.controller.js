import { profileService } from "../services/profile.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const profileController = {
  get: asyncHandler(async (req, res) => {
    const user = await profileService.getProfile(req.user.userId);
    res.json({ success: true, user });
  }),

  update: asyncHandler(async (req, res) => {
    const user = await profileService.updateProfile(req.user.userId, req.body);
    res.json({ success: true, user });
  }),

  updateAvatar: asyncHandler(async (req, res) => {
    const user = await profileService.updateAvatar(req.user.userId, req.body.avatarUrl);
    res.json({ success: true, user });
  }),

  updateEmail: asyncHandler(async (req, res) => {
    const user = await profileService.updateEmail(
      req.user.userId,
      req.body.newEmail,
      req.body.password
    );
    res.json({ success: true, user });
  }),

  updatePhone: asyncHandler(async (req, res) => {
    const user = await profileService.updatePhone(
      req.user.userId,
      req.body.phoneNumber,
      req.body.countryCode
    );
    res.json({ success: true, user });
  }),

  deactivate: asyncHandler(async (req, res) => {
    await profileService.deactivate(req.user.userId, req.body.password);
    res.json({ success: true, message: "Account deactivated. You will be signed out." });
  }),
};
