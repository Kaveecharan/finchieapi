import { ValidationError } from "../errors/AppError.js";

/**
 * Zod validation middleware factory.
 * source: "body" | "query" | "params"
 */
export const validate = (schema, source = "body") =>
  (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const errors = result.error.issues.map((i) => ({
        field: i.path.join("."),
        message: i.message,
      }));
      return next(new ValidationError("Validation failed", errors));
    }
    // Replace req[source] with parsed/transformed data (e.g., lowercased email).
    // req.query and req.params are getter-only on IncomingMessage in the router
    // package, so we must mutate the existing object rather than reassign.
    if (source === "body") {
      req[source] = result.data;
    } else {
      Object.assign(req[source], result.data);
    }
    next();
  };
