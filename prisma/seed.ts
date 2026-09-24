/**
 * Medireach seed script (Person 3 owned).
 *
 * Run with: npx prisma db seed
 * Configured via package.json:  "prisma": { "seed": "tsx prisma/seed.ts" }
 *
 * Idempotent — safe to run over and over on the same DB.
 * - Users are upserted by email (unique).
 * - Pharmacies are upserted by name (assumed unique demo key).
 * - Medicines are upserted by the composite @@unique([name, strength, form]).
 * - Inventory is upserted by composite @@id([pharmacyId, medicineId]) via
 *   Prisma's upsert which targets the @@id when you pass both fields in where.
 * - Patient/Doctor sub-records are created within the user upsert via nested
 *   create, so they exist the first time and don't error on repeat runs.
 * - Q&A demo records use clean-up-then-create for idempotency.
 * - Admin bootstrap is unconditional (as required: admin API endpoint is
 *   locked down, this seed is the only way to create the first admin).
 */
import "dotenv/config";
import bcrypt from "bcrypt";
import { prisma } from "../src/lib/prisma.js";
import type {
  Prisma,
  Role,
  QuestionStatus,
  NotificationType,
  NotificationChannel,
} from "@prisma/client";
import { QuestionStatus as QS } from "@prisma/client";
import { NotificationType as NT } from "@prisma/client";
import { NotificationChannel as NC } from "@prisma/client";

const SALT_ROUNDS = 10;
const DEMO_PASSWORD = "password123";

const hash = (plain: string) => bcrypt.hashSync(plain, SALT_ROUNDS);

type DemoUser = {
  email: string;
  fullName: string;
  role: Role;
  phone?: string;
  pharmacyName?: string;       // pharmacists link to a pharmacy by name
  patientData?: {              // nested patient sub-record
    address?: string;
    lat?: number;
    lng?: number;
    preferredPharmacyName?: string;
  };
  doctorData?: {               // nested doctor sub-record (hospitalName REQUIRED)
    hospitalName: string;
    specialty?: string;
  };
};

const PHARMACIES = [
  {
    name: "Downtown Family Pharmacy",
    address: "123 Main Street, Addis Ababa",
    lat: 9.03,
    lng: 38.74,
    phone: "+251111234567",
    openTime: "08:00",
    closeTime: "22:00",
    verified: true,
  },
  {
    name: "Uptown Care Pharmacy",
    address: "456 Bole Road, Addis Ababa",
    lat: 9.01,
    lng: 38.78,
    phone: "+251117654321",
    openTime: "07:30",
    closeTime: "23:00",
    verified: true,
  },
  {
    name: "Suburban Relief Pharmacy",
    address: "789 Meskel Flower Avenue, Addis Ababa",
    lat: 8.99,
    lng: 38.76,
    phone: "+251119988776",
    openTime: "09:00",
    closeTime: "21:00",
    verified: false,
  },
] as const;

const MEDICINES = [
  { name: "Tylenol", genericName: "acetaminophen", form: "TABLET", strength: "500 mg", requiresPrescription: false, stockByPharmacyIdx: [240, 310, 180], priceByPharmacyIdx: [120.0, 130.0, 125.0] },
  { name: "Advil", genericName: "ibuprofen", form: "TABLET", strength: "200 mg", requiresPrescription: false, stockByPharmacyIdx: [190, 220, 150], priceByPharmacyIdx: [140.0, 150.0, 145.0] },
  { name: "Lipitor", genericName: "atorvastatin", form: "TABLET", strength: "20 mg", requiresPrescription: true, stockByPharmacyIdx: [120, 150, 90], priceByPharmacyIdx: [850.0, 860.0, 840.0] },
  { name: "Metformin", genericName: "metformin HCl", form: "TABLET", strength: "500 mg", requiresPrescription: true, stockByPharmacyIdx: [360, 410, 270], priceByPharmacyIdx: [220.0, 230.0, 225.0] },
  { name: "Lisinopril", genericName: "lisinopril", form: "TABLET", strength: "10 mg", requiresPrescription: true, stockByPharmacyIdx: [210, 240, 160], priceByPharmacyIdx: [310.0, 320.0, 315.0] },
  { name: "Amlodipine", genericName: "amlodipine besylate", form: "TABLET", strength: "5 mg", requiresPrescription: true, stockByPharmacyIdx: [180, 200, 140], priceByPharmacyIdx: [290.0, 300.0, 295.0] },
  { name: "Prilosec", genericName: "omeprazole", form: "CAPSULE", strength: "20 mg", requiresPrescription: false, stockByPharmacyIdx: [150, 170, 120], priceByPharmacyIdx: [380.0, 390.0, 385.0] },
  { name: "Amoxil", genericName: "amoxicillin", form: "CAPSULE", strength: "500 mg", requiresPrescription: true, stockByPharmacyIdx: [80, 95, 60], priceByPharmacyIdx: [460.0, 470.0, 465.0] },
  { name: "Zoloft", genericName: "sertraline", form: "TABLET", strength: "50 mg", requiresPrescription: true, stockByPharmacyIdx: [70, 85, 55], priceByPharmacyIdx: [960.0, 970.0, 965.0] },
  { name: "Ventolin HFA", genericName: "albuterol", form: "INHALER", strength: "90 mcg/puff", requiresPrescription: true, stockByPharmacyIdx: [30, 35, 22], priceByPharmacyIdx: [1850.0, 1860.0, 1855.0] },
] as const;

