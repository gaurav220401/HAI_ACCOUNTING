import { Request, Response } from "express";

const notFound = (req: Request, res: Response): void => {
  res.status(404).json({
    success: false,
    message: `Not Found: ${req.method} ${req.originalUrl}`,
    code: "NOT_FOUND",
  });
};

export default notFound;
