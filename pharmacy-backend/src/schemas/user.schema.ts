import { z } from "zod";

export const updateProfileSchema = z.object({
  fullName: z.string().min(2).optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  preferredPharmacyId: z.string().uuid().optional(),
});

export const linkCaregiverSchema = z.object({
  caregiverEmail: z.string().email(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type LinkCaregiverInput = z.infer<typeof linkCaregiverSchema>;