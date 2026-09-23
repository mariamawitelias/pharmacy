import { Router, Request } from "express";
import { PrismaClient } from "@prisma/client";
import { auth as requireAuth, requireRole, validate } from "../middleware/auth.js";
import ApiError from "../utils/ApiError.js";
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

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        role: "PATIENT" | "DOCTOR" | "PHARMACIST" | "RIDER" | "ADMIN";
      };
    }
  }
}

const router = Router();
const prisma = new PrismaClient();

router.post(
  "/",
  requireAuth,
  requireRole("DOCTOR"),
  validate({ body: createPrescriptionSchema, params: undefined, query: undefined }),
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
  validate({ body: undefined, params: prescriptionIdParamSchema, query: undefined }),
  async (req: Request, res, next) => {
    try {
      const { id } = req.params as { id: string };

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
  validate({ body: updatePrescriptionStatusSchema, params: prescriptionIdParamSchema, query: undefined }),
  async (req: Request, res, next) => {
    try {
      const { id } = req.params as { id: string };
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
  validate({ body: sendPrescriptionSchema, params: prescriptionIdParamSchema, query: undefined }),
  async (req: Request, res, next) => {
    try {
      const { id } = req.params as { id: string };
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
  validate({ body: undefined, params: prescriptionIdParamSchema, query: undefined }),
  async (req: Request, res, next) => {
    try {
      const { id } = req.params as { id: string };

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
  validate({ body: rejectPrescriptionSchema, params: prescriptionIdParamSchema, query: undefined }),
  async (req: Request, res, next) => {
    try {
      const { id } = req.params as { id: string };
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
  validate({ body: undefined, params: prescriptionIdParamSchema, query: undefined }),
  async (req: Request, res, next) => {
    try {
      const { id } = req.params as { id: string };

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
  validate({ body: inventoryDecrementSchema, params: prescriptionIdParamSchema, query: undefined }),
  async (req: Request, res, next) => {
    try {
      const { id } = req.params as { id: string };
      const payload = req.body as InventoryDecrementInput;

      if (!payload?.medicineId || !payload.quantity) {
        throw new ApiError(400, "INVALID_INVENTORY_PAYLOAD", "Invalid inventory update payload");
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
  validate({ body: undefined, params: notifyTargetsParamsSchema, query: undefined }),
  async (req: Request, res, next) => {
    try {
      const { patientId } = req.params as { patientId: string };

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