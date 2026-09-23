import { Router, Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../lib/errors.js";
import { QuestionStatus, type Prisma } from "@prisma/client";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { validate, validateParams, validateQuery } from "../middleware/validate.js";
import {
  answerSchema,
  createQuestionSchema,
  listQuestionsQuerySchema,
  questionIdParamSchema,
  type AnswerInput,
  type CreateQuestionInput,
  type ListQuestionsQuery,
  type QuestionIdParam,
} from "../schemas/question.schema.js";
import {
  mapQuestion,
  type MappedQuestion,
} from "../utils/statusLabels.js";
import { notifyQuestionAnswered } from "../services/notification.service.js";

const router = Router();

const QUESTION_INCLUDES = {
  patient: { select: { id: true, email: true, fullName: true, phone: true } },
  claimedBy: {
    select: { id: true, email: true, fullName: true, phone: true },
  },
  medicine: {
    select: { id: true, name: true, strength: true, form: true },
  },
  answer: {
    include: {
      pharmacist: {
        select: { id: true, email: true, fullName: true, phone: true },
      },
    },
  },
} as const;

/* ------------------------------------------------------
 *  POST /questions — Patient submits a new question
 * ------------------------------------------------------ */
type CreateReq = Request<{}, unknown, CreateQuestionInput>;
router.post(
  "/",
  requireAuth,
  requireRole("PATIENT"),
  validate(createQuestionSchema),
  async (req: CreateReq, res: Response, next: NextFunction) => {
    try {
      const { text, medicineId, prescriptionId } = req.body;

      if (medicineId && medicineId.length > 0) {
        const medicine = await prisma.medicine.findUnique({
          where: { id: medicineId },
          select: { id: true },
        });
        if (!medicine) {
          throw new AppError(
            404,
            "We couldn't find that medicine in our catalog. Please double-check the name or call us."
          );
        }
      }

      const question = await prisma.question.create({
        data: {
          patientId: req.user!.userId,
          text: text.trim(),
          status: QuestionStatus.OPEN,
          medicineId: medicineId && medicineId.length > 0 ? medicineId : null,
          prescriptionId:
            prescriptionId && prescriptionId.length > 0 ? prescriptionId : null,
        },
        include: QUESTION_INCLUDES,
      });

      res.status(201).json({
        data: mapQuestion(question),
        message:
          "Your question has been sent to a pharmacist. We usually reply within a few hours during business hours.",
      });
    } catch (e) {
      next(e);
    }
  }
);

/* ------------------------------------------------------
 *  GET /questions?status=open&take=20&cursor=...
 *  Queue for pharmacists and admins
 * ------------------------------------------------------ */
// NOTE: plain Request — Express 5 handler types reject custom ReqQuery generics
// on the RequestHandler overload; the validated query is read via
// req.validatedQuery below anyway.
type ListReq = Request;
router.get(
  "/",
  requireAuth,
  requireRole("PHARMACIST", "ADMIN"),
  validateQuery(listQuestionsQuerySchema),
  async (req: ListReq, res: Response, next: NextFunction) => {
    try {
      const q = req.validatedQuery as ListQuestionsQuery;
      const take = Number(q.take ?? 20);
      const statusFilter = (q.status as ListQuestionsQuery["status"])
        ? (q.status!.toUpperCase() as QuestionStatus)
        : undefined;
      const cursor =
        typeof q.cursor === "string" && q.cursor.length > 0
          ? { id: q.cursor }
          : undefined;

      const where: Prisma.QuestionWhereInput = {};
      if (statusFilter) where.status = statusFilter;

      const raw = await prisma.question.findMany({
        where,
        take: take + 1,
        skip: cursor ? 1 : 0,
        cursor,
        orderBy: [
          { status: "asc" },
          { createdAt: "asc" },
        ],
        include: QUESTION_INCLUDES,
      });

      const hasNext = raw.length > take;
      const rows = hasNext ? raw.slice(0, take) : raw;
      const data: MappedQuestion[] = rows.map((r) => mapQuestion(r));
      const nextCursor = hasNext ? (data[data.length - 1].id as string) : null;

      res.json({
        data,
        meta: {
          count: data.length,
          take,
          nextCursor,
        },
      });
    } catch (e) {
      next(e);
    }
  }
);

/* ------------------------------------------------------
 *  GET /questions/:id
 * ------------------------------------------------------ */
type OneReq = Request<QuestionIdParam>;
router.get(
  "/:id",
  requireAuth,
  validateParams(questionIdParamSchema),
  async (req: OneReq, res: Response, next: NextFunction) => {
    try {
      const { id } = req.validatedParams as QuestionIdParam;
      const question = await prisma.question.findUnique({
        where: { id },
        include: QUESTION_INCLUDES,
      });
      if (!question) {
        throw new AppError(404, "That question could not be found.");
      }
      const user = req.user!;
      if (
        user.role !== "PHARMACIST" &&
        user.role !== "ADMIN" &&
        question.patientId !== user.userId
      ) {
        throw new AppError(
          403,
          "You can only view your own questions. Ask a pharmacist for help if you need another question reviewed."
        );
      }
      res.json({ data: mapQuestion(question) });
    } catch (e) {
      next(e);
    }
  }
);

/* ------------------------------------------------------
 *  POST /questions/:id/answer
 *  Atomic claim + answer via conditional updateMany
 * ------------------------------------------------------ */
type AnswerReq = Request<QuestionIdParam, unknown, AnswerInput>;
router.post(
  "/:id/answer",
  requireAuth,
  requireRole("PHARMACIST"),
  validateParams(questionIdParamSchema),
  validate(answerSchema),
  async (req: AnswerReq, res: Response, next: NextFunction) => {
    try {
      const { id } = req.validatedParams as QuestionIdParam;
      const { text } = req.body;
      const pharmacistId = req.user!.userId;

      const existing = await prisma.question.findUnique({
        where: { id },
        select: { status: true, patientId: true },
      });
      if (!existing) {
        throw new AppError(404, "That question could not be found.");
      }
      if (existing.status === QuestionStatus.ANSWERED) {
        throw new AppError(
          409,
          "This question has already been answered. If the patient has a follow-up, please ask them to submit a new question."
        );
      }
      if (existing.status === QuestionStatus.CLOSED) {
        throw new AppError(
          409,
          "This conversation is closed. Please open a new question for the patient."
        );
      }
      if (existing.status === QuestionStatus.CLAIMED) {
        throw new AppError(
          409,
          "Another pharmacist is already working on this question. Please choose a different one from the queue."
        );
      }

      // ------------------------------
      // ATOMIC CLAIM + ANSWER
      // ------------------------------
      // Everything below runs in ONE interactive transaction:
      //   1. updateMany with WHERE status=OPEN is the Prisma trick for
      //      "update if and only if no other request claimed it in the
      //      race window" — only one concurrent pharmacist gets count=1.
      //   2. The answer row is created in the SAME transaction, so the
      //      question can never be stuck in ANSWERED with no answer
      //      (the previous two-step version had that failure mode).
      const { answer, updatedQ } = await prisma.$transaction(async (tx) => {
        const guard = await tx.question.updateMany({
          where: { id, status: QuestionStatus.OPEN },
          data: { status: QuestionStatus.ANSWERED, claimedById: pharmacistId },
        });
        if (guard.count === 0) {
          throw new AppError(
            409,
            "Sorry — another pharmacist claimed this just before you did. Please refresh the open queue and pick another question."
          );
        }

        const answer = await tx.answer.create({
          data: {
            questionId: id,
            pharmacistId,
            text: text.trim(),
          },
          include: {
            pharmacist: {
              select: { id: true, email: true, fullName: true, phone: true },
            },
          },
        });

        const updatedQ = await tx.question.findUnique({
          where: { id },
          include: QUESTION_INCLUDES,
        });

        try {
          await notifyQuestionAnswered({
            patientUserId: existing.patientId,
            questionId: id,
            pharmacistName: answer.pharmacist.fullName ?? undefined,
          });
        } catch (notifyErr) {
          // Failing to send the notification must not roll back the answer
          // itself — the patient's data integrity is more important than a
          // transient notification delivery issue. Log for ops to retry.
          console.error("notifyQuestionAnswered failed:", notifyErr);
        }

        return { answer, updatedQ };
      });

      res.status(201).json({
        data: {
          question: updatedQ ? mapQuestion(updatedQ) : null,
          answer,
        },
        message:
          "Answer sent. The patient has been notified that a reply is ready.",
      });
    } catch (e) {
      next(e);
    }
  }
);

export default router;
