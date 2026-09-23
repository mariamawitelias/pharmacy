import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";

export class AppError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "AppError";
  }
}

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: err.message });
  }

  if (err instanceof ZodError) {
    return res
      .status(400)
      .json({ error: "Validation failed", details: err.issues });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      const fields =
        ((err.meta?.target as string[] | undefined)?.join(", ")) ?? "field";
      return res
        .status(409)
        .json({ error: `A record with this ${fields} already exists` });
    }
    if (err.code === "P2025") {
      return res.status(404).json({ error: "Record not found" });
    }
    if (err.code === "P2003") {
      return res
        .status(400)
        .json({ error: "Invalid reference — related record does not exist" });
    }
  }

  console.error(err);
  res.status(500).json({ error: "Internal server error" });
};
