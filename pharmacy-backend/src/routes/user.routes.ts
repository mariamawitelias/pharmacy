import { Router, Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../lib/errors.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { updateProfileSchema, linkCaregiverSchema } from "../schemas/user.schema.js";

const router = Router();

router.get("/me", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      include: { patient: true, doctor: true },
    });
    if (!user) throw new AppError(404, "User not found");
    const { passwordHash, ...safe } = user;
    res.json(safe);
  } catch (e) { next(e); }
});

router.patch("/me", requireAuth, validate(updateProfileSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { fullName, phone, ...patientFields } = req.body;
    const user = await prisma.user.update({
      where: { id: req.user!.userId },
      data: {
        ...(fullName && { fullName }),
        ...(phone && { phone }),
        ...(req.user!.role === "PATIENT" &&
          Object.keys(patientFields).length && {
            patient: { update: patientFields },
          }),
      },
      include: { patient: true },
    });
    const { passwordHash, ...safe } = user;
    res.json(safe);
  } catch (e) { next(e); }
});

router.get("/:patientId/notify-targets", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const patientId = String(req.params.patientId);
    const patient = await prisma.patient.findUnique({
      where: { userId: patientId },
      include: { user: true, caregiver: true },
    });
    if (!patient) throw new AppError(404, "Patient not found");

    const targets = [
      { userId: patient.user.id, email: patient.user.email, phone: patient.user.phone },
    ];
    if (patient.caregiver) {
      targets.push({
        userId: patient.caregiver.id,
        email: patient.caregiver.email,
        phone: patient.caregiver.phone,
      });
    }
    res.json({ targets });
  } catch (e) { next(e); }
});

router.post("/me/caregiver", requireAuth, requireRole("PATIENT"),
  validate(linkCaregiverSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const caregiver = await prisma.user.findUnique({
        where: { email: req.body.caregiverEmail },
      });
      if (!caregiver) throw new AppError(404, "No user found with that email");

      await prisma.patient.update({
        where: { userId: req.user!.userId },
        data: { caregiverUserId: caregiver.id },
      });
      res.json({ message: "Caregiver linked", caregiverId: caregiver.id });
    } catch (e) { next(e); }
  });

export default router;