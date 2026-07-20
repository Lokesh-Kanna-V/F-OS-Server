import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import { errorHandler } from "@/shared/middleware/error-handler";
import { env } from "@/shared/config/env";
import { authRouter } from "@/features/auth";
import { adxl345Router } from "@/features/adxl345";
import { ctRouter } from "@/features/ct";

export const app = express();

app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use(morgan("dev"));

app.get("/health", (_req, res) => {
  res.json({ success: true, data: { status: "ok" } });
});

app.use("/api/auth", authRouter);
app.use("/api/adxl345", adxl345Router);
app.use("/api/ct", ctRouter);

// Feature routers are mounted here, e.g.:
// app.use("/api/machines", machinesRouter);

app.use(errorHandler);
