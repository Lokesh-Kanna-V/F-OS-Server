---
name: nodejs-express-prisma-architecture
description: Enforces a feature-first Node.js/Express backend structure with Prisma + PostgreSQL — routes, controllers, services, validation via Zod. Use when creating or editing any Express route, controller, Prisma query, or backend API in a project.
---

# Node.js + Express + Prisma Backend Architecture (Light)

Standard folder structure and layering convention for all Node.js/Express backend projects using Prisma + PostgreSQL. Apply consistently regardless of project. Lean version — start here, add `helpers/` or `config/` per-feature only once earned (see "Growing a feature" below).

## General Guidelines

- **Feature-first**: Each domain/resource (e.g., Reports, Machines, Payroll) is self-contained in its own folder.
- **Layer separation inside each feature**:
  - **Routes** = HTTP wiring only (method + path → controller)
  - **Controllers** = request/response handling, calls validation then service
  - **Services** = business logic + Prisma queries
  - **Validation (Zod schemas)** = input contracts
- **Request flow is fixed**: `router → validate (Zod) → controller → service (Prisma) → response`. Never let unvalidated input reach a service or Prisma call.
- **Reusables live in `shared/` only if truly cross-feature.**
- **Open/Closed Principle**: Adding a feature means adding a folder, not editing existing unrelated ones.

## High-Level Structure

```
src/
│
├── features/                  # Main domain/features (SRP per folder)
│   ├── feature-name/
│   │   ├── feature.routes.ts  # Express router — path + method → controller, nothing else
│   │   ├── feature.controller.ts  # req/res handling: validate → call service → respond
│   │   ├── feature.service.ts     # business logic + Prisma queries
│   │   ├── feature.schema.ts      # Zod schemas for this feature's input/output
│   │   ├── feature.types.ts       # TypeScript interfaces specific to this feature
│   │   └── index.ts               # Barrel export (router + any types other features need)
│   │
│   └── ...                    # One folder per feature, same pattern
│
├── shared/                    # Cross-feature reusable code
│   ├── middleware/            # auth, error handler, request logger, rate limiter
│   ├── lib/                   # Pure utilities (date, currency, pagination helpers)
│   ├── services/              # Cross-cutting services (email, storage, MQTT client, etc.)
│   ├── config/                # App-wide constants, env parsing
│   ├── types/                 # Global interfaces (e.g., AuthedRequest)
│   └── guards/                # Auth/role/tenant guards reused across features
│
├── prisma/
│   ├── schema.prisma           # Single source of truth for DB schema
│   └── migrations/             # Generated migration history — never hand-edit
│
├── db/
│   └── client.ts               # Single shared PrismaClient instance
│
├── app.ts                      # Express app setup — middleware registration, route mounting
├── server.ts                   # Entry point — starts the HTTP server
└── env.d.ts                    # Type definitions for env vars
```

## Folder Responsibilities

### `features/<feature-name>/`

- `*.routes.ts` → Express `Router()`, maps HTTP method + path to a controller function. No logic here.
- `*.controller.ts` → parses `req`, calls the Zod schema to validate, calls the service, sends the `res` in the standard response shape. No Prisma calls here.
- `*.service.ts` → all business logic and all Prisma queries for this feature live here. Nothing else touches `db/client.ts` for this feature's data.
- `*.schema.ts` → Zod schemas for request body/query/params, and response shape if needed. Shared with the frontend's matching schema where practical.
- `*.types.ts` → types not already covered by Prisma's generated types or the Zod schema.

### `shared/`

- `middleware/` → auth verification, centralized error handler, logging, rate limiting — registered once in `app.ts`.
- `lib/` → pure utility functions with no side effects.
- `services/` → things multiple features depend on (email sending, file storage, external API clients).
- `config/` → env var parsing/validation (fail fast on missing/invalid env vars at startup), app-wide constants.
- `types/` → shared types like an authenticated request type (`AuthedRequest` with `req.user`).
- `guards/` → reusable auth/role/tenant-scoping checks, used as middleware in multiple features' routes.

### `db/client.ts`

