import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../lib/errors.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import inventoryRoutes from "./inventory.routes.js";

const pharmacySchema = z.object({
  name: z.string().min(2),
  address: z.string().min(5),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  phone: z.string().optional(),
  openTime: z.string().optional(),
  closeTime: z.string().optional(),
});

const router = Router();

router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await prisma.pharmacy.findMany({ where: { verified: true } }));
  } catch (e) { next(e); }
});

router.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    const pharmacy = await prisma.pharmacy.findUnique({ where: { id } });
    if (!pharmacy) throw new AppError(404, "Pharmacy not found");
    res.json(pharmacy);
  } catch (e) { next(e); }
});

router.post("/", requireAuth, requireRole("ADMIN"),
  validate(pharmacySchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.status(201).json(await prisma.pharmacy.create({ data: req.body }));
    } catch (e) { next(e); }
  });

router.patch("/:id/verify", requireAuth, requireRole("ADMIN"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    res.json(await prisma.pharmacy.update({
      where: { id },
      data: { verified: true },
    }));
  } catch (e) { next(e); }
});

router.use("/:id/inventory", inventoryRoutes);

export default router;