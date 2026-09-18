const express = require('express');
const { z } = require('zod');
const { PrismaClient, QuestionStatus } = require('@prisma/client');
const { requireRole, validate } = require('../middleware/auth');
const ApiError = require('../utils/ApiError');
const { mapQuestion } = require('../utils/statusLabels');
const { notifyQuestionAnswered } = require('../services/notificationService');

const prisma = new PrismaClient();
const router = express.Router();

// =============================================================
// Task 3 — Zod schemas
// =============================================================

const createQuestionSchema = z.object({
  text: z
    .string({ required_error: 'Please type your question before sending.' })
    .trim()
    .min(1, 'Your question is empty. Please write what you would like to ask.')
    .max(1000, 'Questions cannot be longer than 1000 characters. If you need more space, please call our support line.'),
  medicineId: z
    .preprocess((val) => (val === null || val === undefined || val === '' ? undefined : Number(val)), z.number().int().positive().optional())
    .optional(),
  prescriptionId: z
    .preprocess((val) => (val === null || val === undefined || val === '' ? undefined : Number(val)), z.number().int().positive().optional())
    .optional(),
});

const answerSchema = z.object({
  text: z
    .string({ required_error: 'Please write your answer before sending.' })
    .trim()
    .min(1, 'The answer field is empty.')
    .max(2000, 'Answers cannot be longer than 2000 characters. Please be concise and call the patient if more detail is needed.'),
});

const questionIdParamSchema = z.object({
  id: z.preprocess((val) => Number(val), z.number().int().positive('Question ID must be a positive number.')),
});

const listQuestionsQuerySchema = z.object({
  status: z
    .enum(['open', 'claimed', 'answered', 'closed'], {
      errorMap: () => ({ message: "Status must be one of: open, claimed, answered, closed." }),
    })
    .optional(),
  take: z.preprocess(
    (val) => (val === undefined || val === '' ? 20 : Number(val)),
    z.number().int().min(1).max(100).default(20)
  ),
  cursor: z.preprocess(
    (val) => (val === undefined || val === '' ? undefined : Number(val)),
    z.number().int().positive().optional()
  ),
});

// =============================================================
// Task 4 — POST /api/questions (patient submits question)
// =============================================================

router.post('/', requireRole('patient'), validate({ body: createQuestionSchema }), async (req, res, next) => {
  try {
    const { text, medicineId, prescriptionId } = req.body;

    if (medicineId) {
      const exists = await prisma.medicine.findUnique({ where: { id: medicineId } });
      if (!exists) {
        throw new ApiError(404, 'MEDICINE_NOT_FOUND', "We couldn't find that medicine. Please select one from the list, or just ask your question without picking a medicine.");
      }
    }

    const question = await prisma.question.create({
      data: {
        patientId: req.user.id,
        text,
        medicineId: medicineId ?? null,
        prescriptionId: prescriptionId ?? null,
        status: QuestionStatus.OPEN,
      },
    });

    res.status(201).json({
      data: mapQuestion(question),
      message: 'Your question has been sent. A pharmacist will reply as soon as possible — usually within an hour.',
    });
  } catch (err) {
    next(err);
  }
});

// =============================================================
// Task 5 — GET /api/questions?status=open (professional queue)
// =============================================================

router.get('/', requireRole('pharmacist', 'admin'), validate({ query: listQuestionsQuerySchema }), async (req, res, next) => {
  try {
    const { status, take, cursor } = req.query;

    const where = {};
    if (status) {
      where.status = status.toUpperCase();
    }

    const findArgs = {
      where,
      orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
      take: take + 1,
      include: {
        patient: { select: { id: true, firstName: true, lastName: true } },
        medicine: { select: { id: true, name: true, genericName: true } },
        answer: true,
      },
    };
    if (cursor) findArgs.cursor = { id: cursor };
    if (cursor) findArgs.skip = 1;

    const rows = await prisma.question.findMany(findArgs);

    let nextCursor = null;
    if (rows.length > take) {
      rows.pop();
      nextCursor = rows[rows.length - 1].id;
    }

    res.json({
      data: rows.map(mapQuestion),
      meta: {
        count: rows.length,
        take,
        nextCursor,
      },
    });
  } catch (err) {
    next(err);
  }
});

// =============================================================
// GET /api/questions/:id (any authenticated user can view a
// specific question — patient sees their own, pharmacist/admin
// sees any)
// =============================================================

router.get('/:id', validate({ params: questionIdParamSchema }), async (req, res, next) => {
  try {
    const { id } = req.params;
    const question = await prisma.question.findUnique({
      where: { id },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true } },
        medicine: { select: { id: true, name: true, genericName: true } },
        claimedBy: { select: { id: true, firstName: true, lastName: true } },
        answer: {
          include: { pharmacist: { select: { id: true, firstName: true, lastName: true } } },
        },
      },
    });

    if (!question) {
      throw new ApiError(404, 'QUESTION_NOT_FOUND', "We couldn't find that question. It may have been removed.");
    }

    const isOwn = question.patientId === req.user.id;
    const isStaff = ['PHARMACIST', 'ADMIN'].includes(req.user.role);
    if (!isOwn && !isStaff) {
      throw new ApiError(403, 'FORBIDDEN', "You can only view questions you've asked.");
    }

    res.json({ data: mapQuestion(question) });
  } catch (err) {
    next(err);
  }
});

// =============================================================
// Task 6 — POST /api/questions/:id/answer (claim + answer atomically)
// =============================================================

router.post(
  '/:id/answer',
  requireRole('pharmacist'),
  validate({ params: questionIdParamSchema, body: answerSchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { text } = req.body;
      const pharmacistId = req.user.id;

      const question = await prisma.question.findUnique({ where: { id } });
      if (!question) {
        throw new ApiError(404, 'QUESTION_NOT_FOUND', "We couldn't find that question.");
      }
      if (question.status !== 'OPEN') {
        throw new ApiError(
          409,
          'QUESTION_NOT_OPEN',
          "Another pharmacist is already working on this question. Please pick a different one from the open queue."
        );
      }

      const [updatedCount] = await prisma.$transaction([
        prisma.question.updateMany({
          where: { id, status: QuestionStatus.OPEN },
          data: { status: QuestionStatus.ANSWERED, claimedById: pharmacistId },
        }),
      ]);

      if (updatedCount.count === 0) {
        throw new ApiError(
          409,
          'QUESTION_ALREADY_CLAIMED',
          "Sorry — another pharmacist claimed this question just before you. Please pick another from the open queue."
        );
      }

      const txResult = await prisma.$transaction(async (tx) => {
        const answer = await tx.answer.create({
          data: { questionId: id, pharmacistId, text },
          include: { pharmacist: { select: { id: true, firstName: true, lastName: true } } },
        });
        const updatedQuestion = await tx.question.update({
          where: { id },
          data: { status: QuestionStatus.ANSWERED, claimedById: pharmacistId },
          include: {
            patient: { select: { id: true, firstName: true, lastName: true } },
            medicine: true,
            answer: true,
          },
        });
        await notifyQuestionAnswered({
          patientUserId: updatedQuestion.patientId,
          questionId: updatedQuestion.id,
          questionText: updatedQuestion.text,
        });
        return { answer, updatedQuestion };
      });

      res.json({
        data: {
          question: mapQuestion(txResult.updatedQuestion),
          answer: txResult.answer,
        },
        message: 'Answer sent. The patient has been notified.',
      });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