const USERS: DemoUser[] = [
  {
    email: "admin@medireach.et",
    fullName: "Admin Alice",
    role: "ADMIN",
    phone: "+251911000001",
  },
  {
    email: "betty.patient@medireach.et",
    fullName: "Betitu (Betty) Bekele",
    role: "PATIENT",
    phone: "+251911111111",
    patientData: {
      address: "Piazza 41, Addis Ababa",
      lat: 9.035,
      lng: 38.745,
      preferredPharmacyName: "Downtown Family Pharmacy",
    },
  },
  {
    email: "charlie.patient@medireach.et",
    fullName: "Charlie Chali",
    role: "PATIENT",
    phone: "+251911222222",
    patientData: {
      address: "Bole Medhane Alem, Addis Ababa",
      lat: 9.012,
      lng: 38.781,
      preferredPharmacyName: "Uptown Care Pharmacy",
    },
  },
  {
    email: "diana.doctor@medireach.et",
    fullName: "Dr. Diana Desta",
    role: "DOCTOR",
    phone: "+251911333333",
    doctorData: {
      hospitalName: "Tikur Anbessa Specialized Hospital",
      specialty: "Internal Medicine — Geriatrics",
    },
  },
  {
    email: "emma.pharmacist@medireach.et",
    fullName: "Emma Eyayu PharmD",
    role: "PHARMACIST",
    phone: "+251911444444",
    pharmacyName: "Downtown Family Pharmacy",
  },
  {
    email: "frank.pharmacist@medireach.et",
    fullName: "Frank Fanta PharmD",
    role: "PHARMACIST",
    phone: "+251911555555",
    pharmacyName: "Uptown Care Pharmacy",
  },
  {
    email: "gina.rider@medireach.et",
    fullName: "Gina Gebre",
    role: "RIDER",
    phone: "+251911666666",
  },
];

async function ensurePharmacyIdByName(
  map: Map<string, string>,
  name?: string
): Promise<string | undefined> {
  if (!name) return undefined;
  if (map.has(name)) return map.get(name)!;
  // Pharmacy.name is not @unique → findFirst, not findUnique.
  const found = await prisma.pharmacy.findFirst({
    where: { name },
    select: { id: true },
  });
  if (found) {
    map.set(name, found.id);
    return found.id;
  }
  return undefined;
}

async function seedPharmacies(): Promise<Map<string, string>> {
  const byName = new Map<string, string>();
  for (const p of PHARMACIES) {
    // Pharmacy.name is NOT declared @unique (Person 1's model), so a true
    // upsert-by-name is impossible. Emulate idempotent seed semantics with
    // findFirst + update/create.
    const existing = await prisma.pharmacy.findFirst({ where: { name: p.name } });
    const created = existing
      ? await prisma.pharmacy.update({ where: { id: existing.id }, data: { ...p } })
      : await prisma.pharmacy.create({ data: { ...p } });
    byName.set(p.name, created.id);
  }
  return byName;
}

async function seedMedicines(): Promise<
  Map<string, { id: string; idx: number }>
