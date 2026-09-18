const express = require("express");
const { z } = require("zod");
const { PrismaClient } = require("@prisma/client");
const { validate } = require("../middleware/auth");
const ApiError = require("../utils/ApiError");
const { mapNotification } = require("../utils/statusLabels");

const prisma = new PrismaClient();
const router = express.Router();

const listNotificationsQuerySchema = z.object({
  take: z.preprocess(
    (val) => (val === undefined || val === "" ? 20 : Number(val)),
    z.number().int().min(1).max(100).default(20),
  ),
  cursor: z.preprocess(
    (val) => (val === undefined || val === "" ? undefined : Number(val)),
    z.number().int().positive().optional(),
  ),
  unreadOnly: z.preprocess(
    (val) => (val === "true" ? true : val === "false" ? false : undefined),
    z.boolean().optional(),
  ),
});

const notificationIdParamSchema = z.object({
  id: z.preprocess(
    (val) => Number(val),
    z.number().int().positive("Notification ID must be a positive number."),
  ),
});

// =============================================================
// GET /api/notifications — own notifications, newest first
// =============================================================
router.get(
  "/",
  validate({ query: listNotificationsQuerySchema }),
  async (req, res, next) => {
    try {
      const { take, cursor, unreadOnly } = req.query;
      const userId = req.user.id;

      const where = { userId };
      if (unreadOnly === true) {
        where.readAt = null;
      }

      const findArgs = {
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: take + 1,
      };
      if (cursor) {
        findArgs.cursor = { id: cursor };
        findArgs.skip = 1;
      }

      const rows = await prisma.notification.findMany(findArgs);

      let nextCursor = null;
      if (rows.length > take) {
        rows.pop();
        nextCursor = rows[rows.length - 1].id;
      }

      const totalUnread = await prisma.notification.count({
        where: { userId, readAt: null },
      });

      res.json({
        data: rows.map(mapNotification),
        meta: {
          count: rows.length,
          take,
          nextCursor,
          unreadCount: totalUnread,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

// =============================================================
// PATCH /api/notifications/:id/read — mark own notification read
// =============================================================
router.patch(
  "/:id/read",
  validate({ params: notificationIdParamSchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const existing = await prisma.notification.findUnique({ where: { id } });
      if (!existing) {
        throw new ApiError(
          404,
          "NOTIFICATION_NOT_FOUND",
          "We couldn't find that notification.",
        );
      }
      if (existing.userId !== userId) {
        throw new ApiError(
          403,
          "FORBIDDEN",
          "You can only mark your own notifications as read.",
        );
      }

      const notification = await prisma.notification.update({
        where: { id },
        data: { readAt: existing.readAt ?? new Date() },
      });

      const unreadCount = await prisma.notification.count({
        where: { userId, readAt: null },
      });

      res.json({
        data: mapNotification(notification),
        meta: { unreadCount },
        message: "Marked as read.",
      });
    } catch (err) {
      next(err);
    }
  },
);

module.exports = router;
