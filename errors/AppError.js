export class AppError extends Error {
  constructor(message, statusCode = 500, code = "INTERNAL_ERROR", isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message = "Validation failed", errors = []) {
    super(message, 400, "VALIDATION_ERROR");
    this.errors = errors;
  }
}

export class AuthError extends AppError {
  constructor(message = "Authentication required", code = "UNAUTHORIZED") {
    super(message, 401, code);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Access denied") {
    super(message, 403, "FORBIDDEN");
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found") {
    super(message, 404, "NOT_FOUND");
  }
}

export class ConflictError extends AppError {
  constructor(message = "Resource already exists", code = "CONFLICT") {
    super(message, 409, code);
  }
}

export class RateLimitError extends AppError {
  constructor(message = "Too many requests", retryAfter = null) {
    super(message, 429, "RATE_LIMITED");
    this.retryAfter = retryAfter;
  }
}

export class AccountLockedError extends AppError {
  constructor(retryAfterSeconds) {
    super("Account temporarily locked. Try again later.", 429, "ACCOUNT_LOCKED");
    this.retryAfter = retryAfterSeconds;
  }
}

export class MfaRequiredError extends AppError {
  constructor(mfaToken) {
    super("MFA verification required", 200, "MFA_REQUIRED");
    this.mfaToken = mfaToken;
  }
}
