import { Request, Response, NextFunction, RequestHandler } from "express";

/**
 * Wraps an async route handler to catch rejected promises
 * and forward errors to Express error handler.
 */
const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>,
): RequestHandler => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

export default asyncHandler;
