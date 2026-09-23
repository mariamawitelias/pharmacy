import "dotenv/config";
import express from "express";
import cors from "cors";
import { errorHandler } from "./lib/errors.js";
import { Router } from "express";

// ⚠️ TEMPORARY STUB ROUTERS — Person 1 owns these routes.
// These are empty Routers put here ONLY so tsx/tsc can compile app.ts
// without depending on Person 1's pushed content. When Person 1 merges
// their route files, these stubs are replaced with the real modules.
// NOTE: path-less r.use() instead of r.all("*") — Express 5 (path-to-regexp v8)
// throws on a bare "*" route pattern, which would crash the app at import time.
const makeStubRouter = (name: string) => {
  const r = Router();
  r.use((_req, res) => {
    res.status(501).json({ error: `${name} routes — Person 1 implementation pending` });
  });
  return r;
};

const authRoutes = makeStubRouter("Auth");
const userRoutes = makeStubRouter("User");
const medicineRoutes = makeStubRouter("Medicine");
const pharmacyRoutes = makeStubRouter("Pharmacy");
const searchRoutes = makeStubRouter("Search");

// Person 3 owned routers — real implementations.
import questionRoutes from "./routes/question.routes.js";
import notificationRoutes from "./routes/notification.routes.js";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/auth", authRoutes);
app.use("/users", userRoutes);
app.use("/medicines", medicineRoutes);
app.use("/pharmacies", searchRoutes);
app.use("/pharmacies", pharmacyRoutes);
app.use("/questions", questionRoutes);
app.use("/notifications", notificationRoutes);

app.use(errorHandler);
export default app;
