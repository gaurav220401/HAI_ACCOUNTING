import { Request, Response, NextFunction } from "express";
import { PaginationQuery } from "../types";

/**
 * Middleware: Parse and normalize pagination query parameters.
 * Attaches normalized pagination to req.pagination.
 */
declare global {
  namespace Express {
    interface Request {
      pagination?: {
        page: number;
        limit: number;
        skip: number;
        sort: Record<string, 1 | -1>;
        search?: string;
      };
    }
  }
}

export const paginate = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const query = req.query as unknown as PaginationQuery;

  const page = Math.max(1, parseInt(String(query.page || "1"), 10));
  const limit = Math.min(
    100,
    Math.max(1, parseInt(String(query.limit || "20"), 10)),
  );
  const skip = (page - 1) * limit;

  const sortBy = (query.sortBy as string) || "createdAt";
  const sortOrder = query.sortOrder === "asc" ? 1 : -1;

  req.pagination = {
    page,
    limit,
    skip,
    sort: { [sortBy]: sortOrder } as Record<string, 1 | -1>,
    search: query.search as string | undefined,
  };

  next();
};
