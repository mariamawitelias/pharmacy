import { prisma } from "../lib/prisma.ts";
import { AppError } from "../lib/errors.ts";
import { notifyPrescriptionUpdated } from "./notificationService.ts";

import type { PrescriptionStatus, Role } from "@prisma/client";
import type {
  CreatePrescriptionInput,
  UpdatePrescriptionStatusInput,
} from "../schemas/prescription.schema.ts";

const PRESCRIPTION_TRANSITIONS: Record<PrescriptionStatus, PrescriptionStatus[]> = {
  PENDING: ["SENT", "CANCELLED"],
  SENT: ["CONFIRMED", "REJECTED", "CANCELLED"],
  CONFIRMED: ["READY", "CANCELLED"],
  READY: [],
  REJECTED: [],
  CANCELLED: [],
};

function assertPrescriptionTransition(
  current: PrescriptionStatus,
  next: PrescriptionStatus
) {
  if (!PRESCRIPTION_TRANSITIONS[current].includes(next)) {
    throw new AppError(409, `Prescription cannot move from ${current} to ${next}`);
  }
}

const PRESCRIPTION_STATUS_ACTION: Record<PrescriptionStatus, string> = {
  PENDING: "",
  SENT: "send",
  CONFIRMED: "accept",
  REJECTED: "reject",
  READY: "ready",
  CANCELLED: "cancel",
};

function prescriptionStatusLabel(status: PrescriptionStatus) {
  return status[0] + status.slice(1).toLowerCase();
}

/* ============================================================
 * Shared Prisma include shapes
 * ============================================================
 * Centralized so every read returns the same graph. If we ever
 * add a field to what a prescription "looks like" on the wire,
 * this is the one place to change.
 */

const PRESCRIPTION_FULL_INCLUDE = {
  items: { include: { medicine: true } },
  doctor: { include: { user: true } },
  patient: { include: { user: true } },
  pharmacy: true,
  order: true,
} as const;

/* ============================================================
 * Internal helpers
 * ============================================================ */

/**
 * Resolves the Doctor sub-record for a User, or throws if the
 * user is not a doctor. Every doctor-facing method calls this.
 */
async function getDoctorForUser(userId: string) {
  const doctor = await prisma.doctor.findUnique({ where: { userId } });
  if (!doctor) throw new AppError(403, "Only doctors can perform this action");
  return doctor;
}

/**
 * Resolves the Pharmacy linked to a User. Used by every
 * pharmacist-facing method. Exported because order.service.ts
 * needs the same lookup.
 */
export async function getPharmacyForUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { pharmacy: true },
  });
  if (!user?.pharmacy) {
    throw new AppError(403, "No pharmacy linked to this account");
  }
  return user.pharmacy;
}

/**
 * Loads a prescription by id with the full include graph, or null.
 * All reads in this file go through here so they stay consistent.
 */
function loadPrescription(id: string) {
  return prisma.prescription.findUnique({
    where: { id },
    include: PRESCRIPTION_FULL_INCLUDE,
  });
}

/* ============================================================
 * 1. Create
 * ============================================================ */

/**
 * POST /prescriptions
 * Doctor issues a new prescription. Starts in PENDING.
 * The patient must already be on the doctor's panel
 * (DoctorPatient link) — that's the authorization rule.
 */
export async function createPrescription(
  doctorUserId: string,
  payload: CreatePrescriptionInput
) {
  const doctor = await getDoctorForUser(doctorUserId);

  // Doctor may only prescribe to their own panel
  const link = await prisma.doctorPatient.findUnique({
    where: {
      doctorId_patientId: {
        doctorId: doctor.id,
        patientId: payload.patientId,
      },
    },
  });
  if (!link) throw new AppError(403, "Patient is not on your panel");

  // All referenced medicines must exist (Person 1's catalog)
  const medicineIds = payload.items.map((i) => i.medicineId);
  const found = await prisma.medicine.findMany({
    where: { id: { in: medicineIds } },
    select: { id: true },
  });
  if (found.length !== medicineIds.length) {
    throw new AppError(400, "One or more medicines do not exist");
  }

  return prisma.prescription.create({
    data: {
      doctorId: doctor.id,
      patientId: payload.patientId,
      pharmacyId: payload.pharmacyId ?? null,
      notes: payload.notes,
      status: "PENDING",
      items: {
        create: payload.items.map((i) => ({
          medicineId: i.medicineId,
          dosage: i.dosage,
          frequency: i.frequency,
          duration: i.duration,
          quantity: i.quantity,
          instructions: i.instructions,
        })),
      },
    },
    include: PRESCRIPTION_FULL_INCLUDE,
  });
}

