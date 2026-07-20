import type { Request, Response } from "express";
import { ctService } from "./ct.service";

export const ctController = {
  getSnapshot: (_req: Request, res: Response) => {
    res.json({ success: true, data: ctService.getSnapshot() });
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

    send("snapshot", ctService.getSnapshot());

    const unsubscribe = ctService.subscribe(({ type, data }) => {
      send(type, data);
    });

    req.on("close", () => {
      unsubscribe();
      res.end();
    });
  },
};
