import { z } from "zod";

export const createMedicineSchema = z.object({
  name: z.string().min(2),
  genericName: z.string().optional(),
  form: z.string().min(2),
  strength: z.string().optional(),
  requiresPrescription: z.boolean().default(true),
});

export const updateMedicineSchema = z.object({
  name: z.string().min(2).optional(),
  genericName: z.string().optional(),
  form: z.string().min(2).optional(),
  strength: z.string().optional(),
  requiresPrescription: z.boolean().optional(),
});

export type CreateMedicineInput = z.infer<typeof createMedicineSchema>;
export type UpdateMedicineInput = z.infer<typeof updateMedicineSchema>;