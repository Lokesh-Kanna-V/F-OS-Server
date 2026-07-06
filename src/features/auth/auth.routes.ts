import { Router } from "express";
import { requireAuth } from "@/shared/guards/require-auth";
import { authController } from "./auth.controller";

export const authRouter = Router();

authRouter.post("/signup", authController.signup);
authRouter.post("/login", authController.login);
authRouter.post("/logout", authController.logout);
authRouter.get("/me", requireAuth, authController.me);
