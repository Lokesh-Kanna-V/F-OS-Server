import type { NextFunction, Request, Response } from "express";
import { HttpError } from "@/shared/lib/http-error";

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof HttpError) {
    res.status(err.statusCode).json({ success: false, error: err.message });
    return;
  }

  console.error(err);
  res.status(500).json({ success: false, error: "Internal server error" });
}
