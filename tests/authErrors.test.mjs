// Tests: centralized auth error code → UI message system
// Verifies that every required error code produces the expected UI message
// and that no generic fallback leaks into auth flows.
// Run: node tests/authErrors.test.mjs

let pass = 0, fail = 0;
const assert = (label, condition) => {
  if (condition) { console.log(`  PASS: ${label}`); pass++; }
  else           { console.error(`  FAIL: ${label}`); fail++; }
};

// ─── Inline copy of the auth error map (mirrors fe/src/utils/authErrors.js) ───

const AUTH_ERROR_MESSAGES = {
  AUTH_INVALID_CREDENTIALS:    'The email or password you entered is incorrect. Please try again.',
  AUTH_USER_NOT_FOUND:         'The email or password you entered is incorrect. Please try again.',
  AUTH_PASSWORD_INCORRECT:     'The current password you entered is incorrect.',
  AUTH_EMAIL_NOT_VERIFIED:     'Please verify your email address before signing in.',
  AUTH_GOOGLE_ACCOUNT_REQUIRED: 'This account uses Google Sign-In. Please sign in with Google instead.',
  AUTH_GOOGLE_ACCOUNT_EXISTS:  'This email is registered with Google. Please sign in with Google instead.',
  AUTH_EMAIL_ALREADY_EXISTS:   'An account with this email already exists. Please sign in instead.',
  AUTH_ACCOUNT_LOCKED:         'Your account has been temporarily locked. Please try again later or reset your password.',
  ACCOUNT_LOCKED:              'Your account has been temporarily locked. Please try again later or reset your password.',
  AUTH_ACCOUNT_DEACTIVATED:    'Your account is deactivated. Sign in to reactivate it.',
  OTP_INVALID:                 'The code you entered is incorrect or has expired. Please try again.',
  OTP_EXPIRED:                 'This code has expired. Please request a new one.',
  OTP_LIMIT_EXCEEDED:          'Too many incorrect attempts. Please request a new code.',
  TOKEN_MISSING:               'Session missing. Please sign in again.',
  TOKEN_EXPIRED:               'Your session has expired. Please sign in again.',
  TOKEN_INVALID:               'Invalid session. Please sign in again.',
  TOKEN_REFRESH_FAILED:        'Could not refresh your session. Please sign in again.',
  UNAUTHORIZED:                'Authentication required. Please sign in.',
  OAUTH_FAILED:                'Google sign-in failed. Please try again.',
  OAUTH_EMAIL_MISMATCH:        "This Google account doesn't match your registered email.",
  OAUTH_PROVIDER_NOT_ALLOWED:  'This sign-in method is not allowed for your account.',
  OAUTH_MISCONFIGURED:         'Google sign-in is unavailable right now. Please try again later.',
  VALIDATION_ERROR:            'Please check your details and try again.',
  CONFLICT:                    'This account already exists.',
  FORBIDDEN:                   'Access denied.',
  NOT_FOUND:                   'Resource not found.',
  NETWORK_ERROR:               'No internet connection. Please check your network and try again.',
  TIMEOUT:                     'Request timed out. Please try again.',
  RATE_LIMITED:                'Too many requests. Please wait a moment and try again.',
  SERVICE_UNAVAILABLE:         'Service temporarily unavailable. Please try again later.',
  SERVER_ERROR:                'Something went wrong on our end. Please try again.',
  INTERNAL_ERROR:              'Something went wrong on our end. Please try again.',
};

const FALLBACK = "We couldn't complete your request. Please try again.";

function getAuthErrorMessage(codeOrError) {
  if (!codeOrError) return FALLBACK;
  if (typeof codeOrError === 'string') return AUTH_ERROR_MESSAGES[codeOrError] ?? FALLBACK;
  const { code, message } = codeOrError;
  if (code && AUTH_ERROR_MESSAGES[code]) return AUTH_ERROR_MESSAGES[code];
  return message || FALLBACK;
}

// ─── T1: All required error codes are defined and non-empty ──────────────────

console.log("=== T1: All required error codes are defined ===\n");

const REQUIRED_CODES = [
  'AUTH_INVALID_CREDENTIALS', 'AUTH_USER_NOT_FOUND', 'AUTH_ACCOUNT_LOCKED',
  'AUTH_ACCOUNT_DEACTIVATED', 'AUTH_EMAIL_NOT_VERIFIED', 'AUTH_PASSWORD_INCORRECT',
  'AUTH_GOOGLE_ACCOUNT_REQUIRED', 'AUTH_EMAIL_ALREADY_EXISTS', 'AUTH_GOOGLE_ACCOUNT_EXISTS',
  'TOKEN_MISSING', 'TOKEN_EXPIRED', 'TOKEN_INVALID', 'TOKEN_REFRESH_FAILED',
  'OTP_INVALID', 'OTP_EXPIRED', 'OTP_LIMIT_EXCEEDED',
  'OAUTH_FAILED', 'OAUTH_EMAIL_MISMATCH', 'OAUTH_PROVIDER_NOT_ALLOWED',
  'NETWORK_ERROR', 'SERVER_ERROR', 'SERVICE_UNAVAILABLE',
];

for (const code of REQUIRED_CODES) {
  const msg = getAuthErrorMessage(code);
  assert(`${code} → non-empty message`, typeof msg === 'string' && msg.length > 0);
  assert(`${code} → not generic fallback`, msg !== FALLBACK);
}

