import type { Request, Response } from "express";
import { AUTH_COOKIE_NAME, authCookieOptions } from "@/shared/config/auth";
import { authService } from "./auth.service";
import { loginSchema, signupSchema } from "./auth.schema";

export const authController = {
  signup: async (req: Request, res: Response) => {
    const parsed = signupSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.message });
      return;
    }

    const { user, token } = await authService.signup(parsed.data);
    res.cookie(AUTH_COOKIE_NAME, token, authCookieOptions);
    res.status(201).json({ success: true, data: { user } });
  },

  login: async (req: Request, res: Response) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.message });
      return;
    }

    const { user, token } = await authService.login(parsed.data);
    res.cookie(AUTH_COOKIE_NAME, token, authCookieOptions);
    res.json({ success: true, data: { user } });
  },

  logout: async (_req: Request, res: Response) => {
    res.clearCookie(AUTH_COOKIE_NAME, authCookieOptions);
    res.json({ success: true, data: { message: "Logged out" } });
  },

  me: async (req: Request, res: Response) => {
    const user = await authService.getById(req.user!.sub);
    res.json({ success: true, data: { user } });
  },
};
