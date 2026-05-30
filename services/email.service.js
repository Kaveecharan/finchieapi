import nodemailer from "nodemailer";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

let transporter = null;

const getTransporter = () => {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: "Gmail",
      auth: { user: env.EMAIL_USER, pass: env.EMAIL_PASS },
      pool: true,
      maxConnections: 5,
    });
  }
  return transporter;
};

export const sendEmail = async (to, subject, html) => {
  try {
    await getTransporter().sendMail({
      from: `"${env.EMAIL_FROM_NAME}" <${env.EMAIL_USER}>`,
      to,
      subject,
      html,
    });
  } catch (err) {
    logger.error({ event: "email_send_failed", to, subject, err: err.message });
    throw err;
  }
};

// ── Design tokens ──────────────────────────────────────────────────────────────
const C = {
  primary:      "#1A8A5E",
  primaryDark:  "#0F5E3E",
  primaryLight: "#3AB07C",
  bg:           "#F0FAF7",
  card:         "#FFFFFF",
  border:       "#B4DDD0",
  rowAlt:       "#F7FDFA",
  codeBg:       "#E4F7EF",
  text:         "#071A14",
  textSub:      "#4A7A66",
  textMuted:    "#8AADA0",
  danger:       "#EF4444",
  dangerLight:  "#FEF2F2",
  dangerBorder: "#FECACA",
  warning:      "#F59E0B",
  warnLight:    "#FFFBEB",
  warnBorder:   "#FDE68A",
};

// ── Base layout ────────────────────────────────────────────────────────────────
const baseEmailLayout = (content) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
</head>
<body style="margin:0;padding:0;background-color:${C.bg};font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:${C.bg};padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

          <!-- Header -->
          <tr>
            <td style="background-color:${C.primary};background:linear-gradient(135deg,${C.primaryLight} 0%,${C.primary} 55%,${C.primaryDark} 100%);border-radius:16px 16px 0 0;padding:28px 40px;text-align:center;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <div style="display:inline-block;width:44px;height:44px;background:rgba(255,255,255,0.2);border-radius:10px;line-height:44px;font-size:22px;font-weight:800;color:#ffffff;margin-bottom:10px;">F</div>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:0.5px;">${env.APP_NAME}</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Card body -->
          <tr>
            <td style="background:${C.card};border-radius:0 0 16px 16px;padding:40px;box-shadow:0 4px 24px rgba(7,26,18,0.08);">
              ${content}
              <!-- Footer -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:32px;border-top:1px solid ${C.border};padding-top:24px;">
                <tr>
                  <td align="center">
                    <p style="margin:0 0 6px;font-size:12px;color:${C.textMuted};">
                      This email was sent by <strong style="color:${C.textSub};">${env.APP_NAME}</strong>. Do not share it with anyone.
                    </p>
                    <p style="margin:0;font-size:11px;color:${C.textMuted};">
                      &copy; ${new Date().getFullYear()} ${env.APP_NAME}. All rights reserved.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

// ── Reusable content blocks ────────────────────────────────────────────────────
const title = (text, color = C.text) =>
  `<h1 style="margin:0 0 6px;font-size:22px;font-weight:700;color:${color};text-align:center;">${text}</h1>`;

const greeting = (firstName) =>
  firstName
    ? `<p style="margin:0 0 14px;font-size:15px;color:${C.textSub};text-align:center;">Hi <strong style="color:${C.text};">${firstName}</strong>,</p>`
    : "";

const bodyText = (text) =>
  `<p style="margin:0 0 20px;font-size:15px;color:${C.textSub};text-align:center;line-height:1.65;">${text}</p>`;

const otpBlock = (code) => `
  <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;">
    <tr>
      <td align="center">
        <div style="display:inline-block;background:${C.codeBg};border:2px solid ${C.border};border-radius:14px;padding:18px 44px;">
          <span style="font-family:'Courier New',Courier,monospace;font-size:38px;font-weight:800;letter-spacing:14px;color:${C.text};">${code}</span>
        </div>
      </td>
    </tr>
  </table>`;

const note = (text) =>
  `<p style="margin:0 0 8px;font-size:13px;color:${C.textMuted};text-align:center;line-height:1.5;">${text}</p>`;