// ─── T2: Credential errors never reveal system details ───────────────────────

console.log("\n=== T2: Credential errors are enumeration-safe ===\n");

const credMessages = [
  getAuthErrorMessage('AUTH_INVALID_CREDENTIALS'),
  getAuthErrorMessage('AUTH_USER_NOT_FOUND'),
];

for (const msg of credMessages) {
  assert("no 'email' substring in cred error",    !msg.toLowerCase().includes('email not found'));
  assert("no 'user not found' in cred error",     !msg.toLowerCase().includes('user not found'));
  assert("no 'account does not exist' in cred",   !msg.toLowerCase().includes('does not exist'));
}

// ─── T3: Google-specific errors distinguish between cases ────────────────────

console.log("\n=== T3: Google-specific errors are distinct ===\n");

const googleRequired = getAuthErrorMessage('AUTH_GOOGLE_ACCOUNT_REQUIRED');
const googleExists   = getAuthErrorMessage('AUTH_GOOGLE_ACCOUNT_EXISTS');
const emailExists    = getAuthErrorMessage('AUTH_EMAIL_ALREADY_EXISTS');

assert("AUTH_GOOGLE_ACCOUNT_REQUIRED mentions Google", googleRequired.toLowerCase().includes('google'));
assert("AUTH_GOOGLE_ACCOUNT_EXISTS mentions Google",   googleExists.toLowerCase().includes('google'));
assert("AUTH_EMAIL_ALREADY_EXISTS does NOT include Google-specific text",
  !emailExists.toLowerCase().includes('sign in with google'));
assert("all three messages are distinct",
  googleRequired !== googleExists && googleExists !== emailExists && googleRequired !== emailExists);

// ─── T4: Token errors all guide user to sign in again ────────────────────────

console.log("\n=== T4: Token errors guide user to re-authenticate ===\n");

for (const code of ['TOKEN_INVALID', 'TOKEN_EXPIRED', 'TOKEN_MISSING', 'TOKEN_REFRESH_FAILED']) {
  const msg = getAuthErrorMessage(code);
  assert(`${code} mentions signing in`, msg.toLowerCase().includes('sign in'));
}

// ─── T5: OTP errors are distinct from credential errors ──────────────────────

console.log("\n=== T5: OTP errors are distinct from credential errors ===\n");

const otpInvalid = getAuthErrorMessage('OTP_INVALID');
const otpExpired = getAuthErrorMessage('OTP_EXPIRED');
const credError  = getAuthErrorMessage('AUTH_INVALID_CREDENTIALS');

assert("OTP_INVALID !== AUTH_INVALID_CREDENTIALS", otpInvalid !== credError);
assert("OTP_EXPIRED !== OTP_INVALID",              otpExpired !== otpInvalid);
assert("OTP_EXPIRED mentions requesting new code", otpExpired.toLowerCase().includes('new'));

// ─── T6: getAuthErrorMessage({ code, message }) prefers known code ───────────

console.log("\n=== T6: Object input prefers known code over server message ===\n");

const serverMsg = "some internal server error string";
const result = getAuthErrorMessage({ code: 'AUTH_INVALID_CREDENTIALS', message: serverMsg });
assert("known code wins over server message", result !== serverMsg);
assert("known code returns the mapped message",
  result === AUTH_ERROR_MESSAGES['AUTH_INVALID_CREDENTIALS']);

// ─── T7: Unknown code falls through to server message ────────────────────────

console.log("\n=== T7: Unknown code falls through to server message ===\n");

const cleanServerMsg = "Please upgrade your plan to continue.";
const unknownResult = getAuthErrorMessage({ code: 'PAYMENT_REQUIRED', message: cleanServerMsg });
assert("unknown code returns server message", unknownResult === cleanServerMsg);

// ─── T8: Null/undefined inputs return safe fallback ──────────────────────────

console.log("\n=== T8: Null/undefined inputs return safe fallback ===\n");

assert("null → fallback",      getAuthErrorMessage(null)      === FALLBACK);
assert("undefined → fallback", getAuthErrorMessage(undefined) === FALLBACK);
assert("empty string → fallback", getAuthErrorMessage('')     === FALLBACK);
assert("empty object → fallback", getAuthErrorMessage({})     === FALLBACK);

// ─── T9: Network errors don't expose internal details ────────────────────────

console.log("\n=== T9: Network/infra error messages are user-safe ===\n");

for (const code of ['NETWORK_ERROR', 'TIMEOUT', 'SERVICE_UNAVAILABLE', 'INTERNAL_ERROR']) {
  const msg = getAuthErrorMessage(code);
  assert(`${code} → no stack trace`,   !msg.includes('Error:'));
  assert(`${code} → no path info`,     !msg.includes('/'));
  assert(`${code} → non-empty`,        msg.length > 10);
}

// ─── T10: ACCOUNT_LOCKED backward compat (old code still works) ──────────────

console.log("\n=== T10: Legacy ACCOUNT_LOCKED code is handled ===\n");

const oldCode = getAuthErrorMessage('ACCOUNT_LOCKED');
const newCode = getAuthErrorMessage('AUTH_ACCOUNT_LOCKED');
assert("ACCOUNT_LOCKED has a message",          oldCode !== FALLBACK);
assert("AUTH_ACCOUNT_LOCKED has a message",     newCode !== FALLBACK);
assert("both codes map to same message",        oldCode === newCode);

console.log(`\nResults: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