> {
  const byKey = new Map<string, { id: string; idx: number }>();
  for (let i = 0; i < MEDICINES.length; i++) {
    const m = MEDICINES[i];
    const created = await prisma.medicine.upsert({
      where: {
        name_strength_form: {
          name: m.name,
          strength: m.strength,
          form: m.form,
        },
      },
      create: {
        name: m.name,
        genericName: m.genericName,
        form: m.form,
        strength: m.strength,
        requiresPrescription: m.requiresPrescription,
      },
      update: {
        genericName: m.genericName,
        requiresPrescription: m.requiresPrescription,
      },
    });
    byKey.set(m.name, { id: created.id, idx: i });
  }
  return byKey;
}

async function seedUsers(
  pharmacyByName: Map<string, string>
): Promise<Map<string, string>> {
  const byEmail = new Map<string, string>();
  const pwHash = hash(DEMO_PASSWORD);

  for (const u of USERS) {
    const preferredPharmacyId = u.patientData?.preferredPharmacyName
      ? pharmacyByName.get(u.patientData.preferredPharmacyName)
      : undefined;
    const pharmacyId = u.pharmacyName
      ? pharmacyByName.get(u.pharmacyName)
      : undefined;

    const createData: Prisma.UserCreateInput = {
      email: u.email,
      passwordHash: pwHash,
      fullName: u.fullName,
      role: u.role,
      phone: u.phone ?? undefined,
    };
    if (pharmacyId) createData.pharmacistAt = { connect: { id: pharmacyId } };

    if (u.role === "PATIENT" && u.patientData) {
      createData.patient = {
        create: {
          address: u.patientData.address ?? undefined,
          lat: u.patientData.lat ?? undefined,
          lng: u.patientData.lng ?? undefined,
          preferredPharmacyId: preferredPharmacyId ?? undefined,
        },
      };
    } else if (u.role === "PATIENT") {
      // Patient sub-record always required per notify-targets endpoint.
      createData.patient = { create: {} };
    }

    if (u.role === "DOCTOR") {
      if (!u.doctorData?.hospitalName) {
        throw new Error(
          `Seeding doctor ${u.email}: hospitalName is required on Doctor sub-record.`
        );
      }
      createData.doctor = {
        create: {
          hospitalName: u.doctorData.hospitalName,
          specialty: u.doctorData.specialty ?? undefined,
        },
      };
    }

    const upserted = await prisma.user.upsert({
      where: { email: u.email },
      update: {
        fullName: createData.fullName,
        role: createData.role,
        phone: createData.phone ?? undefined,
        // FK scalars are not settable on UserUpdateInput — connect via the relation.
        pharmacistAt: pharmacyId ? { connect: { id: pharmacyId } } : undefined,
      },
      create: createData,
    });
    byEmail.set(u.email, upserted.id);
  }

  return byEmail;
}

async function seedInventory(
  pharmacyByName: Map<string, string>,
  medicineByName: Map<string, { id: string; idx: number }>
) {
  for (let p = 0; p < PHARMACIES.length; p++) {
    const pharmacyId = pharmacyByName.get(PHARMACIES[p].name)!;
    for (const m of MEDICINES) {
      const { id: medicineId, idx } = medicineByName.get(m.name)!;
      const quantity = m.stockByPharmacyIdx[p];
      const price = m.priceByPharmacyIdx[p]; // Decimal field accepts numbers directly
      await prisma.inventory.upsert({
        where: {
          pharmacyId_medicineId: { pharmacyId, medicineId },
        },
        create: { pharmacyId, medicineId, quantity, price },
        update: { quantity, price },
      });
    }
  }
}

/* ---------------- Person 3 demo data ---------------- */

