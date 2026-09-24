import { prisma } from "../lib/prisma.ts";
import { AppError } from "../lib/errors.ts";
import { notifyOrderUpdated } from "./notificationService.ts";

import type { Role, OrderStatus, DeliveryStatus } from "@prisma/client";
import type { CreateOrderInput } from "../schemas/prescription.schema.ts";

const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PLACED: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PREPARING", "CANCELLED"],
  PREPARING: ["READY", "CANCELLED"],
  READY: ["OUT_FOR_DELIVERY", "COMPLETED", "CANCELLED"],
  OUT_FOR_DELIVERY: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

function assertOrderTransition(current: OrderStatus, next: OrderStatus) {
  if (!ORDER_TRANSITIONS[current].includes(next)) {
    throw new AppError(409, `Order cannot move from ${current} to ${next}`);
  }
}

function orderStatusLabel(status: OrderStatus) {
  return status
    .toLowerCase()
    .split("_")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

/* ============================================================
 * Shared Prisma include shapes
 * ============================================================
 * Centralized so every read returns the same graph. The
 * presenter and notification service both rely on this shape.
 */

const ORDER_FULL_INCLUDE = {
  items: { include: { medicine: true } },
  prescription: true,
  pharmacy: true,
  patient: { include: { user: true } },
  delivery: { include: { rider: true } },
} as const;

/* ============================================================
 * Rider assignment
 * ============================================================
 * Simplest possible policy: first rider (by createdAt) with no
 * active delivery. A rider is "active" if they have a Delivery
 * in ASSIGNED, PICKED_UP, or IN_TRANSIT.
 *
 * Accepts an optional `tx` so it can be called inside a
 * prisma.$transaction block without opening a new connection.
 */

type PrismaTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export async function findAvailableRider(tx: PrismaTx | typeof prisma = prisma) {
  const riders = await tx.user.findMany({
    where: { role: "RIDER" },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  for (const rider of riders) {
    const active = await tx.delivery.findFirst({
      where: {
        riderId: rider.id,
        status: { in: ["ASSIGNED", "PICKED_UP", "IN_TRANSIT"] },
      },
    });
    if (!active) return rider;
  }

  return null; // no free rider — delivery stays unassigned
}

/* ============================================================
 * Internal helpers
 * ============================================================ */

function loadOrder(id: string, tx: PrismaTx | typeof prisma = prisma) {
  return tx.order.findUnique({
    where: { id },
    include: ORDER_FULL_INCLUDE,
  });
}

/* ============================================================
 * 1. Create
 * ============================================================
 * POST /orders
 *
 * Patient places an order from a CONFIRMED prescription. Three
 * steps happen inside one transaction so a failure at any step
 * rolls back the entire order — no half-decremented inventory,
 * no orphan delivery row.
 *
 *   a) Decrement stock for every item
 *   b) Create the Order + OrderItems (prices snapshotted from
 *      current Inventory so later price changes don't rewrite
 *      the order)
 *   c) If fulfillment = DELIVERY, assign a rider and create a
 *      Delivery row (rider may be null if none free)
 *
 * Response includes the full include graph for the presenter.
 */

export async function createOrder(
  patientUserId: string,
  payload: CreateOrderInput
) {
  const patient = await prisma.patient.findUnique({
    where: { userId: patientUserId },
  });
  if (!patient) throw new AppError(403, "Only patients can place orders");

  const rx = await prisma.prescription.findUnique({
    where: { id: payload.prescriptionId },
    include: {
      items: { include: { medicine: true } },
      order: true,
    },
  });
  if (!rx) throw new AppError(404, "Prescription not found");
  if (rx.patientId !== patient.id) {
    throw new AppError(403, "Not your prescription");
  }
  if (rx.status !== "CONFIRMED") {
    throw new AppError(
      409,
      `Prescription must be CONFIRMED, currently ${rx.status}`
    );
  }
  if (rx.order) throw new AppError(409, "Order already exists for this prescription");
  if (!rx.pharmacyId) throw new AppError(409, "Prescription has no pharmacy assigned");

  const pharmacyId = rx.pharmacyId;

  // Build OrderItem payloads and compute total from current stock
  const itemsData: Array<{
    medicineId: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
  }> = [];
  let total = 0;

  for (const item of rx.items) {
    const stock = await prisma.inventory.findUnique({
      where: {
        pharmacyId_medicineId: {
          pharmacyId,
          medicineId: item.medicineId,
        },
      },
    });
    if (!stock || stock.quantity < item.quantity) {
      throw new AppError(409, `Insufficient stock for ${item.medicine.name}`);
    }
    const unitPrice = stock.price;
    const subtotal = unitPrice * item.quantity;
    total += subtotal;
    itemsData.push({
      medicineId: item.medicineId,
      quantity: item.quantity,
      unitPrice,
      subtotal,
    });
  }

  const created = await prisma.$transaction(async (tx) => {
    // (a) Decrement stock for every item. If any update fails, the transaction rolls back.
    
    for (const item of rx.items) {
      const result = await tx.inventory.updateMany({
        where: {
          pharmacyId,
          medicineId: item.medicineId,
          quantity: { gte: item.quantity },
        },
        data: { quantity: { decrement: item.quantity } },
      });
      if (result.count === 0) {
        throw new AppError(
          409,
          `Stock for ${item.medicine.name} changed while placing the order`
        );
      }
    }

    // (b) Create order + items
    const order = await tx.order.create({
      data: {
        prescriptionId: rx.id,
        patientId: patient.id,
        pharmacyId,
        fulfillment: payload.fulfillment,
        status: "PLACED",
        totalAmount: total,
        items: { create: itemsData },
      },
    });

    // (c) Delivery branching
    if (payload.fulfillment === "DELIVERY") {
      const rider = await findAvailableRider(tx);
      await tx.delivery.create({
        data: {
          orderId: order.id,
          riderId: rider?.id ?? null,
          status: "ASSIGNED",
          address: payload.deliveryAddress!,
          lat: payload.deliveryLat,
          lng: payload.deliveryLng,
        },
      });
    }

    return order;
  });

  const full = await loadOrder(created.id);
  if (!full) throw new AppError(500, "Order created but could not be loaded");

  await notifyOrderUpdated({
    patientUserId: full.patient.id,
    orderId: full.id,
    orderStatusLabel: orderStatusLabel(full.status),
  });
  return full;
}

/* ============================================================
 * 2. Advance order status (pharmacy or admin)
 * ============================================================
 * PATCH /orders/:id/status
 *
 * Enforces:
 *   - state machine transitions (assertOrderTransition)
 *   - fulfillment branching:
 *       PICKUP  : never OUT_FOR_DELIVERY
 *       DELIVERY: must pass through OUT_FOR_DELIVERY before COMPLETED
 *   - syncs the Delivery row when the order leaves the pharmacy
 *     or is completed
 */

export async function updateOrderStatus(
  actorId: string,
  role: Role,
  orderId: string,
  newStatus: OrderStatus,
  reason?: string
) {
  const order = await loadOrder(orderId);
  if (!order) throw new AppError(404, "Order not found");

  // Ownership check: pharmacist must own the pharmacy; admin bypasses.
  if (role === "PHARMACIST") {
    const user = await prisma.user.findUnique({
      where: { id: actorId },
      include: { pharmacy: true },
    });
    if (!user?.pharmacy) {
      throw new AppError(403, "No pharmacy linked to this account");
    }
    if (order.pharmacyId !== user.pharmacy.id) {
      throw new AppError(403, "Not your order");
    }
  } else if (role !== "ADMIN") {
    throw new AppError(403, "Forbidden");
  }

  // State machine
  assertOrderTransition(order.status, newStatus);

  // Fulfillment branching rules
  if (newStatus === "OUT_FOR_DELIVERY" && order.fulfillment === "PICKUP") {
    throw new AppError(409, "Pickup orders do not go out for delivery");
  }
  if (
    newStatus === "COMPLETED" &&
    order.fulfillment === "DELIVERY" &&
    order.status !== "OUT_FOR_DELIVERY"
  ) {
    throw new AppError(
      409,
      "Delivery orders must be OUT_FOR_DELIVERY before completion"
    );
  }

  // Build the update patch + timestamps
  const now = new Date();
  const patch: Record<string, unknown> = { status: newStatus };
  if (newStatus === "CONFIRMED") patch.confirmedAt = now;
  if (newStatus === "READY") patch.readyAt = now;
  if (newStatus === "OUT_FOR_DELIVERY") patch.dispatchedAt = now;
  if (newStatus === "COMPLETED") patch.completedAt = now;
  if (newStatus === "CANCELLED") {
    patch.cancelledAt = now;
    patch.cancellationReason = reason;
  }

  await prisma.$transaction(async (tx) => {
    await tx.order.update({ where: { id: orderId }, data: patch });

    // Keep the Delivery row in sync with the order lifecycle.
    // Riders have their own endpoint for granular updates; this
    // is the safety net for when the pharmacy drives the change.
    if (order.fulfillment === "DELIVERY") {
      if (newStatus === "OUT_FOR_DELIVERY") {
        await tx.delivery.update({
          where: { orderId },
          data: { status: "IN_TRANSIT", pickedUpAt: now },
        });
      }
      if (newStatus === "COMPLETED") {
        await tx.delivery.update({
          where: { orderId },
          data: { status: "DELIVERED", deliveredAt: now },
        });
      }
    }
  });

  const updated = await loadOrder(orderId);
  if (!updated) throw new AppError(500, "Order updated but could not be loaded");

  await notifyOrderUpdated({
    patientUserId: updated.patient.id,
    orderId: updated.id,
    orderStatusLabel: orderStatusLabel(updated.status),
  });
  return updated;
}

/* ============================================================
 * 3. Rider delivery updates
 * ============================================================
 * PATCH /orders/:id/delivery/status
 *
 * Rider-only. Allowed values: PICKED_UP | IN_TRANSIT | DELIVERED | FAILED.
 * When DELIVERED, the parent order is automatically completed
 * (this is the only place order status changes as a side effect).
 */

export async function updateDeliveryStatus(
  riderUserId: string,
  orderId: string,
  newStatus: DeliveryStatus
) {
  const delivery = await prisma.delivery.findUnique({ where: { orderId } });
  if (!delivery) throw new AppError(404, "Delivery not found");
  if (delivery.riderId !== riderUserId) {
    throw new AppError(403, "Not your delivery");
  }

  const allowed: DeliveryStatus[] = ["PICKED_UP", "IN_TRANSIT", "DELIVERED", "FAILED"];
  if (!allowed.includes(newStatus)) {
    throw new AppError(400, "Invalid delivery status");
  }

  const now = new Date();
  const patch: Record<string, unknown> = { status: newStatus };
  if (newStatus === "PICKED_UP") patch.pickedUpAt = now;
  if (newStatus === "DELIVERED") patch.deliveredAt = now;

  await prisma.$transaction(async (tx) => {
    await tx.delivery.update({ where: { orderId }, data: patch });

    if (newStatus === "DELIVERED") {
      await tx.order.update({
        where: { id: orderId },
        data: { status: "COMPLETED", completedAt: now },
      });
    }
  });

  const updated = await loadOrder(orderId);
  if (!updated) throw new AppError(500, "Order updated but could not be loaded");

  // Notify on transitions that matter to the patient
  if (newStatus === "DELIVERED" || newStatus === "FAILED" || newStatus === "PICKED_UP") {
    await notifyOrderUpdated({
      patientUserId: updated.patient.id,
      orderId: updated.id,
      orderStatusLabel: orderStatusLabel(updated.status),
    });
  }
  return updated;
}

/* ============================================================
 * 4. Reads
 * ============================================================ */

/**
 * RBAC + ownership check per role. Shared by getOrder and
 * trackOrder so the access rules are defined once.
 */
export async function getOrder(
  orderId: string,
  requestingUserId: string,
  role: Role
) {
  const order = await loadOrder(orderId);
  if (!order) throw new AppError(404, "Order not found");

  if (role === "PATIENT") {
    const patient = await prisma.patient.findUnique({
      where: { userId: requestingUserId },
    });
    if (order.patientId !== patient?.id) {
      throw new AppError(403, "Not your order");
    }
  } else if (role === "PHARMACIST") {
    const user = await prisma.user.findUnique({
      where: { id: requestingUserId },
      include: { pharmacy: true },
    });
    if (order.pharmacyId !== user?.pharmacy?.id) {
      throw new AppError(403, "Not your order");
    }
  } else if (role === "RIDER") {
    if (order.delivery?.riderId !== requestingUserId) {
      throw new AppError(403, "Not your delivery");
    }
  } else if (role !== "ADMIN") {
    throw new AppError(403, "Forbidden");
  }

  return order;
}

/**
 * GET /orders/:id/track
 *
 * Returns a plain-language timeline for the patient. Pulls
 * `toPlainLanguage` from Person 3's status mapper so the API
 * never leaks raw enums like OUT_FOR_DELIVERY to the frontend.
 * Dynamic import keeps this file loadable even before the mapper
 * is wired up.
 */
export async function trackOrder(
  orderId: string,
  requestingUserId: string,
  role: Role
) {
  const order = await getOrder(orderId, requestingUserId, role);
  const toPlainLanguage = (status: string) =>
    status
      .toLowerCase()
      .split("_")
      .map((part) => part[0].toUpperCase() + part.slice(1))
      .join(" ");

  return {
    orderId: order.id,
    status: order.status,
    statusLabel: toPlainLanguage(order.status),
    fulfillment: order.fulfillment,
    fulfillmentLabel:
      order.fulfillment === "PICKUP"
        ? "Pick up at the pharmacy"
        : "Delivered to your address",
    pharmacy: order.pharmacy
      ? { id: order.pharmacy.id, name: order.pharmacy.name }
      : null,
    items: order.items.map((i) => ({
      medicineId: i.medicineId,
      medicineName: i.medicine.name,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      subtotal: i.subtotal,
    })),
    totalAmount: order.totalAmount,
    delivery: order.delivery
      ? {
          status: order.delivery.status,
          statusLabel: toPlainLanguage(order.delivery.status),
          address: order.delivery.address,
          rider: order.delivery.rider
            ? { id: order.delivery.rider.id, name: order.delivery.rider.fullName }
            : null,
        }
      : null,
    timestamps: {
      placedAt: order.createdAt,
      confirmedAt: order.confirmedAt,
      readyAt: order.readyAt,
      dispatchedAt: order.dispatchedAt,
      completedAt: order.completedAt,
      cancelledAt: order.cancelledAt,
    },
    canCancel: ["PLACED", "CONFIRMED", "PREPARING"].includes(order.status),
  };
}