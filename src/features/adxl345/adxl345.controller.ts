import type { Request, Response } from "express";
import { adxl345Service } from "./adxl345.service";

export const adxl345Controller = {
  getSnapshot: (_req: Request, res: Response) => {
    res.json({ success: true, data: adxl345Service.getSnapshot() });
  },

  stream: (req: Request, res: Response) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    const send = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    send("snapshot", adxl345Service.getSnapshot());

    const unsubscribe = adxl345Service.subscribe(({ type, data }) => {
      send(type, data);
    });

    req.on("close", () => {
      unsubscribe();
      res.end();
    });
  },
};
