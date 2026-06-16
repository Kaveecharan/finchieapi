import { randomBytes, createHash } from "node:crypto";
import { v4 as uuidv4 } from "uuid";
import StaffInvite from "../models/StaffInvite.js";
import User from "../models/User.js";
import { hashPassword, validatePasswordPolicy } from "../security/password.js";
import { sendEmail } from "../services/email.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError, NotFoundError, ForbiddenError, ValidationError, ConflictError } from "../errors/AppError.js";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

const INVITE_TTL_HOURS = 24;
const ADMIN_DOMAIN = env.ADMIN_DOMAIN || "http://localhost:5173";

// Roles a superAdmin can assign; roles an admin cannot create at all
const ASSIGNABLE_ROLES = ["admin", "superAdmin", "affiliate"];

const sha256 = (str) => createHash("sha256").update(str).digest("hex");

const generateUniqueUsername = async (firstName, lastName) => {
  const base = `${firstName}${lastName}`.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20) || "staff";
  if (!(await User.exists({ username: base }))) return base;
  for (let i = 0; i < 10; i++) {
    const candidate = `${base}${Math.floor(1000 + Math.random() * 9000)}`;
    if (!(await User.exists({ username: candidate }))) return candidate;
  }
  return `${base}${Date.now()}`;
};

const inviteEmail = (to, inviterName, role, link) => `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#f0faf7;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0faf7;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
        <tr><td style="background:linear-gradient(135deg,#3ab07c 0%,#1a8a5e 55%,#0f5e3e 100%);border-radius:16px 16px 0 0;padding:28px 40px;text-align:center;">
          <div style="display:inline-block;width:44px;height:44px;background:rgba(255,255,255,0.2);border-radius:10px;line-height:44px;font-size:22px;font-weight:800;color:#fff;margin-bottom:10px;">F</div>
          <div style="color:#fff;font-size:20px;font-weight:700;">Finchie Admin</div>
        </td></tr>
        <tr><td style="background:#fff;border-radius:0 0 16px 16px;padding:40px;box-shadow:0 4px 24px rgba(7,26,18,0.08);">
          <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#071a14;text-align:center;">You've been invited to join the team</h1>
          <p style="margin:0 0 20px;font-size:15px;color:#4a7a66;text-align:center;line-height:1.65;">
            <strong style="color:#071a14;">${inviterName}</strong> has invited you to join <strong>Finchie</strong> as a
            <strong style="color:#1a8a5e;">${role}</strong>.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #b4ddd0;border-radius:10px;margin:16px 0;font-size:14px;">
            <tr><td style="padding:10px 16px;color:#8aada0;font-weight:600;width:96px;">Role</td><td style="padding:10px 16px;color:#071a14;font-weight:700;text-transform:capitalize;">${role}</td></tr>
            <tr style="background:#f7fdfa;"><td style="padding:10px 16px;color:#8aada0;font-weight:600;">Expires</td><td style="padding:10px 16px;color:#071a14;">24 hours from now</td></tr>
          </table>
          <p style="text-align:center;margin:28px 0;">
            <a href="${link}" style="background:#1a8a5e;color:#fff;padding:14px 36px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block;">Accept Invitation →</a>
          </p>
          <div style="background:#fff8ed;border:1px solid #fde68a;border-left:4px solid #f59e0b;border-radius:8px;padding:13px 16px;margin:16px 0;">
            <p style="margin:0;font-size:13px;color:#b45309;line-height:1.55;">
              This invitation link expires in <strong>24 hours</strong> and can only be used once.
              Do not share this link with anyone.
            </p>
          </div>
          <p style="margin:20px 0 0;font-size:12px;color:#8aada0;text-align:center;">
            If you weren't expecting this invitation, you can safely ignore this email.
          </p>
          <p style="margin:4px 0 0;font-size:11px;color:#c0d4ce;text-align:center;">
            If the button doesn't work, copy this link: <span style="font-family:monospace;font-size:10px;word-break:break-all;">${link}</span>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

// ── Admin-protected handlers ──────────────────────────────────────────────────

export const createInvite = asyncHandler(async (req, res) => {
  const { email, role } = req.body;

  if (!email || !role) throw new ValidationError("email and role are required");
  if (!ASSIGNABLE_ROLES.includes(role)) {
    throw new ValidationError(`role must be one of: ${ASSIGNABLE_ROLES.join(", ")}`);
  }

  // Only superAdmin can create superAdmin accounts
  if (role === "superAdmin" && !req.user.roles.includes("superAdmin")) {
    throw new ForbiddenError("Only superAdmins can invite other superAdmins");
  }

  const normalEmail = email.toLowerCase().trim();

  // Block if this email already has an active Finchie account
  if (await User.exists({ email: normalEmail })) {
    throw new ConflictError("A user with this email already exists");
  }

  // Block if there is already a pending (unused, non-revoked, non-expired) invite for this email
  const existing = await StaffInvite.findOne({
    email: normalEmail,
    usedAt:    null,
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  });
  if (existing) {
    throw new ConflictError("A pending invite already exists for this email. Revoke it first.");
  }

  const rawToken = randomBytes(32).toString("hex"); // 256-bit entropy
  const tokenHash = sha256(rawToken);
  const expiresAt = new Date(Date.now() + INVITE_TTL_HOURS * 60 * 60 * 1000);

  const invite = await StaffInvite.create({
    email: normalEmail,
    role,
    tokenHash,
    expiresAt,
    createdBy: req.user.userId,
    createdByEmail: req.user.email, // enriched by auth middleware? No — fetch from DB
  });

  // Fetch inviter name for the email
  const inviter = await User.findOne({ userId: req.user.userId }).select("firstName lastName").lean();
  const inviterName = inviter ? `${inviter.firstName} ${inviter.lastName}`.trim() : "A Finchie admin";

  const link = `${ADMIN_DOMAIN}/accept-invite?token=${rawToken}`;

  try {
    await sendEmail(normalEmail, `You're invited to join Finchie — ${env.APP_NAME}`, inviteEmail(normalEmail, inviterName, role, link));
  } catch (err) {
    // Roll back invite if email fails — don't leave an unusable invite in DB
    await StaffInvite.deleteOne({ inviteId: invite.inviteId });
    logger.error({ event: "staff_invite_email_failed", email: normalEmail, err: err.message });
    throw new AppError("Failed to send invitation email. Please try again.", 500, "EMAIL_FAILED");
  }

  logger.info({ event: "staff_invite_created", email: normalEmail, role, createdBy: req.user.userId });

  res.status(201).json({
    success: true,
    message: `Invitation sent to ${normalEmail}`,
    data: {
      inviteId: invite.inviteId,
      email: invite.email,
      role: invite.role,
      expiresAt: invite.expiresAt,
    },
  });
});

