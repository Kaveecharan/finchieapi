import axios from "axios";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

const BREVO_SEND_URL = "https://api.brevo.com/v3/smtp/email";

export const sendEmail = async (to, subject, html) => {
  const MAX_ATTEMPTS = 3;
  let lastErr;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      await axios.post(
        BREVO_SEND_URL,
        {
          sender:      { name: env.EMAIL_FROM_NAME, email: env.EMAIL_USER },
          to:          [{ email: to }],
          subject,
          htmlContent: html,
        },
        {
          headers: { "api-key": env.BREVO_API_KEY, "content-type": "application/json" },
          timeout: 10_000,
        }
      );
      return;
    } catch (err) {
      lastErr = err;
      const status = err?.response?.status;
      // 4xx (except 429 rate-limit) are permanent — no point retrying
      if (status && status >= 400 && status < 500 && status !== 429) break;
      if (attempt === MAX_ATTEMPTS) break;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** (attempt - 1)));
    }
  }
  logger.error({ event: "email_send_failed", to, subject, err: lastErr?.message });
  throw lastErr;
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

// ── Subscription lifecycle emails ──────────────────────────────────────────────

const fmtDate = (d) =>
  new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

const fmtAmount = (amount, currency = "gbp") => {
  const sym = currency === "gbp" ? "£" : currency === "usd" ? "$" : "€";
  return `${sym}${Number(amount).toFixed(2)}`;
};

export const sendSubscriptionActivatedEmail = (to, firstName, { trialEnd, amount = 3.99, currency = "gbp" }) =>
  sendEmail(
    to,
    `Premium Subscription Activated — ${env.APP_NAME}`,
    baseEmailLayout(`
      ${title("Welcome to Premium! 💎")}
      ${greeting(firstName)}
      ${bodyText("Your 30-day free trial has started. You now have access to all premium features, including AI insights, unlimited analytics history, and data exports.")}
      ${metaTable([
        { label: "Plan",       value: "<strong>Finchie Premium</strong>" },
        { label: "Trial ends", value: fmtDate(trialEnd) },
        { label: "Then",       value: `${fmtAmount(amount, currency)} / month` },
      ])}
      ${alertBox(
        "No charge today. Your card will only be billed when your trial ends. Cancel anytime before then.",
        "warning"
      )}
      ${note("For billing help, reply to this email or contact support from within the app.")}
    `)
  );