/* ============================================================
 * 2. Doctor sends to a pharmacy
 * ============================================================ */

/**
 * PENDING → SENT.
 * Doctor routes the prescription to a specific pharmacy.
 * The pharmacy must be verified.
 */
export async function sendToPharmacy(
  doctorUserId: string,
  prescriptionId: string,
  pharmacyId: string
) {
  const doctor = await getDoctorForUser(doctorUserId);

  const rx = await loadPrescription(prescriptionId);
  if (!rx) throw new AppError(404, "Prescription not found");
  if (rx.doctorId !== doctor.id) {
    throw new AppError(403, "Not your prescription");
  }

  const pharmacy = await prisma.pharmacy.findUnique({
    where: { id: pharmacyId },
  });
  if (!pharmacy) throw new AppError(404, "Pharmacy not found");
  if (!pharmacy.isVerified) {
    throw new AppError(400, "Pharmacy is not verified");
  }

  assertPrescriptionTransition(rx.status, "SENT");

  const updated = await prisma.prescription.update({
    where: { id: prescriptionId },
    data: {
      status: "SENT",
      pharmacyId,
      sentAt: new Date(),
    },
    include: PRESCRIPTION_FULL_INCLUDE,
  });

  await notifyPrescriptionUpdated({
    patientUserId: updated.patient.id,
    prescriptionId: updated.id,
    prescriptionStatusLabel: prescriptionStatusLabel(updated.status),
  });
  return updated;
}

/* ============================================================
 * 3. Pharmacy accept / reject
 * ============================================================ */

/**
 * SENT → CONFIRMED.
 * Pharmacy verifies stock for every item. If any item is short,
 * the prescription is rejected with a reason listing what's
 * missing, so the doctor can pick a different pharmacy.
 */
export async function acceptPrescription(
  pharmacistUserId: string,
  prescriptionId: string
) {
  const pharmacy = await getPharmacyForUser(pharmacistUserId);

  const rx = await loadPrescription(prescriptionId);
  if (!rx) throw new AppError(404, "Prescription not found");
  if (rx.pharmacyId !== pharmacy.id) {
    throw new AppError(403, "Not your pharmacy");
  }

  assertPrescriptionTransition(rx.status, "CONFIRMED");

  // Check stock for every item (Person 1's Inventory)
  const stockChecks = await Promise.all(
    rx.items.map((item) =>
      prisma.inventory.findUnique({
        where: {
          pharmacyId_medicineId: {
            pharmacyId: pharmacy.id,
            medicineId: item.medicineId,
          },
        },
      })
    )
  );

  const missing = rx.items.filter((item, i) => {
    const stock = stockChecks[i];
    return !stock || stock.quantity < item.quantity;
  });

  if (missing.length > 0) {
    // Delegate to rejection so the notification path stays uniform
    return rejectPrescription(
      pharmacistUserId,
      prescriptionId,
      `Out of stock: ${missing.map((i) => i.medicine.name).join(", ")}`
    );
  }

  const updated = await prisma.prescription.update({
    where: { id: prescriptionId },
    data: {
      status: "CONFIRMED",
      confirmedAt: new Date(),
    },
    include: PRESCRIPTION_FULL_INCLUDE,
  });

  await notifyPrescriptionUpdated({
    patientUserId: updated.patient.id,
    prescriptionId: updated.id,
    prescriptionStatusLabel: prescriptionStatusLabel(updated.status),
  });
  return updated;
}

