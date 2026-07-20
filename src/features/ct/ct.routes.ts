import { Router } from "express";
import { ctController } from "./ct.controller";

export const ctRouter = Router();

ctRouter.get("/", ctController.getSnapshot);
ctRouter.get("/stream", ctController.stream);
