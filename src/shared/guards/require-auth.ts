import type { NextFunction, Request, Response } from "express";
import { AUTH_COOKIE_NAME } from "@/shared/config/auth";
import { tokenService } from "@/shared/services/token.service";

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[AUTH_COOKIE_NAME];

  if (!token) {
    res.status(401).json({ success: false, error: "Not authenticated" });
    return;
  }

  try {
    req.user = tokenService.verify(token);
    next();
  } catch {
    res.status(401).json({ success: false, error: "Invalid or expired session" });
  }
}
