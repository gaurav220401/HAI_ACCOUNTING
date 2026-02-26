import { Request, Response, NextFunction } from "express";
import { ZodSchema } from "zod";

/**
 * Middleware factory: Validate request body/query/params against a Zod schema.
 *
 * Usage:
 *   router.post('/items', validate(createItemSchema, 'body'), controller.create);
 *   router.get('/items', validate(listQuerySchema, 'query'), controller.list);
 */
export const validate = (
  schema: ZodSchema,
  source: "body" | "query" | "params" = "body",
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const parsed = schema.parse(req[source]);
      // Replace with parsed (coerced/transformed) values
      (req as any)[source] = parsed;
      next();
    } catch (err: any) {
      if (err?.issues) {
        const errors = err.issues.map((e: any) => ({
          field: e.path?.join(".") || "",
          message: e.message,
        }));
        res.status(400).json({
          success: false,
          message: "Validation failed",
          code: "VALIDATION_ERROR",
          errors,
        });
        return;
      }
      next(err);
    }
  };
};
