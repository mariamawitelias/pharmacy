import { Router, Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../lib/errors.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { z } from "zod";

const inventoryItemSchema = z.object({
  medicineId: z.string().min(1),
  quantity: z.number().int().min(0).default(0),
  price: z.number().min(0),
});

const router = Router({ mergeParams: true });

router.get("/", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pharmacyId = String(req.params.id);
    const items = await prisma.inventory.findMany({
      where: { pharmacyId },
      include: { medicine: true },
    });
    res.json(items);
  } catch (e) { next(e); }
});

router.post("/", requireAuth, requireRole("ADMIN"), validate(inventoryItemSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pharmacyId = String(req.params.id);
    const existing = await prisma.inventory.findUnique({
      where: { pharmacyId_medicineId: { pharmacyId, medicineId: req.body.medicineId } },
    });

    if (existing) {
      const updated = await prisma.inventory.update({
        where: { pharmacyId_medicineId: { pharmacyId, medicineId: req.body.medicineId } },
        data: {
          quantity: req.body.quantity,
          price: req.body.price,
        },
      });
      return res.status(200).json(updated);
    }

    const item = await prisma.inventory.create({
      data: {
        pharmacyId,
        medicineId: req.body.medicineId,
        quantity: req.body.quantity,
        price: req.body.price,
      },
    });
    res.status(201).json(item);
  } catch (e) { next(e); }
});

export default router;