/**
 * SENT → REJECTED.
 * Terminal state. Doctor must create a new prescription if they
 * want to try a different pharmacy.
 */
export async function rejectPrescription(
  pharmacistUserId: string,
  prescriptionId: string,
  reason: string
) {
  const pharmacy = await getPharmacyForUser(pharmacistUserId);

  const rx = await loadPrescription(prescriptionId);
  if (!rx) throw new AppError(404, "Prescription not found");
  if (rx.pharmacyId !== pharmacy.id) {
    throw new AppError(403, "Not your pharmacy");
  }

  assertPrescriptionTransition(rx.status, "REJECTED");

  const updated = await prisma.prescription.update({
    where: { id: prescriptionId },
    data: {
      status: "REJECTED",
      rejectionReason: reason,
    },
    include: PRESCRIPTION_FULL_INCLUDE,
  });

  await notifyPrescriptionUpdated({
    patientUserId: updated.patient.id,
    prescriptionId: updated.id,
    prescriptionStatusLabel: prescriptionStatusLabel(updated.status),
  });
  return updated;
}

/* ============================================================
 * 4. Pharmacy marks ready
 * ============================================================ */

/**
 * CONFIRMED → READY.
 * Signals the patient that the medicine is prepared and can be
 * picked up (or handed to a rider).
 */
export async function markReady(
  pharmacistUserId: string,
  prescriptionId: string
) {
  const pharmacy = await getPharmacyForUser(pharmacistUserId);

  const rx = await loadPrescription(prescriptionId);
  if (!rx) throw new AppError(404, "Prescription not found");
  if (rx.pharmacyId !== pharmacy.id) {
    throw new AppError(403, "Not your pharmacy");
  }

  assertPrescriptionTransition(rx.status, "READY");

  const updated = await prisma.prescription.update({
    where: { id: prescriptionId },
    data: {
      status: "READY",
      readyAt: new Date(),
    },
    include: PRESCRIPTION_FULL_INCLUDE,
  });

  await notifyPrescriptionUpdated({
    patientUserId: updated.patient.id,
    prescriptionId: updated.id,
    prescriptionStatusLabel: prescriptionStatusLabel(updated.status),
  });
  return updated;
}

/* ============================================================
 * 5. Cancel
 * ============================================================ */

/**
 * Any pre-CONFIRMED state → CANCELLED.
 * Both the owning doctor and the subject patient may cancel.
 * Reason is required (enforced by Zod, passed through here).
 */
export async function cancelPrescription(
  userId: string,
  prescriptionId: string,
  reason: string
) {
  const rx = await loadPrescription(prescriptionId);
  if (!rx) throw new AppError(404, "Prescription not found");

  const patient = await prisma.patient.findUnique({ where: { userId } });
  const doctor = await prisma.doctor.findUnique({ where: { userId } });

  const isOwningDoctor = doctor && rx.doctorId === doctor.id;
  const isOwningPatient = patient && rx.patientId === patient.id;

  if (!isOwningDoctor && !isOwningPatient) {
    throw new AppError(403, "Not allowed to cancel this prescription");
  }

  assertPrescriptionTransition(rx.status, "CANCELLED");

  const updated = await prisma.prescription.update({
    where: { id: prescriptionId },
    data: {
      status: "CANCELLED",
      // Reuse rejectionReason as the cancellation reason
      rejectionReason: reason,
    },
    include: PRESCRIPTION_FULL_INCLUDE,
  });

  await notifyPrescriptionUpdated({
    patientUserId: updated.patient.id,
    prescriptionId: updated.id,
    prescriptionStatusLabel: prescriptionStatusLabel(updated.status),
  });
  return updated;
}

/* ============================================================
 * 6. Reads
 * ============================================================ */

/**
 * GET /prescriptions/:id
 * RBAC + ownership check per role. Admins see everything.
 */
