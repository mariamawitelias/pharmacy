import { z } from "zod";

const baseFields = {
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  fullName: z.string().min(2),
  phone: z.string().optional(),
};

export const patientRegisterSchema = z.object(baseFields);

export const doctorRegisterSchema = z.object({
  ...baseFields,
  hospitalName: z.string().min(2),
  specialty: z.string().optional(),
});



export const pharmacistRegisterSchema = z.object({
  ...baseFields,
  pharmacyId: z.string().uuid(),
});

export const riderRegisterSchema = z.object(baseFields);

export const adminRegisterSchema = z.object(baseFields);

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export type PatientRegisterInput = z.infer<typeof patientRegisterSchema>;
export type DoctorRegisterInput = z.infer<typeof doctorRegisterSchema>;
export type PharmacistRegisterInput = z.infer<typeof pharmacistRegisterSchema>;
export type RiderRegisterInput = z.infer<typeof riderRegisterSchema>;
export type AdminRegisterInput = z.infer<typeof adminRegisterSchema>;
export type LoginInput = z.infer<typeof loginSchema>;