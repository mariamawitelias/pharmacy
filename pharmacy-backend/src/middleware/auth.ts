import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";
import type { Role } from "@prisma/client";
import { AppError } from "../lib/errors.js";

interface JwtPayload {
  userId: string;
  role: Role;
}

const VALID_ROLES: Role[] = [
  "PATIENT",
  "DOCTOR",
  "PHARMACIST",
  "RIDER",
  "ADMIN",
];

export const requireAuth = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;

  // Dev-mode shortcut: if no real JWT, accept x-mock headers for local testing.
  // Guarded behind NODE_ENV !== 'production' so it can never fire in staging/prod.
  if (process.env.NODE_ENV !== "production" && !authHeader) {
    const mockUserId =
      typeof req.headers["x-mock-user-id"] === "string"
        ? req.headers["x-mock-user-id"]
        : undefined;
    const mockRoleRaw =
      typeof req.headers["x-mock-role"] === "string"
        ? req.headers["x-mock-role"].toUpperCase()
        : undefined;
    const mockRole = VALID_ROLES.includes(mockRoleRaw as Role)
      ? (mockRoleRaw as Role)
      : undefined;

    if (mockUserId && mockRole) {
      req.user = { userId: mockUserId, role: mockRole };
      return next();
    }
  }

  if (!authHeader?.startsWith("Bearer ")) {
    return next(new AppError(401, "Missing or malformed token"));
  }
  try {
    req.user = jwt.verify(
      authHeader.split(" ")[1],
      process.env.JWT_SECRET!
    ) as JwtPayload;
    next();
  } catch {
    next(new AppError(401, "Invalid or expired token"));
  }
};

export const requireRole =
  (...roles: Role[]) =>
  (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return next(new AppError(401, "Not authenticated"));
    if (!roles.includes(req.user.role)) {
      return next(new AppError(403, "Insufficient permissions"));
    }
    next();
  };
