import type {
  QuestionStatus,
  NotificationType,
  NotificationChannel,
  Notification,
  Question,
  Answer,
  OrderStatus,
  PrescriptionStatus,
} from "@prisma/client";

export type MappedQuestionStatus = {
  statusKey: QuestionStatus;
  status: string;
};

export type MappedUserRef = {
  userId: string;
  fullName: string | null;
  email: string;
  phone: string | null;
};

export type MappedQuestion = Omit<
  Question,
  "patientId" | "medicineId" | "prescriptionId" | "claimedById" | "status"
> &
  MappedQuestionStatus & {
    patient: MappedUserRef;
    claimedBy: MappedUserRef | null;
    medicine: {
      medicineId: string;
      name: string;
      strength: string | null;
      form: string | null;
    } | null;
    prescriptionId: string | null;
    answer: MappedAnswer | null;
  };

export type MappedAnswer = Omit<Answer, "questionId" | "pharmacistId"> & {
  pharmacist: MappedUserRef;
};

export type MappedNotification = Omit<Notification, "userId" | "type" | "channel"> & {
  typeKey: NotificationType;
  type: string;
  channelKey: NotificationChannel;
  channel: string;
};

const QUESTION_STATUS_LABELS: Record<QuestionStatus, string> = {
  OPEN: "Waiting for a pharmacist",
  CLAIMED: "A pharmacist is reviewing your question",
  ANSWERED: "Pharmacist replied",
  CLOSED: "Conversation closed",
};

const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  QUESTION_ANSWERED: "Your question has been answered",
  PRESCRIPTION_UPDATED: "Your prescription was updated",
  ORDER_UPDATED: "Your order status changed",
  SYSTEM: "System message",
};

const NOTIFICATION_CHANNEL_LABELS: Record<NotificationChannel, string> = {
  IN_APP: "In-app message",
  SMS: "Text message",
  EMAIL: "Email",
};

// Person 3 core task: the API must never leak raw enums like
// OUT_FOR_DELIVERY to the frontend — always map through these.
const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PLACED: "We received your order",
  CONFIRMED: "Your order is confirmed",
  PREPARING: "The pharmacy is preparing your medicines",
  READY: "Your medicines are ready",
  OUT_FOR_DELIVERY: "Your medicine is on its way",
  COMPLETED: "Your order is delivered",
  CANCELLED: "Your order was cancelled",
};

const PRESCRIPTION_STATUS_LABELS: Record<PrescriptionStatus, string> = {
  PENDING: "Your prescription is being prepared",
  SENT: "Your prescription was sent to the pharmacy",
  CONFIRMED: "The pharmacy confirmed your prescription",
  READY: "Your medicines are ready for you",
  REJECTED: "The pharmacy could not fill this prescription — please call us",
  CANCELLED: "Your prescription was cancelled",
};

export const labelQuestionStatus = (s: QuestionStatus): string =>
  QUESTION_STATUS_LABELS[s] ?? s;

export const labelNotificationType = (t: NotificationType): string =>
  NOTIFICATION_TYPE_LABELS[t] ?? t;

export const labelNotificationChannel = (c: NotificationChannel): string =>
  NOTIFICATION_CHANNEL_LABELS[c] ?? c;

export const labelOrderStatus = (s: OrderStatus): string =>
  ORDER_STATUS_LABELS[s] ?? s;

export const labelPrescriptionStatus = (s: PrescriptionStatus): string =>
  PRESCRIPTION_STATUS_LABELS[s] ?? s;

type UserLike = {
  id: string;
  email: string;
  fullName?: string | null;
  phone?: string | null;
};

const toUserRef = (u: UserLike | null | undefined): MappedUserRef | null => {
  if (!u) return null;
  return {
    userId: u.id,
    fullName: u.fullName ?? null,
    email: u.email,
    phone: u.phone ?? null,
  };
};

type MedicineLike = {
  id: string;
  name: string;
  strength?: string | null;
  form?: string | null;
};

const toMedicineRef = (
  m: MedicineLike | null | undefined
): MappedQuestion["medicine"] => {
  if (!m) return null;
  return {
    medicineId: m.id,
    name: m.name,
    strength: m.strength ?? null,
    form: m.form ?? null,
  };
};

type AnswerWithPharmacist = Answer & {
  pharmacist: UserLike;
};

export const mapAnswer = (a: AnswerWithPharmacist): MappedAnswer => {
  const { questionId: _qid, pharmacistId: _pid, ...rest } = a;
  return {
    ...rest,
    pharmacist: toUserRef(a.pharmacist)!,
  };
};

type QuestionWithIncludes = Question & {
  patient: UserLike;
  claimedBy?: UserLike | null;
  medicine?: MedicineLike | null;
  answer?: AnswerWithPharmacist | null;
};

export const mapQuestion = (q: QuestionWithIncludes): MappedQuestion => {
  const {
    patientId: _pid,
    medicineId: _mid,
    claimedById: _cid,
    status,
    patient,
    claimedBy,
    medicine,
    answer,
    prescriptionId,
    ...rest
  } = q;
  return {
    ...rest,
    prescriptionId: prescriptionId ?? null,
    statusKey: status,
    status: labelQuestionStatus(status),
    patient: toUserRef(patient)!,
    claimedBy: toUserRef(claimedBy ?? null),
    medicine: toMedicineRef(medicine ?? null),
    answer: answer ? mapAnswer(answer as AnswerWithPharmacist) : null,
  };
};

export const mapNotification = (n: Notification): MappedNotification => {
  const { userId: _uid, type, channel, ...rest } = n;
  return {
    ...rest,
    typeKey: type,
    type: labelNotificationType(type),
    channelKey: channel,
    channel: labelNotificationChannel(channel),
  };
};
