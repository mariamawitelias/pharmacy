import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";
import type { Role } from "@prisma/client";
import { AppError } from "../lib/errors.js";

interface JwtPayload {
  userId: string;
  role: Role;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return next(new AppError(401, "Missing or malformed token"));
  }
  try {
    req.user = jwt.verify(header.split(" ")[1], process.env.JWT_SECRET!) as JwtPayload;
    next();
  } catch {
    next(new AppError(401, "Invalid or expired token"));
  }
};

export const requireRole = (...roles: Role[]) =>
  (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return next(new AppError(401, "Not authenticated"));
    if (!roles.includes(req.user.role)) {
      return next(new AppError(403, "Insufficient permissions"));
    }
    next();
  };