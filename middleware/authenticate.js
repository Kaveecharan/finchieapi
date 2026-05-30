import { verifyAccessToken } from "../services/token.service.js";
import { AuthError, ForbiddenError } from "../errors/AppError.js";

export const authenticate = (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return next(new AuthError());

  const token = auth.slice(7);
  try {
    const payload = verifyAccessToken(token);
    req.user = {
      userId: payload.sub,
      roles: payload.roles ?? [],
      sessionId: payload.sid,
      passwordVersion: payload.pwv,
    };
    next();
  } catch {
    next(new AuthError("Invalid or expired token"));
  }
};

// Checks that at least one of the required roles is present on the user.
// Always call authenticate before authorize.
export const authorize = (...roles) =>
  (req, res, next) => {
    if (!req.user) return next(new AuthError());
    const hasRole = roles.some((r) => req.user.roles.includes(r));
    if (!hasRole) return next(new ForbiddenError());
    next();
  };
