import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { User, Role } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../lib/errors.js";
import {
  PatientRegisterInput,
  DoctorRegisterInput,
  PharmacistRegisterInput,
  RiderRegisterInput,
  AdminRegisterInput,
  LoginInput,
} from "../schemas/auth.schema.js";

const signToken = (user: User) =>
  jwt.sign(
    { userId: user.id, role: user.role },
    process.env.JWT_SECRET!,
    { expiresIn: "7d" }
  );

const sanitize = (user: User) => {
  const { passwordHash, ...rest } = user;
  return rest;
};

const assertEmailFree = async (email: string) => {
  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) throw new AppError(409, "Email already registered");
};

export const registerPatient = async (data: PatientRegisterInput) => {
  await assertEmailFree(data.email);
  const passwordHash = await bcrypt.hash(data.password, 10);
  const user = await prisma.user.create({
    data: {
      email: data.email,
      passwordHash,
      fullName: data.fullName,
      phone: data.phone,
      role: "PATIENT",
      patient: { create: {} },
    },
  });
  return { token: signToken(user), user: sanitize(user) };
};

export const registerDoctor = async (data: DoctorRegisterInput) => {
  await assertEmailFree(data.email);
  const passwordHash = await bcrypt.hash(data.password, 10);
  const user = await prisma.user.create({
    data: {
      email: data.email,
      passwordHash,
      fullName: data.fullName,
      phone: data.phone,
      role: "DOCTOR",
      doctor: { create: { hospitalName: data.hospitalName, specialty: data.specialty } },
    },
  });
  return { token: signToken(user), user: sanitize(user) };
};

export const registerPharmacist = async (data: PharmacistRegisterInput) => {
  await assertEmailFree(data.email);
  const pharmacy = await prisma.pharmacy.findUnique({ where: { id: data.pharmacyId } });
  if (!pharmacy) throw new AppError(404, "Pharmacy not found");

  const passwordHash = await bcrypt.hash(data.password, 10);
  const user = await prisma.user.create({
    data: {
      email: data.email,
      passwordHash,
      fullName: data.fullName,
      phone: data.phone,
      role: "PHARMACIST",
      pharmacyId: data.pharmacyId,
    },
  });
  return { token: signToken(user), user: sanitize(user) };
};

export const registerRider = async (data: RiderRegisterInput) => {
  await assertEmailFree(data.email);
  const passwordHash = await bcrypt.hash(data.password, 10);
  const user = await prisma.user.create({
    data: {
      email: data.email,
      passwordHash,
      fullName: data.fullName,
      phone: data.phone,
      role: "RIDER",
    },
  });
  return { token: signToken(user), user: sanitize(user) };
};

export const registerAdmin = async (data: AdminRegisterInput) => {
  await assertEmailFree(data.email);
  const passwordHash = await bcrypt.hash(data.password, 10);
  const user = await prisma.user.create({
    data: {
      email: data.email,
      passwordHash,
      fullName: data.fullName,
      phone: data.phone,
      role: "ADMIN",
    },
  });
  return { token: signToken(user), user: sanitize(user) };
};

// Shared login logic, but each route enforces the role matches its own endpoint
export const loginAs = async (expectedRole: Role, { email, password }: LoginInput) => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new AppError(401, "Invalid credentials");

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new AppError(401, "Invalid credentials");

  if (user.role !== expectedRole) {
    throw new AppError(403, `This account is not a ${expectedRole.toLowerCase()} — use the correct login endpoint`);
  }

  return { token: signToken(user), user: sanitize(user) };
};