export const sendTrialEndingSoonEmail = (to, firstName, daysLeft) =>
  sendEmail(
    to,
    `Your free trial ends in ${daysLeft} day${daysLeft !== 1 ? "s" : ""} — ${env.APP_NAME}`,
    baseEmailLayout(`
      ${title("Trial Ending Soon ⏰", C.warning)}
      ${greeting(firstName)}
      ${bodyText(`Your 30-day free trial ends in <strong>${daysLeft} day${daysLeft !== 1 ? "s" : ""}</strong>. After that, you'll be billed <strong>£3.99/month</strong> to keep your premium access.`)}
      ${alertBox(
        "To avoid being charged, cancel your subscription before your trial ends. You can do this from Profile → Settings → Subscription.",
        "warning"
      )}
      ${note("If you love Finchie Premium, no action is needed — you'll be seamlessly billed and keep access.")}
    `)
  );

export const sendRenewalReminderEmail = (to, firstName, { daysLeft, renewalDate, amount = 3.99, currency = "gbp", isTrial = false }) =>
  sendEmail(
    to,
    `Your ${isTrial ? "free trial" : "subscription"} renews in ${daysLeft} day${daysLeft !== 1 ? "s" : ""} — ${env.APP_NAME}`,
    baseEmailLayout(`
      ${title(`Renewing in ${daysLeft} Day${daysLeft !== 1 ? "s" : ""} ⏰`, C.warning)}
      ${greeting(firstName)}
      ${bodyText(isTrial
        ? `Your 30-day free trial ends in <strong>${daysLeft} day${daysLeft !== 1 ? "s" : ""}</strong>. Your card will be charged <strong>${fmtAmount(amount, currency)}/month</strong> automatically to keep your premium access.`
        : `Your Finchie Premium subscription renews in <strong>${daysLeft} day${daysLeft !== 1 ? "s" : ""}</strong>. Your card will be charged <strong>${fmtAmount(amount, currency)}</strong> automatically on <strong>${fmtDate(renewalDate)}</strong>.`
      )}
      ${metaTable([
        { label: "Plan",                            value: "<strong>Finchie Premium</strong>" },
        { label: "Amount",                          value: `${fmtAmount(amount, currency)} / month` },
        { label: isTrial ? "Trial ends" : "Renews", value: fmtDate(renewalDate) },
      ])}
      ${alertBox(
        "To avoid being charged, cancel before the renewal date from Profile → Settings → Subscription.",
        "warning"
      )}
      ${note("If you'd like to keep your premium access, no action is needed — you'll be billed automatically.")}
    `)
  );

export const sendPaymentSucceededEmail = (to, firstName, { amount, currency = "gbp", invoiceUrl, nextRenewalDate }) =>
  sendEmail(
    to,
    `Payment confirmed — ${env.APP_NAME}`,
    baseEmailLayout(`
      ${title("Payment Confirmed ✅")}
      ${greeting(firstName)}
      ${bodyText("Thank you! Your subscription payment was processed successfully.")}
      ${metaTable([
        { label: "Amount",   value: `<strong>${fmtAmount(amount, currency)}</strong>` },
        { label: "Status",   value: "<span style=\"color:#1A8A5E;font-weight:700;\">Paid</span>" },
        ...(nextRenewalDate ? [{ label: "Next charge", value: fmtDate(nextRenewalDate) }] : []),
      ])}
      ${invoiceUrl
        ? `<p style="text-align:center;margin:20px 0;"><a href="${invoiceUrl}" style="background:#1A8A5E;color:#fff;padding:11px 26px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;">View Invoice</a></p>`
        : ""}
    `)
  );

export const sendPaymentFailedEmail = (to, firstName, { gracePeriodEnd }) =>
  sendEmail(
    to,
    `Payment failed — action required — ${env.APP_NAME}`,
    baseEmailLayout(`
      ${title("Payment Failed", C.danger)}
      ${greeting(firstName)}
      ${bodyText("We were unable to process your subscription payment. Please update your payment method to keep your premium access.")}
      ${alertBox(
        `Your premium access continues until <strong>${gracePeriodEnd ? fmtDate(gracePeriodEnd) : "the grace period ends"}</strong>. After that your subscription will be suspended.`,
        "danger"
      )}
      ${bodyText("To update your card, open the app and go to Profile → Settings → Subscription & Billing → Update Card.")}
      ${note("If this is unexpected, please contact support from within the app.")}
    `)
  );

export const sendCardUpdatedEmail = (to, firstName, { brand, last4 }) =>
  sendEmail(
    to,
    `Payment method updated — ${env.APP_NAME}`,
    baseEmailLayout(`
      ${title("Card Updated 💳")}
      ${greeting(firstName)}
      ${bodyText("Your default payment method has been updated successfully.")}
      ${metaTable([
        { label: "Card",    value: `${brand ? brand.charAt(0).toUpperCase() + brand.slice(1) : "Card"} ending in <strong>${last4}</strong>` },
        { label: "Changed", value: fmtDate(new Date()) },
      ])}
      ${alertBox("If you did not make this change, please contact support immediately.", "warning")}
    `)
  );

export const sendSubscriptionCancelledEmail = (to, firstName, { accessUntil }) =>
  sendEmail(
    to,
    `Subscription cancellation confirmed — ${env.APP_NAME}`,
    baseEmailLayout(`
      ${title("Cancellation Confirmed")}
      ${greeting(firstName)}
      ${bodyText("We've received your cancellation request. You'll keep full premium access until the end of your current billing period.")}
      ${metaTable([
        { label: "Access until", value: `<strong>${accessUntil ? fmtDate(accessUntil) : "end of current period"}</strong>` },
      ])}
      ${bodyText("Changed your mind? You can reactivate your subscription any time before the billing period ends from Profile → Settings → Subscription.")}
      ${note("We're sorry to see you go. If there's anything we can do to improve your experience, please let us know via support.")}
    `)
  );

export const sendSubscriptionExpiredEmail = (to, firstName) =>
  sendEmail(
    to,
    `Your premium access has ended — ${env.APP_NAME}`,
    baseEmailLayout(`
      ${title("Premium Access Ended")}
      ${greeting(firstName)}
      ${bodyText("Your Finchie Premium subscription has ended. You've been moved to the free plan.")}
      ${metaTable([
        { label: "Features lost", value: "AI insights, unlimited history, exports, enhanced charts" },
      ])}
      ${bodyText("Your data is safe and your account remains active. You can resubscribe any time to regain premium access.")}
      ${note("To resubscribe, open the app and go to Profile → Settings → Subscription.")}
    `)
  );
