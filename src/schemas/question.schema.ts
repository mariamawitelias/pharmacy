import { z } from "zod";

// NOTE: Zod 4 removed `required_error` / `invalid_type_error` params —
// use the unified `error` param instead.
export const createQuestionSchema = z.object({
  text: z
    .string({ error: "Please write what you would like to ask." })
    .trim()
    .min(1, { message: "Please write what you would like to ask." })
    .max(1000, {
      message:
        "Your question is too long. Please keep it under 1000 characters, or call us if you need more detail.",
    }),
  medicineId: z
    .string()
    .uuid({ message: "Invalid medicine identifier." })
    .optional()
    .or(z.literal("")),
  prescriptionId: z
    .string()
    .uuid({ message: "Invalid prescription identifier." })
    .optional()
    .or(z.literal("")),
});

export type CreateQuestionInput = z.infer<typeof createQuestionSchema>;

export const answerSchema = z.object({
  text: z
    .string({ error: "Please write your answer." })
    .trim()
    .min(1, { message: "Please write your answer." })
    .max(2000, {
      message:
        "Your answer is too long. Please keep it under 2000 characters, or call the patient to discuss further.",
    }),
});

export type AnswerInput = z.infer<typeof answerSchema>;

export const questionIdParamSchema = z.object({
  id: z.string().uuid({ message: "Invalid question identifier." }),
});

export type QuestionIdParam = z.infer<typeof questionIdParamSchema>;

const STATUS_VALUES = ["open", "claimed", "answered", "closed"] as const;
export const listQuestionsQuerySchema = z.object({
  status: z
    .enum(STATUS_VALUES, {
      message:
        "Status filter must be one of: open, claimed, answered, closed.",
    })
    .optional(),
  take: z.preprocess(
    (val) =>
      typeof val === "string" && val.length > 0 ? Number(val) : undefined,
    z.number().int().positive().min(1).max(100).optional().default(20)
  ),
  cursor: z
    .string()
    .uuid({ message: "Invalid pagination cursor." })
    .optional()
    .or(z.literal("")),
});

export type ListQuestionsQuery = z.infer<typeof listQuestionsQuerySchema>;