export const listInvites = asyncHandler(async (req, res) => {
  const invites = await StaffInvite.find()
    .sort({ createdAt: -1 })
    .select("-tokenHash")
    .lean();
  res.json({ success: true, data: invites });
});

export const revokeInvite = asyncHandler(async (req, res) => {
  const invite = await StaffInvite.findOne({ inviteId: req.params.inviteId });
  if (!invite) throw new NotFoundError("Invite not found");
  if (invite.usedAt) throw new AppError("Cannot revoke an invite that has already been used", 400, "ALREADY_USED");
  if (invite.revokedAt) throw new AppError("Invite is already revoked", 400, "ALREADY_REVOKED");

  invite.revokedAt = new Date();
  await invite.save();

  logger.info({ event: "staff_invite_revoked", inviteId: invite.inviteId, revokedBy: req.user.userId });
  res.json({ success: true, message: "Invite revoked" });
});

// ── Public handlers (no auth required) ────────────────────────────────────────

export const validateToken = asyncHandler(async (req, res) => {
  const { token } = req.params;
  if (!token || token.length !== 64) throw new AppError("Invalid invite link", 400, "INVALID_TOKEN");

  const tokenHash = sha256(token);
  const invite = await StaffInvite.findOne({ tokenHash }).select("+tokenHash");

  if (!invite)            throw new AppError("Invalid or expired invite link", 400, "INVALID_TOKEN");
  if (invite.usedAt)      throw new AppError("This invite has already been used", 400, "INVITE_USED");
  if (invite.revokedAt)   throw new AppError("This invite has been revoked", 400, "INVITE_REVOKED");
  if (invite.expiresAt < new Date()) throw new AppError("This invite has expired", 400, "INVITE_EXPIRED");

  res.json({ success: true, data: { email: invite.email, role: invite.role, expiresAt: invite.expiresAt } });
});

export const acceptInvite = asyncHandler(async (req, res) => {
  const { token, firstName, lastName, password } = req.body;

  if (!token || !firstName || !password) {
    throw new ValidationError("token, firstName, and password are required");
  }
  if (typeof token !== "string" || token.length !== 64) {
    throw new AppError("Invalid invite token", 400, "INVALID_TOKEN");
  }

  // Validate password against the same policy as the main app
  const policyErrors = validatePasswordPolicy(password);
  if (policyErrors.length > 0) throw new ValidationError("Password does not meet requirements", policyErrors);

  const tokenHash = sha256(token);
  const invite = await StaffInvite.findOne({ tokenHash }).select("+tokenHash");

  if (!invite)            throw new AppError("Invalid or expired invite link", 400, "INVALID_TOKEN");
  if (invite.usedAt)      throw new AppError("This invite has already been used", 400, "INVITE_USED");
  if (invite.revokedAt)   throw new AppError("This invite has been revoked", 400, "INVITE_REVOKED");
  if (invite.expiresAt < new Date()) throw new AppError("This invite has expired", 400, "INVITE_EXPIRED");

  // Double-check email isn't already taken (race condition guard)
  if (await User.exists({ email: invite.email })) {
    invite.usedAt = new Date();
    await invite.save();
    throw new ConflictError("An account with this email already exists");
  }

  const username    = await generateUniqueUsername(firstName.trim(), (lastName || "").trim());
  const displayName = `${firstName.trim()} ${(lastName || "").trim()}`.trim();
  const passwordHash = await hashPassword(password);

  const newUser = await User.create({
    userId: uuidv4(),
    email:  invite.email,
    firstName: firstName.trim(),
    lastName:  (lastName || "").trim(),
    username,
    displayName,
    passwordHash,
    roles: [invite.role],
    isEmailVerified: true, // verified via invite link
    isActive: true,
    status: "active",
  });

  // Mark invite as used
  invite.usedAt  = new Date();
  invite.usedBy  = newUser.userId;
  await invite.save();

  logger.info({ event: "staff_account_created", userId: newUser.userId, email: newUser.email, role: invite.role });

  res.status(201).json({
    success: true,
    message: "Account created successfully. You can now log in to the admin dashboard.",
  });
});