export async function getPrescription(
  userId: string,
  role: Role,
  prescriptionId: string
) {
  const rx = await loadPrescription(prescriptionId);
  if (!rx) throw new AppError(404, "Prescription not found");

  if (role === "ADMIN") return rx;

  if (role === "DOCTOR") {
    const doctor = await prisma.doctor.findUnique({ where: { userId } });
    if (!doctor || rx.doctorId !== doctor.id) {
      throw new AppError(403, "Not your prescription");
    }
    return rx;
  }

  if (role === "PATIENT") {
    const patient = await prisma.patient.findUnique({ where: { userId } });
    if (!patient || rx.patientId !== patient.id) {
      throw new AppError(403, "Not your prescription");
    }
    return rx;
  }

  if (role === "PHARMACIST") {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { pharmacy: true },
    });
    if (!user?.pharmacy || rx.pharmacyId !== user.pharmacy.id) {
      throw new AppError(403, "Not your prescription");
    }
    return rx;
  }

  throw new AppError(403, "Forbidden");
}

/**
 * GET /patients/:id/prescriptions
 * A doctor sees only the prescriptions *they* wrote for the patient.
 * The patient sees their own. Admin sees all.
 */
export async function listPatientPrescriptions(
  requestingUserId: string,
  role: Role,
  patientId: string
) {
  if (role === "ADMIN") {
    return prisma.prescription.findMany({
      where: { patientId },
      orderBy: { createdAt: "desc" },
      include: {
        items: { include: { medicine: true } },
        doctor: { include: { user: true } },
      },
    });
  }

  if (role === "PATIENT") {
    const patient = await prisma.patient.findUnique({
      where: { userId: requestingUserId },
    });
    if (!patient || patient.id !== patientId) {
      throw new AppError(403, "Not your prescriptions");
    }

    return prisma.prescription.findMany({
      where: { patientId },
      orderBy: { createdAt: "desc" },
      include: {
        items: { include: { medicine: true } },
        doctor: { include: { user: true } },
      },
    });
  }

  if (role === "DOCTOR") {
    const doctor = await prisma.doctor.findUnique({
      where: { userId: requestingUserId },
    });
    if (!doctor) throw new AppError(403, "Not a doctor");

    // Patient must be on this doctor's panel
    const link = await prisma.doctorPatient.findUnique({
      where: { doctorId_patientId: { doctorId: doctor.id, patientId } },
    });
    if (!link) throw new AppError(403, "Patient is not on your panel");

    return prisma.prescription.findMany({
      where: { patientId, doctorId: doctor.id },
      orderBy: { createdAt: "desc" },
      include: { items: { include: { medicine: true } } },
    });
  }

  throw new AppError(403, "Forbidden");
}

/* ============================================================
 * 7. Dispatcher for PATCH /prescriptions/:id/status
 * ============================================================ */

/**
 * Maps a target status to the same semantic function the
 * convenience endpoints use. Single source of truth for the
 * transition rules — no divergence possible.
 */
export async function changeStatus(
  userId: string,
  role: Role,
  prescriptionId: string,
  payload: UpdatePrescriptionStatusInput
) {
  const action = PRESCRIPTION_STATUS_ACTION[payload.status];

  switch (action) {
    case "send":
      if (role !== "DOCTOR") throw new AppError(403, "Only doctors can send");
      // pharmacyId presence already enforced by Zod; non-null assertion is safe
      return sendToPharmacy(userId, prescriptionId, payload.pharmacyId!);

    case "accept":
      if (role !== "PHARMACIST") {
        throw new AppError(403, "Only pharmacists can accept");
      }
      return acceptPrescription(userId, prescriptionId);

    case "reject":
      if (role !== "PHARMACIST") {
        throw new AppError(403, "Only pharmacists can reject");
      }
      return rejectPrescription(userId, prescriptionId, payload.reason!);

    case "ready":
      if (role !== "PHARMACIST") {
        throw new AppError(403, "Only pharmacists can mark ready");
      }
      return markReady(userId, prescriptionId);

    case "cancel":
      // Doctor or patient — service checks ownership internally
      return cancelPrescription(userId, prescriptionId, payload.reason!);

    default:
      throw new AppError(400, `Unsupported target status: ${payload.status}`);
  }
}