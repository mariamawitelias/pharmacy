// =============================================================
// Person 3 — notificationService.js
//
// SINGLE ENTRY POINT: notify(payload)
// All other helpers (notifyQuestionAnswered, notifyOrderUpdated,
// notifyPrescriptionUpdated, etc.) MUST build their payload and
// then delegate to notify() — never call prisma directly.
// Person 2 depends on notify() being the single dispatch point
// so future channel expansion (SMS, email, webhooks) is centralized.
// =============================================================

const { PrismaClient, NotificationType, NotificationChannel } = require('@prisma/client');
const prisma = new PrismaClient();

async function notify({ userId, type, message, data = undefined, channel = NotificationChannel.IN_APP }) {
  if (!userId) throw new Error('notify() requires userId');
  if (!type) throw new Error('notify() requires type');
  if (!message || String(message).trim().length === 0) {
    throw new Error('notify() requires a non-empty message');
  }
  const notification = await prisma.notification.create({
    data: { userId, type, message, data, channel },
  });
  return notification;
}

async function notifyQuestionAnswered({ patientUserId, questionId, questionText }) {
  const shortText = questionText.length > 60 ? questionText.slice(0, 60) + '…' : questionText;
  return notify({
    userId: patientUserId,
    type: NotificationType.QUESTION_ANSWERED,
    message: `Your question "${shortText}" has been answered by a pharmacist.`,
    data: { questionId },
    channel: NotificationChannel.IN_APP,
  });
}

module.exports = {
  notify,
  notifyQuestionAnswered,
};
