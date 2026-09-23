import { z } from "zod";

export const listNotificationsQuerySchema = z.object({
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
  unreadOnly: z.preprocess(
    (val) => {
      if (val === "true" || val === "1") return true;
      if (val === "false" || val === "0") return false;
      return undefined;
    },
    z.boolean().optional().default(false)
  ),
});

export type ListNotificationsQuery = z.infer<
  typeof listNotificationsQuerySchema
>;

export const notificationIdParamSchema = z.object({
  id: z.string().uuid({ message: "Invalid notification identifier." }),
});

export type NotificationIdParam = z.infer<typeof notificationIdParamSchema>;