async function seedQuestionsNotifications(
  userByEmail: Map<string, string>,
  medicineByName: Map<string, { id: string; idx: number }>
) {
  const bettyId = userByEmail.get("betty.patient@medireach.et")!;
  const charlieId = userByEmail.get("charlie.patient@medireach.et")!;
  const emmaId = userByEmail.get("emma.pharmacist@medireach.et")!;
  const tylenolId = medicineByName.get("Tylenol")!.id;

  // --- Clear old demo rows (idempotent: subsequent runs start clean) ---
  await prisma.notification.deleteMany({
    where: { userId: { in: [bettyId, charlieId] } },
  });
  await prisma.answer.deleteMany({
    where: { question: { patientId: { in: [bettyId, charlieId] } } },
  });
  await prisma.question.deleteMany({
    where: { patientId: { in: [bettyId, charlieId] } },
  });

  // Betty's question (ANSWERED by Emma)
  const q1 = await prisma.question.create({
    data: {
      patientId: bettyId,
      medicineId: tylenolId,
      text: "The label says 'two tablets as needed for pain'. I am 76 years old. What does 'as needed' mean and what is the maximum I should take in one day? Also, does it matter if I take it with food?",
      status: QS.ANSWERED,
      claimedById: emmaId,
    },
  });
  const a1 = await prisma.answer.create({
    data: {
      questionId: q1.id,
      pharmacistId: emmaId,
      text: "Dear Betty — thank you for reaching out. 'As needed' means take 2 tablets (1000 mg total) ONLY when you feel pain or fever, and wait at least 6 hours between doses. Maximum for a 76-year-old adult is 3000 mg (6 tablets of 500 mg) in any 24-hour period, and never more than 2 tablets at one time. Please take them with food or a full glass of water to protect your stomach. Important: do not combine with any other cold/flu pills that already contain acetaminophen (check for 'APAP' on the label) — taking two products together can accidentally exceed the daily limit and hurt your liver. If your pain lasts more than 3 days or gets worse, please call your doctor. Stay safe! — Emma",
    },
  });
  // Notify Betty
  await prisma.notification.create({
    data: {
      userId: bettyId,
      type: NT.QUESTION_ANSWERED,
      channel: NC.IN_APP,
      message:
        "Emma the pharmacist replied to your Tylenol question. Open the app to read her answer.",
      data: { questionId: q1.id, answerId: a1.id } as Prisma.InputJsonValue,
    },
  });
  // Welcome notification (already-read) for Betty
  const welcome1 = await prisma.notification.create({
    data: {
      userId: bettyId,
      type: NT.SYSTEM,
      channel: NC.IN_APP,
      message:
        "Welcome to Medireach, Betty! You can ask any pharmacist a question from the Questions screen.",
    },
  });
  await prisma.notification.update({
    where: { id: welcome1.id },
    data: { readAt: new Date() },
  });

  // Charlie's question (OPEN — pharmacist will answer via the API)
  await prisma.question.create({
    data: {
      patientId: charlieId,
      text: "My regular pill for blood pressure is pink and round. This month when I picked it up, it is white and rectangular. The name on the bottle is still 'Amlodipine 5 mg'. Should I take it? I do not want to take the wrong medicine.",
      status: QS.OPEN,
    },
  });
  // Welcome notification (unread) for Charlie
  await prisma.notification.create({
    data: {
      userId: charlieId,
      type: NT.SYSTEM,
      channel: NC.IN_APP,
      message:
        "Welcome to Medireach! A pharmacist is ready to answer any question you have about your medicines.",
    },
  });
}

async function main() {
  const t0 = Date.now();
  console.log("🌱 Medireach seed starting…");
  console.log("  ├── Upserting pharmacies…");
  const pharmacyByName = await seedPharmacies();
  console.log(`  │   ✓ ${PHARMACIES.length} pharmacies (natural key = name)`);
  console.log("  ├── Upserting medicines…");
  const medicineByName = await seedMedicines();
  console.log(`  │   ✓ ${MEDICINES.length} medicines (natural key = name+strength+form)`);
  console.log("  ├── Upserting users (with Patient/Doctor sub-records)…");
  const userByEmail = await seedUsers(pharmacyByName);
  console.log(`  │   ✓ ${USERS.length} users (password: ${DEMO_PASSWORD}) — role distribution:`);
  const counts: Record<string, number> = {};
  for (const u of USERS) counts[u.role] = (counts[u.role] ?? 0) + 1;
  for (const [role, c] of Object.entries(counts)) console.log(`  │     - ${role}: ${c}`);
  console.log("  ├── Upserting pharmacy inventory (3 pharmacies × 10 medicines = 30 rows)…");
  await seedInventory(pharmacyByName, medicineByName);
  console.log("  │   ✓ 30 inventory rows upserted (composite key = pharmacyId × medicineId)");
  console.log("  ├── Creating Person 3 demo Q&A + notifications…");
  await seedQuestionsNotifications(userByEmail, medicineByName);
  console.log("  │   ✓ 2 sample questions (1 answered, 1 open)");
  console.log("  │   ✓ 1 pharmacist answer");
  console.log("  │   ✓ 3 notifications");
  const dur = Math.round((Date.now() - t0) / 100) / 10;
  console.log(`  └── Seed complete in ${dur}s. Admin bootstrap email = admin@medireach.et`);
}

main()
  .catch((err) => {
    console.error("❌ Seed failed:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
