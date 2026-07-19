import { Router } from "express";
import { adxl345Controller } from "./adxl345.controller";

export const adxl345Router = Router();

adxl345Router.get("/", adxl345Controller.getSnapshot);
adxl345Router.get("/stream", adxl345Controller.stream);
