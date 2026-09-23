import { Router, Request, Response, NextFunction } from "express";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../lib/errors.js";
import { requireAuth } from "../middleware/auth.js";
import { validateParams, validateQuery } from "../middleware/validate.js";
import {
  listNotificationsQuerySchema,
  notificationIdParamSchema,
  type ListNotificationsQuery,
  type NotificationIdParam,
} from "../schemas/notification.schema.js";
import {
  mapNotification,
  type MappedNotification,
} from "../utils/statusLabels.js";

const router = Router();

/* ------------------------------------------------------
 *  GET /notifications
 *  Own notifications for the logged-in user only.
 *  Newest first, cursor paginated. Returns an unread badge
 *  so the frontend doesn't need a second request.
 * ------------------------------------------------------ */
// NOTE: plain Request — Express 5 handler types reject custom ReqQuery generics
// on the RequestHandler overload; the validated query is read via
// req.validatedQuery below anyway.
type ListReq = Request;
router.get(
  "/",
  requireAuth,
  validateQuery(listNotificationsQuerySchema),
  async (req: ListReq, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      const q = req.validatedQuery as ListNotificationsQuery;
      const take = Number(q.take ?? 20);
      const cursor =
        typeof q.cursor === "string" && q.cursor.length > 0
          ? { id: q.cursor }
          : undefined;
      const unreadOnly = Boolean(q.unreadOnly ?? false);

      const where: Prisma.NotificationWhereInput = {
        userId,
      };
      if (unreadOnly) where.readAt = null;

      const [countResult, raw] = await Promise.all([
        prisma.notification.count({
          where: { userId, readAt: null },
        }),
        prisma.notification.findMany({
          where,
          take: take + 1,
          skip: cursor ? 1 : 0,
          cursor,
          orderBy: [
            { createdAt: "desc" },
            { id: "desc" },
          ],
        }),
      ]);

      const hasNext = raw.length > take;
      const rows = hasNext ? raw.slice(0, take) : raw;
      const data: MappedNotification[] = rows.map((n) => mapNotification(n));
      const nextCursor = hasNext ? (data[data.length - 1].id as string) : null;

      res.json({
        data,
        meta: {
          count: data.length,
          take,
          nextCursor,
          unreadCount: countResult,
        },
      });
    } catch (e) {
      next(e);
    }
  }
);

/* ------------------------------------------------------
 *  PATCH /notifications/:id/read
 *  Mark a specific notification read. Idempotent: will
 *  not overwrite an existing readAt timestamp.
 * ------------------------------------------------------ */
type ReadReq = Request<NotificationIdParam>;
router.patch(
  "/:id/read",
  requireAuth,
  validateParams(notificationIdParamSchema),
  async (req: ReadReq, res: Response, next: NextFunction) => {
    try {
      const { id } = req.validatedParams as NotificationIdParam;
      const userId = req.user!.userId;

      const existing = await prisma.notification.findUnique({
        where: { id },
      });
      if (!existing) {
        throw new AppError(404, "That notification could not be found.");
      }
      if (existing.userId !== userId) {
        throw new AppError(
          403,
          "You can only mark your own notifications as read."
        );
      }

      const readAt = existing.readAt ?? new Date();
      const updated = await prisma.notification.update({
        where: { id },
        data: { readAt },
      });

      const unreadCount = await prisma.notification.count({
        where: { userId, readAt: null },
      });

      res.json({
        data: mapNotification(updated),
        meta: { unreadCount },
        message: "Marked as read.",
      });
    } catch (e) {
      next(e);
    }
  }
);

export default router;