const alertBox = (text, type = "danger") => {
  const bg  = type === "danger" ? C.dangerLight : C.warnLight;
  const bdr = type === "danger" ? C.dangerBorder : C.warnBorder;
  const clr = type === "danger" ? C.danger : C.warning;
  return `
  <div style="background:${bg};border:1px solid ${bdr};border-left:4px solid ${clr};border-radius:8px;padding:13px 16px;margin:16px 0;">
    <p style="margin:0;font-size:13.5px;color:${clr};line-height:1.55;">${text}</p>
  </div>`;
};

const divider = () =>
  `<hr style="border:none;border-top:1px solid ${C.border};margin:24px 0;" />`;

const metaTable = (rows) => `
  <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${C.border};border-radius:10px;overflow:hidden;margin:16px 0;font-size:14px;">
    ${rows
      .map(
        ({ label, value }, i) => `
    <tr style="background:${i % 2 === 0 ? C.card : C.rowAlt};">
      <td style="padding:10px 16px;color:${C.textMuted};font-weight:600;width:96px;border-bottom:1px solid ${C.border};white-space:nowrap;">${label}</td>
      <td style="padding:10px 16px;color:${C.text};border-bottom:1px solid ${C.border};">${value}</td>
    </tr>`
      )
      .join("")}
  </table>`;

const messageBlock = (text) => `
  <div style="background:${C.bg};border:1px solid ${C.border};border-radius:10px;padding:16px 20px;margin:16px 0;">
    <p style="margin:0;font-size:14px;color:${C.text};line-height:1.7;white-space:pre-line;">${text}</p>
  </div>`;

const sectionLabel = (text) =>
  `<p style="margin:16px 0 4px;font-size:12px;font-weight:700;color:${C.textSub};text-transform:uppercase;letter-spacing:0.6px;">${text}</p>`;

// ── Email senders ──────────────────────────────────────────────────────────────
export const sendVerificationEmail = (to, firstName, code) =>
  sendEmail(
    to,
    `Verify your email — ${env.APP_NAME}`,
    baseEmailLayout(`
      ${title("Verify Your Email Address")}
      ${greeting(firstName)}
      ${bodyText("You're almost there! Enter the code below to verify your email address and complete your sign-up.")}
      ${otpBlock(code)}
      ${note("This code expires in <strong>10 minutes</strong>.")}
      ${note("If you didn't create an account, you can safely ignore this email.")}
    `)
  );

export const sendPasswordResetEmail = (to, firstName, code) =>
  sendEmail(
    to,
    `Reset your password — ${env.APP_NAME}`,
    baseEmailLayout(`
      ${title("Reset Your Password")}
      ${greeting(firstName)}
      ${bodyText("We received a request to reset your password. Use the code below to continue.")}
      ${otpBlock(code)}
      ${note("This code expires in <strong>10 minutes</strong>.")}
      ${alertBox(
        "If you didn't request a password reset, you can ignore this email. If you're concerned about unauthorised access, please contact support immediately.",
        "warning"
      )}
    `)
  );

export const sendSecurityAlertEmail = (to, firstName, message) =>
  sendEmail(
    to,
    `Security alert — ${env.APP_NAME}`,
    baseEmailLayout(`
      ${title("Security Alert", C.danger)}
      ${greeting(firstName)}
      ${bodyText("We detected activity on your account that we want to make you aware of.")}
      ${alertBox(message, "danger")}
      ${note("If this was you, no action is needed.")}
      ${note("If this was <strong>not you</strong>, please secure your account immediately by changing your password.")}
    `)
  );

export const sendEmailChangeEmail = (to, code) =>
  sendEmail(
    to,
    `Verify your new email — ${env.APP_NAME}`,
    baseEmailLayout(`
      ${title("Verify Your New Email Address")}
      ${bodyText("Use the code below to confirm your new email address.")}
      ${otpBlock(code)}
      ${note("This code expires in <strong>10 minutes</strong>.")}
      ${alertBox("If you didn't request an email change, please ignore this email or contact support.", "warning")}
    `)
  );

export const sendSupportEmail = (fromEmail, subject, message, userId) =>
  sendEmail(
    env.SUPPORT_EMAIL || env.EMAIL_USER,
    `[Support] ${subject}`,
    baseEmailLayout(`
      ${title("Support Request")}
      ${bodyText("A new support request has been submitted via the app.")}
      ${divider()}
      ${metaTable([
        { label: "From",    value: fromEmail },
        ...(userId ? [{ label: "User ID", value: `<span style="font-family:monospace;font-size:12px;">${userId}</span>` }] : []),
        { label: "Subject", value: `<strong>${subject}</strong>` },
      ])}
      ${sectionLabel("Message")}
      ${messageBlock(message)}
    `)
  );
