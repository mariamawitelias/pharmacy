// =============================================================
// Person 3 — statusLabels.js
// Maps internal enum values to plain-language labels for the
// frontend. Accessibility-first: elderly users should never see
// raw DB enums. Keep wording simple and friendly.
// =============================================================

const QUESTION_STATUS_LABELS = {
  OPEN: 'Waiting for a pharmacist',
  CLAIMED: 'A pharmacist is reviewing your question',
  ANSWERED: 'Answered — see reply below',
  CLOSED: 'Closed',
};

const NOTIFICATION_TYPE_LABELS = {
  QUESTION_ANSWERED: 'Your question has been answered',
  PRESCRIPTION_UPDATED: 'Prescription update',
  ORDER_UPDATED: 'Order update',
  SYSTEM: 'Message from Medireach',
};

const NOTIFICATION_CHANNEL_LABELS = {
  IN_APP: 'In-app message',
  SMS: 'Text message',
  EMAIL: 'Email',
};

function labelQuestionStatus(status) {
  return QUESTION_STATUS_LABELS[status] || status;
}

function labelNotificationType(type) {
  return NOTIFICATION_TYPE_LABELS[type] || type;
}

function labelNotificationChannel(channel) {
  return NOTIFICATION_CHANNEL_LABELS[channel] || channel;
}

function mapQuestion(q) {
  if (!q) return q;
  return {
    ...q,
    status: labelQuestionStatus(q.status),
    statusKey: q.status,
  };
}

function mapNotification(n) {
  if (!n) return n;
  return {
    ...n,
    type: labelNotificationType(n.type),
    typeKey: n.type,
    channel: labelNotificationChannel(n.channel),
    channelKey: n.channel,
  };
}

module.exports = {
  QUESTION_STATUS_LABELS,
  NOTIFICATION_TYPE_LABELS,
  NOTIFICATION_CHANNEL_LABELS,
  labelQuestionStatus,
  labelNotificationType,
  labelNotificationChannel,
  mapQuestion,
  mapNotification,
};
