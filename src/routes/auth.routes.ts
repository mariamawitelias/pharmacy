import { Router, Request, Response, NextFunction } from "express";
import { validate } from "../middleware/validate.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  patientRegisterSchema,
  doctorRegisterSchema,
  pharmacistRegisterSchema,
  riderRegisterSchema,
  adminRegisterSchema,
  loginSchema,
} from "../schemas/auth.schema.js";
import * as authService from "../services/auth.service.js";

const router = Router();

router.post("/patient/register", validate(patientRegisterSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try { res.status(201).json(await authService.registerPatient(req.body)); }
    catch (e) { next(e); }
  });

router.post("/doctor/register", validate(doctorRegisterSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try { res.status(201).json(await authService.registerDoctor(req.body)); }
    catch (e) { next(e); }
  });

router.post("/rider/register", validate(riderRegisterSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try { res.status(201).json(await authService.registerRider(req.body)); }
    catch (e) { next(e); }
  });

router.post("/pharmacist/register", requireAuth, requireRole("ADMIN"),
  validate(pharmacistRegisterSchema), async (req: Request, res: Response, next: NextFunction) => {
    try { res.status(201).json(await authService.registerPharmacist(req.body)); }
    catch (e) { next(e); }
  });

router.post("/admin/register", requireAuth, requireRole("ADMIN"),
  validate(adminRegisterSchema), async (req: Request, res: Response, next: NextFunction) => {
    try { res.status(201).json(await authService.registerAdmin(req.body)); }
    catch (e) { next(e); }
  });


router.post("/patient/login", validate(loginSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await authService.loginAs("PATIENT", req.body)); }
    catch (e) { next(e); }
  });

router.post("/doctor/login", validate(loginSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await authService.loginAs("DOCTOR", req.body)); }
    catch (e) { next(e); }
  });

router.post("/pharmacist/login", validate(loginSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await authService.loginAs("PHARMACIST", req.body)); }
    catch (e) { next(e); }
  });

router.post("/rider/login", validate(loginSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await authService.loginAs("RIDER", req.body)); }
    catch (e) { next(e); }
  });

router.post("/admin/login", validate(loginSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await authService.loginAs("ADMIN", req.body)); }
    catch (e) { next(e); }
  });

export default router;