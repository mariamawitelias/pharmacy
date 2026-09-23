import { z } from 'zod';

const idString = z.string().trim().min(1);

export const idParamSchema = z.object({
  id: idString,
});

export const prescriptionIdParamSchema = idParamSchema;

export const prescriptionItemSchema = z.object({
  medicineId: idString,
  dosage: z.string().trim().min(1).max(100),
  frequency: z.string().trim().min(1).max(100),
  duration: z.string().trim().min(1).max(100),
  quantity: z.number().int().positive(),
  instructions: z.string().trim().max(500).optional(),
});

export const createPrescriptionSchema = z.object({
  patientId: idString,
  pharmacyId: idString,
  notes: z.string().trim().max(1000).optional(),
  items: z.array(prescriptionItemSchema).min(1, 'At least one item is required.'),
});

export const sendPrescriptionSchema = z.object({
  pharmacyId: idString,
  notes: z.string().trim().max(1000).optional(),
});

export const rejectPrescriptionSchema = z.object({
  reason: z.string().trim().min(1, 'Reason is required.').max(500),
});

export const updatePrescriptionStatusSchema = z
  .object({
    status: z.enum(['SENT', 'CONFIRMED', 'REJECTED', 'READY', 'CANCELLED']),
    pharmacyId: idString.optional(),
    reason: z.string().trim().max(500).optional(),
  })
  .refine((data) => data.status !== 'SENT' || !!data.pharmacyId, {
    message: 'pharmacyId is required when transitioning to SENT.',
    path: ['pharmacyId'],
  })
  .refine((data) => !['REJECTED', 'CANCELLED'].includes(data.status) || !!data.reason, {
    message: 'reason is required when rejecting or cancelling.',
    path: ['reason'],
  });

export const inventoryDecrementSchema = z.object({
  medicineId: idString,
  quantity: z.number().int().min(1),
});

export const notifyTargetsParamsSchema = z.object({
  patientId: idString,
});

export const createOrderSchema = z
  .object({
    prescriptionId: idString,
    pharmacyId: idString,
    fulfillment: z.enum(['PICKUP', 'DELIVERY']),
    items: z
      .array(
        z.object({
          medicineId: idString,
          quantity: z.number().int().positive(),
          unitPrice: z.number().nonnegative(),
        }),
      )
      .min(1, 'At least one order item is required.'),
    deliveryAddress: z.string().trim().min(5).max(500).optional(),
    deliveryLat: z.number().min(-90).max(90).optional(),
    deliveryLng: z.number().min(-180).max(180).optional(),
  })
  .refine((data) => data.fulfillment !== 'DELIVERY' || !!data.deliveryAddress, {
    message: 'deliveryAddress is required for DELIVERY orders.',
    path: ['deliveryAddress'],
  });

export const updateOrderStatusSchema = z
  .object({
    status: z.enum(['CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'COMPLETED', 'CANCELLED']),
    reason: z.string().trim().max(500).optional(),
  })
  .refine((data) => data.status !== 'CANCELLED' || !!data.reason, {
    message: 'reason is required when cancelling an order.',
    path: ['reason'],
  });

export const updateDeliveryStatusSchema = z.object({
  status: z.enum(['PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'FAILED']),
});

export type IdParam = z.infer<typeof idParamSchema>;
export type PrescriptionItemInput = z.infer<typeof prescriptionItemSchema>;
export type CreatePrescriptionInput = z.infer<typeof createPrescriptionSchema>;
export type SendPrescriptionInput = z.infer<typeof sendPrescriptionSchema>;
export type RejectPrescriptionInput = z.infer<typeof rejectPrescriptionSchema>;
export type UpdatePrescriptionStatusInput = z.infer<typeof updatePrescriptionStatusSchema>;
export type InventoryDecrementInput = z.infer<typeof inventoryDecrementSchema>;
export type NotifyTargetsParams = z.infer<typeof notifyTargetsParamsSchema>;
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;
export type UpdateDeliveryStatusInput = z.infer<typeof updateDeliveryStatusSchema>;