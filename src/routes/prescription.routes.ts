import { Router, Request } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { validate, validateParams } from "../middleware/validate.js";
import { AppError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import {
  createPrescriptionSchema,
  inventoryDecrementSchema,
  notifyTargetsParamsSchema,
  prescriptionIdParamSchema,
  rejectPrescriptionSchema,
  sendPrescriptionSchema,
  updatePrescriptionStatusSchema,
  type CreatePrescriptionInput,
  type InventoryDecrementInput,
} from "../schemas/prescription.schema.js";

const router = Router();

router.post(
  "/",
  requireAuth,
  requireRole("DOCTOR"),
  validate(createPrescriptionSchema),
  async (req: Request, res, next) => {
    try {
      const payload = req.body as CreatePrescriptionInput;
      const prescription = await prisma.prescription.create({
        data: {
          doctorId: req.user!.userId,
          patientId: payload.patientId,
          pharmacyId: payload.pharmacyId,
          notes: payload.notes,
          items: {
            create: payload.items,
          },
        },
      });

      res.status(201).json({
        data: {
          ...prescription,
          createdBy: req.user?.userId,
        },
        message: "Prescription created successfully.",
      });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/:id",
  requireAuth,
  requireRole("DOCTOR", "PATIENT", "PHARMACIST", "ADMIN"),
  validateParams(prescriptionIdParamSchema),
  async (req: Request, res, next) => {
    try {
      const { id } = req.validatedParams as { id: string };

      res.json({
        data: {
          id,
          requestedBy: req.user?.userId,
          role: req.user?.role,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

router.patch(
  "/:id/status",
  requireAuth,
  requireRole("DOCTOR", "PHARMACIST", "PATIENT", "ADMIN"),
  validateParams(prescriptionIdParamSchema),
  validate(updatePrescriptionStatusSchema),
  async (req: Request, res, next) => {
    try {
      const { id } = req.validatedParams as { id: string };
      const { status } = req.body as { status: string };

      res.json({
        data: {
          id,
          status,
          updatedBy: req.user?.userId,
        },
        message: "Prescription status updated.",
      });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/:id/send",
  requireAuth,
  requireRole("DOCTOR"),
  validateParams(prescriptionIdParamSchema),
  validate(sendPrescriptionSchema),
  async (req: Request, res, next) => {
    try {
      const { id } = req.validatedParams as { id: string };
      const payload = req.body as { pharmacyId: string; notes?: string };

      res.json({
        data: {
          id,
          ...payload,
          status: "SENT",
        },
        message: "Prescription sent.",
      });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/:id/accept",
  requireAuth,
  requireRole("PHARMACIST"),
  validateParams(prescriptionIdParamSchema),
  async (req: Request, res, next) => {
    try {
      const { id } = req.validatedParams as { id: string };

      res.json({
        data: {
          id,
          status: "CONFIRMED",
          acceptedBy: req.user?.userId,
        },
        message: "Prescription accepted.",
      });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/:id/reject",
  requireAuth,
  requireRole("PHARMACIST"),
  validateParams(prescriptionIdParamSchema),
  validate(rejectPrescriptionSchema),
  async (req: Request, res, next) => {
    try {
      const { id } = req.validatedParams as { id: string };
      const { reason } = req.body as { reason: string };

      res.json({
        data: {
          id,
          status: "REJECTED",
          reason,
          rejectedBy: req.user?.userId,
        },
        message: "Prescription rejected.",
      });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/:id/ready",
  requireAuth,
  requireRole("PHARMACIST"),
  validateParams(prescriptionIdParamSchema),
  async (req: Request, res, next) => {
    try {
      const { id } = req.validatedParams as { id: string };

      res.json({
        data: {
          id,
          status: "READY",
          readyBy: req.user?.userId,
        },
        message: "Prescription marked ready.",
      });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/pharmacies/:id/inventory/decrement",
  requireAuth,
  requireRole("PHARMACIST"),
  validateParams(prescriptionIdParamSchema),
  validate(inventoryDecrementSchema),
  async (req: Request, res, next) => {
    try {
      const { id } = req.validatedParams as { id: string };
      const payload = req.body as InventoryDecrementInput;

      if (!payload?.medicineId || !payload.quantity) {
        throw new AppError(400, "Invalid inventory update payload");
      }

      res.json({
        data: {
          pharmacyId: id,
          medicineId: payload.medicineId,
          quantity: payload.quantity,
          decrementedBy: req.user?.userId,
        },
        message: "Inventory decremented.",
      });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/users/:patientId/notify-targets",
  requireAuth,
  requireRole("DOCTOR", "PATIENT", "PHARMACIST", "ADMIN"),
  validateParams(notifyTargetsParamsSchema),
  async (req: Request, res, next) => {
    try {
      const { patientId } = req.validatedParams as { patientId: string };

      const targets = [
        {
          userId: patientId,
          email: "patient@example.com",
          phone: null,
        },
      ];

      res.json({
        data: {
          patientId,
          targets,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

export default router;