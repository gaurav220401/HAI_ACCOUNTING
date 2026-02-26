import { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/errors";

/**
 * Global error handler middleware.
 * Formats errors consistently for API responses.
 */
const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  // Log the error
  console.error(`[${new Date().toISOString()}] Error:`, {
    message: err.message,
    stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
    path: req.path,
    method: req.method,
  });

  // If it's our custom AppError
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      message: err.message,
      code: err.code,
    });
    return;
  }

  // Mongoose validation error
  if (err.name === "ValidationError") {
    res.status(400).json({
      success: false,
      message: err.message,
      code: "VALIDATION_ERROR",
    });
    return;
  }

  // Mongoose duplicate key error
  if ((err as any).code === 11000) {
    const field = Object.keys((err as any).keyValue || {})[0] || "field";
    res.status(409).json({
      success: false,
      message: `Duplicate value for ${field}`,
      code: "DUPLICATE_KEY",
    });
    return;
  }

  // Mongoose cast error (invalid ObjectId)
  if (err.name === "CastError") {
    res.status(400).json({
      success: false,
      message: "Invalid ID format",
      code: "INVALID_ID",
    });
    return;
  }

  // Zod validation error
  if (err.name === "ZodError") {
    res.status(400).json({
      success: false,
      message: "Validation failed",
      code: "VALIDATION_ERROR",
      errors: (err as any).errors,
    });
    return;
  }

  // Default 500 error
  res.status(500).json({
    success: false,
    message:
      process.env.NODE_ENV === "production" ?
        "Something went wrong"
      : err.message,
    code: "INTERNAL_ERROR",
  });
};

export default errorHandler;
