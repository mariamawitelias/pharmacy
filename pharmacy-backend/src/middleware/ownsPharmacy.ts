import { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../lib/errors.js";

export const ownsPharmacy = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (req.user!.role === "ADMIN") return next();
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
    });
    if (user?.pharmacyId !== req.params.id) {
      throw new AppError(403, "You can only manage your own pharmacy");
    }
    next();
  } catch (e) {
    next(e);
  }
};
