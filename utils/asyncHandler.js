// Wraps async route handlers to forward unhandled rejections to Express error middleware.
// Without this, unhandled promise rejections in routes crash silently in Express 4
// (Express 5 handles this natively, but explicit wrapping is still good practice).
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
