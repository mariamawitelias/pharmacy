import { Router, Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../lib/errors.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { createMedicineSchema, updateMedicineSchema } from "../schemas/medicine.schema.js";

const router = Router();

router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const search = req.query.search as string | undefined;
    res.json(await prisma.medicine.findMany({
      where: search ? {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { genericName: { contains: search, mode: "insensitive" } },
        ],
      } : undefined,
      take: 50,
    }));
  } catch (e) { next(e); }
});

router.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const medicineId = String(req.params.id);
    const medicine = await prisma.medicine.findUnique({ where: { id: medicineId } });
    if (!medicine) throw new AppError(404, "Medicine not found");
    res.json(medicine);
  } catch (e) { next(e); }
});

router.post("/", requireAuth, requireRole("ADMIN"),
  validate(createMedicineSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.status(201).json(await prisma.medicine.create({ data: req.body }));
    } catch (e) { next(e); }
  });

router.patch("/:id", requireAuth, requireRole("ADMIN"),
  validate(updateMedicineSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const medicineId = String(req.params.id);
      const existing = await prisma.medicine.findUnique({ where: { id: medicineId } });
      if (!existing) throw new AppError(404, "Medicine not found");

      const updated = await prisma.medicine.update({
        where: { id: medicineId },
        data: req.body,
      });
      res.json(updated);
    } catch (e) { next(e); }
  });

router.delete("/:id", requireAuth, requireRole("ADMIN"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const medicineId = String(req.params.id);
      const existing = await prisma.medicine.findUnique({ where: { id: medicineId } });
      if (!existing) throw new AppError(404, "Medicine not found");

      const inUse = await prisma.inventory.findFirst({ where: { medicineId } });
      if (inUse) {
        throw new AppError(409, "Cannot delete a medicine that pharmacies currently stock — remove it from inventory first");
      }

      await prisma.medicine.delete({ where: { id: medicineId } });
      res.status(204).send();
    } catch (e) { next(e); }
  });

export default router;