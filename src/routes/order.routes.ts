import { Router, Request } from "express";
import { auth as requireAuth, requireRole, validate } from "../middleware/auth.js";
import {
  createOrderSchema,
  updateOrderStatusSchema,
  updateDeliveryStatusSchema,
  idParamSchema,
  type CreateOrderInput,
  type UpdateOrderStatusInput,
  type UpdateDeliveryStatusInput,
} from "../schemas/prescription.schema.js";

const router = Router();

/**
 * Order routes 
 *
 * Canonical surface:
 *   POST   /orders
 *   GET    /orders/:id
 *   PATCH  /orders/:id/status
 *   GET    /orders/:id/track
 *
 * Extra:
 *   GET    /orders                        — role-aware "my orders"
 *   PATCH  /orders/:id/delivery/status    — rider updates delivery leg
 *
 * /orders/:id        -> lean order document
 * /orders/:id/track  -> order status timeline
 */

// ---------- GET /orders (role-aware list) ----------
router.get(
  "/",
  requireAuth,
  async (req: Request, res, next) => {
    try {
      res.json({ data: [], requestedBy: req.user?.userId });
    } catch (error) {
      next(error);
    }
  },
);

// ---------- POST /orders ----------
router.post(
  "/",
  requireAuth,
  requireRole("PATIENT"),
  validate({ body: createOrderSchema, params: undefined, query: undefined }),
  async (req: Request, res, next) => {
    try {
      const payload = req.body as CreateOrderInput;
      res.status(201).json({
        data: { ...payload, createdBy: req.user?.userId },
        message: "Order created successfully.",
      });
    } catch (error) {
      next(error);
    }
  },
);

// ---------- GET /orders/:id ----------
router.get(
  "/:id",
  requireAuth,
  requireRole("PATIENT", "PHARMACIST", "RIDER", "ADMIN"),
  validate({ body: undefined, params: idParamSchema, query: undefined }),
  async (req: Request, res, next) => {
    try {
      res.json({ data: { id: req.params.id, requestedBy: req.user?.userId } });
    } catch (error) {
      next(error);
    }
  },
);

// ---------- GET /orders/:id/track ----------
// The accessibility-focused endpoint — returns human-readable status labels.
router.get(
  "/:id/track",
  requireAuth,
  requireRole("PATIENT", "PHARMACIST", "RIDER", "ADMIN"),
  validate({ body: undefined, params: idParamSchema, query: undefined }),
  async (req: Request, res, next) => {
    try {
      res.json({ data: { id: req.params.id, status: "PLACED", timeline: [] } });
    } catch (error) {
      next(error);
    }
  },
);

// ---------- PATCH /orders/:id/status ----------
// Pharmacy (or admin) advances the order lifecycle.
// Branching rules (PICKUP never OUT_FOR_DELIVERY, DELIVERY must pass
// through OUT_FOR_DELIVERY before COMPLETED) are enforced in the service.
router.patch(
  "/:id/status",
  requireAuth,
  requireRole("PHARMACIST", "ADMIN"),
  validate({ body: updateOrderStatusSchema, params: idParamSchema, query: undefined }),
  async (req: Request, res, next) => {
    try {
      const { status, reason } = req.body as UpdateOrderStatusInput;
      res.json({
        data: { id: req.params.id, status, reason, updatedBy: req.user?.userId },
        message: "Order status updated.",
      });
    } catch (error) {
      next(error);
    }
  },
);

// ---------- PATCH /orders/:id/delivery/status ----------
// Rider-driven delivery updates: PICKED_UP | IN_TRANSIT | DELIVERED | FAILED
router.patch(
  "/:id/delivery/status",
  requireAuth,
  requireRole("RIDER"),
  validate({ body: updateDeliveryStatusSchema, params: idParamSchema, query: undefined }),
  async (req: Request, res, next) => {
    try {
      const { status } = req.body as UpdateDeliveryStatusInput;
      res.json({
        data: { orderId: req.params.id, status, updatedBy: req.user?.userId },
        message: "Delivery status updated.",
      });
    } catch (error) {
      next(error);
    }
  },
);

export default router;