Single `PrismaClient` instance, imported everywhere a service needs it. Never instantiate `new PrismaClient()` more than once in the app.

```ts
// db/client.ts
import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();
```

## Rules Claude Must Follow

- **One responsibility per file**: route = wiring, controller = request/response, service = logic + data access.
- **Validation always happens before a service is called.** Reject early with 400 + structured error on invalid input; never let bad data reach Prisma.
- **No raw SQL unless there's a documented performance reason** — comment why, and keep it in the service layer, parameterized.
- **Consistent response shape** across all routes: `{ success: boolean, data?: T, error?: string }`. No bare arrays/objects returned directly.
- **Multi-tenant / multi-client data**: if a project serves multiple clients/organizations, every Prisma query touching client-scoped data must filter by the tenant ID from the authenticated session — never trust a client-supplied ID alone for scoping.
- **Migrations**: never hand-edit files under `prisma/migrations/`. Schema changes go through `schema.prisma` → `npx prisma migrate dev`, shown as a diff first for confirmation before running.
- **Feature isolation**: a feature's service shouldn't directly import another feature's service. If two features need the same logic, promote it to `shared/services/` or `shared/lib/`.

## Example Feature Flow — "Machines"

```ts
// features/machines/machines.schema.ts
import { z } from "zod";

export const createMachineSchema = z.object({
  name: z.string().min(1),
  location: z.string().min(1),
});

export type CreateMachineInput = z.infer<typeof createMachineSchema>;
```

```ts
// features/machines/machines.service.ts
import { prisma } from "@/db/client";
import type { CreateMachineInput } from "./machines.schema";

export const machinesService = {
  list: (tenantId: string) => prisma.machine.findMany({ where: { tenantId } }),

  create: (tenantId: string, input: CreateMachineInput) =>
    prisma.machine.create({ data: { ...input, tenantId } }),
};
```

```ts
// features/machines/machines.controller.ts
import type { Request, Response } from "express";
import { createMachineSchema } from "./machines.schema";
import { machinesService } from "./machines.service";

export const machinesController = {
  list: async (req: Request, res: Response) => {
    const machines = await machinesService.list(req.user.tenantId);
    res.json({ success: true, data: machines });
  },

  create: async (req: Request, res: Response) => {
    const parsed = createMachineSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ success: false, error: parsed.error.message });
    }
    const machine = await machinesService.create(
      req.user.tenantId,
      parsed.data,
    );
    res.status(201).json({ success: true, data: machine });
  },
};
```

```ts
// features/machines/machines.routes.ts
import { Router } from "express";
import { machinesController } from "./machines.controller";
import { requireAuth } from "@/shared/guards/require-auth";

export const machinesRouter = Router();

machinesRouter.use(requireAuth);
machinesRouter.get("/", machinesController.list);
machinesRouter.post("/", machinesController.create);
```

```ts
// features/machines/index.ts
export { machinesRouter } from "./machines.routes";
export type { CreateMachineInput } from "./machines.schema";
```

```ts
// app.ts
import express from "express";
import { machinesRouter } from "@/features/machines";
import { errorHandler } from "@/shared/middleware/error-handler";

export const app = express();
app.use(express.json());
app.use("/api/machines", machinesRouter);
app.use(errorHandler); // registered last
```

## Growing a feature (when to add more structure)

Add these **per-feature, only when earned**:

- **`feature.helpers.ts`** — once the service has 2+ pure transformation functions that would otherwise clutter it (e.g. computing derived fields, formatting aggregation results).
- **`feature.config.ts`** — once the feature has constants/enums that would otherwise be scattered inline (status enums, thresholds, default pagination limits).
- **Splitting `feature.service.ts`** into multiple files (e.g. `machines.queries.ts` + `machines.commands.ts`) once it grows past a size where read/write operations are hard to scan together.

Don't create these upfront for every feature — only once a file would otherwise be misplaced or too large to scan easily.

## When reviewing existing code

If a route file has business logic or Prisma calls inline, or a controller directly touches `prisma`, flag it and propose moving the logic to the correct layer rather than leaving it as-is.
