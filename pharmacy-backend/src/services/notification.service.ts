import type {
  NotificationType,
  NotificationChannel,
  Prisma,
} from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { NotificationType as NType, NotificationChannel as NChannel } from "@prisma/client";

export type NotifyInput = {
  userId: string;
  type: NotificationType;
  message: string;
  data?: Prisma.InputJsonValue;
  channel?: NotificationChannel;
};

const isValidType = (t: string): t is NotificationType =>
  Object.prototype.hasOwnProperty.call(NType, t);

const isValidChannel = (c: string): c is NotificationChannel =>
  Object.prototype.hasOwnProperty.call(NChannel, c);

/**
 * Single entry point for creating notifications.
 *
 * Person 2 (orders/prescriptions) and Person 3 (Q&A) both route their
 * notification creation through this function. It is the only place in
 * the codebase that calls prisma.notification.create, which makes it
 * easy to later plug in SMS delivery, email delivery, push, batching,
 * deduplication, or audit logging — those concerns go here and every
 * caller gets them for free.
 *
 * Prefer the typed helpers (notifyQuestionAnswered, notifyOrderUpdated,
 * etc.) over calling notify() directly. They enforce specific message
 * wording (important for accessibility) and keep data shapes consistent.
 */
export const notify = async ({
  userId,
  type,
  message,
  data,
  channel = NChannel.IN_APP,
}: NotifyInput) => {
  if (!userId || typeof userId !== "string") {
    throw new TypeError("notify: userId must be a non-empty string");
  }
  if (!isValidType(type)) {
    throw new TypeError(`notify: invalid type "${String(type)}"`);
  }
  if (!isValidChannel(channel)) {
    throw new TypeError(`notify: invalid channel "${String(channel)}"`);
  }
  if (typeof message !== "string" || message.trim().length === 0) {
    throw new TypeError("notify: message must be a non-empty string");
  }

  return prisma.notification.create({
    data: {
      userId,
      type,
      message: message.trim(),
      data: data ?? undefined,
      channel,
    },
  });
};

/* ---------------- Person 3 owned helpers ---------------- */

/**
 * Notify the patient that a pharmacist replied to their question.
 * Written in short, plain sentences for elderly patient accessibility.
 */
export const notifyQuestionAnswered = async (args: {
  patientUserId: string;
  questionId: string;
  pharmacistName?: string;
}) => {
  const pharmacistText = args.pharmacistName
    ? ` by ${args.pharmacistName}`
    : "";
  return notify({
    userId: args.patientUserId,
    type: NType.QUESTION_ANSWERED,
    message: `Your question has been answered${pharmacistText}. Open the app to read the reply.`,
    channel: NChannel.IN_APP,
    data: { questionId: args.questionId },
  });
};

/* ---------------- Person 2 owned helpers (stubbed) ------- */

// Person 2: replace with real implementation when wiring orders.
// NOTE: pass the *plain-language* label produced by labelOrderStatus()
// (statusLabels.ts), never the raw enum — the spec forbids raw enums
// like OUT_FOR_DELIVERY reaching the frontend.
export const notifyOrderUpdated = async (args: {
  patientUserId: string;
  orderId: string;
  orderStatusLabel: string;
}) => {
  const tail =
    args.orderStatusLabel === "Cancelled"
      ? " Contact the pharmacy if this was not you."
      : args.orderStatusLabel === "Delivered"
        ? " We hope you are well!"
        : " We will send another update when it is on its way.";
  return notify({
    userId: args.patientUserId,
    type: NType.ORDER_UPDATED,
    message: `Your order is now: ${args.orderStatusLabel}.${tail}`,
    data: { orderId: args.orderId },
  });
};

// Person 2: replace with real implementation when wiring prescriptions.
export const notifyPrescriptionUpdated = async (args: {
  patientUserId: string;
  prescriptionId: string;
  prescriptionStatusLabel: string;
}) =>
  notify({
    userId: args.patientUserId,
    type: NType.PRESCRIPTION_UPDATED,
    message: `Your prescription is: ${args.prescriptionStatusLabel}. Call your pharmacy if you have questions.`,
    data: { prescriptionId: args.prescriptionId },
  });
