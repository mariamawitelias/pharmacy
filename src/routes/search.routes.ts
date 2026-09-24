import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { validateQuery } from "../middleware/validate.js";

const nearbySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  medicineId: z.string().uuid(),
  radiusKm: z.coerce.number().positive().max(50).default(10),
  limit: z.coerce.number().int().positive().max(50).default(10),
});

interface NearbyRow {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  phone: string | null;
  openTime: string | null;
  closeTime: string | null;
  quantity: number;
  price: number;
  medicineName: string;
  strength: string | null;
  distanceKm: number;
}

const router = Router();

router.get("/nearby", validateQuery(nearbySchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { lat, lng, medicineId, radiusKm, limit } = req.validatedQuery;

    const results: NearbyRow[] = await prisma.$queryRaw<NearbyRow[]>`
      SELECT
        p.id,
        p.name,
        p.address,
        p.lat,
        p.lng,
        p.phone,
        p."openTime",
        p."closeTime",
        i.quantity,
        i.price,
        m.name AS "medicineName",
        m.strength,
        (
          6371 * acos(
            LEAST(1.0,
              cos(radians(${lat})) * cos(radians(p.lat)) *
              cos(radians(p.lng) - radians(${lng})) +
              sin(radians(${lat})) * sin(radians(p.lat))
            )
          )
        ) AS "distanceKm"
      FROM "Pharmacy" p
      JOIN "Inventory" i ON i."pharmacyId" = p.id
      JOIN "Medicine" m ON m.id = i."medicineId"
      WHERE p.verified = true
        AND i."medicineId" = ${medicineId}
        AND i.quantity > 0
        AND (
          6371 * acos(
            LEAST(1.0,
              cos(radians(${lat})) * cos(radians(p.lat)) *
              cos(radians(p.lng) - radians(${lng})) +
              sin(radians(${lat})) * sin(radians(p.lat))
            )
          )
        ) <= ${radiusKm}
      ORDER BY "distanceKm" ASC
      LIMIT ${limit};
    `;

    res.json({
      count: results.length,
      radiusKm,
      results: results.map((r: NearbyRow) => ({
        ...r,
        distanceKm: Number(r.distanceKm.toFixed(2)),
        inStock: r.quantity > 0,
      })),
    });
  } catch (e) { next(e); }
});

export default router;