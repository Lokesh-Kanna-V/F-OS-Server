import express from "express";
import cors from "cors";
import morgan from "morgan";
import { errorHandler } from "@/shared/middleware/error-handler";

export const app = express();

app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

app.get("/health", (_req, res) => {
  res.json({ success: true, data: { status: "ok" } });
});

// Feature routers are mounted here, e.g.:
// app.use("/api/machines", machinesRouter);

app.use(errorHandler);
