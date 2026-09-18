// =============================================================
// Person 3 — prisma/seed.js
// Idempotent seed: uses upsert where possible so running it
// twice is safe.
// =============================================================

const { PrismaClient, Role, QuestionStatus, NotificationType, NotificationChannel } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();
const SALT_ROUNDS = 10;
const PASSWORD_PLAIN = 'password123';

async function hashPassword(pw) {
  return bcrypt.hash(pw, SALT_ROUNDS);
}

// ------------------------- Users ------------------------------
async function seedUsers() {
  const pwHash = await hashPassword(PASSWORD_PLAIN);

  const users = [
    { email: 'admin@medireach.test', firstName: 'Alice', lastName: 'Admin', role: Role.ADMIN, phone: '+15550000001' },
    { email: 'patient1@medireach.test', firstName: 'Betty', lastName: 'Patient', role: Role.PATIENT, phone: '+15550000002' },
    { email: 'patient2@medireach.test', firstName: 'Charlie', lastName: 'Patient', role: Role.PATIENT, phone: '+15550000003' },
    { email: 'doctor1@medireach.test', firstName: 'Diana', lastName: 'Doctor', role: Role.DOCTOR, phone: '+15550000004' },
    { email: 'pharmacist1@medireach.test', firstName: 'Emma', lastName: 'PharmD', role: Role.PHARMACIST, phone: '+15550000005' },
    { email: 'pharmacist2@medireach.test', firstName: 'Frank', lastName: 'PharmD', role: Role.PHARMACIST, phone: '+15550000006' },
    { email: 'rider1@medireach.test', firstName: 'Gina', lastName: 'Rider', role: Role.RIDER, phone: '+15550000007' },
  ];

  for (const u of users) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: { firstName: u.firstName, lastName: u.lastName, role: u.role, phone: u.phone },
      create: { ...u, password: pwHash },
    });
  }
  console.log(`  ✅ Seeded ${users.length} users (all password: "${PASSWORD_PLAIN}")`);
  return Object.fromEntries(users.map((u) => [u.email.split('@')[0], u.email]));
}

// ----------------------- Pharmacies --------------------------
// ⚠️ TEMPORARY PLACEHOLDER — uses placeholder Pharmacy model owned by Person 1.
async function seedPharmacies() {
  const pharmacies = [
    { name: 'Medireach Downtown Pharmacy', address: '123 Main St, Downtown', latitude: 40.7128, longitude: -74.0060 },
    { name: 'Medireach Uptown Pharmacy', address: '456 Oak Ave, Uptown', latitude: 40.7831, longitude: -73.9712 },
    { name: 'Medireach Suburban Pharmacy', address: '789 Pine Rd, Suburbia', latitude: 40.7484, longitude: -73.9857 },
  ];

  for (const p of pharmacies) {
    await prisma.pharmacy.upsert({
      where: { id: (pharmacies.indexOf(p) + 1) },
      update: p,
      create: p,
    });
  }
  console.log(`  ✅ Seeded ${pharmacies.length} pharmacies`);
  return pharmacies;
}

// ------------------------ Medicines ---------------------------
// ⚠️ TEMPORARY PLACEHOLDER — uses placeholder Medicine model owned by Person 1.
async function seedMedicines() {
  const medicines = [
    { name: 'Tylenol', genericName: 'Acetaminophen', form: 'tablet', prescriptionRequired: false },
    { name: 'Advil', genericName: 'Ibuprofen', form: 'tablet', prescriptionRequired: false },
    { name: 'Lipitor', genericName: 'Atorvastatin', form: 'tablet', prescriptionRequired: true },
    { name: 'Metformin', genericName: 'Metformin HCl', form: 'tablet', prescriptionRequired: true },
    { name: 'Lisinopril', genericName: 'Lisinopril', form: 'tablet', prescriptionRequired: true },
    { name: 'Amlodipine', genericName: 'Amlodipine Besylate', form: 'tablet', prescriptionRequired: true },
    { name: 'Omeprazole', genericName: 'Omeprazole', form: 'capsule', prescriptionRequired: false },
    { name: 'Amoxicillin', genericName: 'Amoxicillin', form: 'capsule', prescriptionRequired: true },
    { name: 'Zoloft', genericName: 'Sertraline HCl', form: 'tablet', prescriptionRequired: true },
    { name: 'Ventolin HFA', genericName: 'Albuterol Sulfate', form: 'inhaler', prescriptionRequired: true },
  ];

  for (let i = 0; i < medicines.length; i++) {
    await prisma.medicine.upsert({
      where: { id: i + 1 },
      update: medicines[i],
      create: medicines[i],
    });
  }
  console.log(`  ✅ Seeded ${medicines.length} medicines`);
  return medicines;
}

// ----------------------- Inventory ----------------------------
// Person 1 owns the Inventory model. Until they define it, we log
// what the seed *would* insert. Their model should have:
//   pharmacyId (FK→Pharmacy), medicineId (FK→Medicine), stock Int, price Decimal
function seedInventoryLog(pharmacies, medicines) {
  const stockMatrix = [];
  for (let p = 1; p <= pharmacies.length; p++) {
    for (let m = 1; m <= medicines.length; m++) {
      stockMatrix.push({
        pharmacyId: p,
        medicineId: m,
        stock: ((p * m * 7) % 120) + 5,
        price: Number((((p + m) * 1.37) % 120 + 4.99).toFixed(2)),
      });
    }
  }
  console.log(`  ℹ️  Inventory: ${stockMatrix.length} rows ready (Person 1: enable upserts in seed.js once Inventory model exists)`);
  return stockMatrix;
}

// ------------------- Questions + Answers ----------------------
async function seedQuestionsAndAnswers(userIdByEmail) {
  const patient1 = await prisma.user.findUnique({ where: { email: userIdByEmail.patient1 } });
  const patient2 = await prisma.user.findUnique({ where: { email: userIdByEmail.patient2 } });
  const pharmacist1 = await prisma.user.findUnique({ where: { email: userIdByEmail.pharmacist1 } });
  const tylenol = await prisma.medicine.findFirst({ where: { name: 'Tylenol' } });

  // --- Q1: answered question from patient1 re: Tylenol ---
  const q1Where = { id: 1 };
  const q1Payload = {
    patientId: patient1.id,
    medicineId: tylenol?.id ?? null,
    text: "Hi, I'm 76 years old and my doctor said I can take Tylenol for my back pain. How many can I take in one day, and should I take it with food?",
    status: QuestionStatus.ANSWERED,
    claimedById: pharmacist1.id,
  };
  await prisma.question.upsert({
    where: q1Where,
    update: q1Payload,
    create: { id: 1, ...q1Payload },
  });
  await prisma.answer.upsert({
    where: { id: 1 },
    update: {
      questionId: 1,
      pharmacistId: pharmacist1.id,
      text: "Hello! For adults your age, we usually recommend no more than 3,000 mg of acetaminophen (Tylenol) per day — that's typically 6 extra-strength (500 mg) tablets spread out evenly. Taking it with a small snack or meal is gentler on your stomach. If you're also taking a cold medicine or sleep aid, please check its label — many already contain acetaminophen and combining them can be unsafe. If the pain doesn't improve in a week, call your doctor to talk about other options.",
    },
    create: {
      id: 1,
      questionId: 1,
      pharmacistId: pharmacist1.id,
      text: "Hello! For adults your age, we usually recommend no more than 3,000 mg of acetaminophen (Tylenol) per day — that's typically 6 extra-strength (500 mg) tablets spread out evenly. Taking it with a small snack or meal is gentler on your stomach. If you're also taking a cold medicine or sleep aid, please check its label — many already contain acetaminophen and combining them can be unsafe. If the pain doesn't improve in a week, call your doctor to talk about other options.",
    },
  });

  // --- Q2: open question from patient2 ---
  const q2Payload = {
    patientId: patient2.id,
    prescriptionId: null,
    text: 'My new pills look different than last month — same name on the bottle but the tablet is pink instead of white. Is it still the same medicine, or did I get the wrong one? I am worried about taking it.',
    status: QuestionStatus.OPEN,
  };
  await prisma.question.upsert({
    where: { id: 2 },
    update: q2Payload,
    create: { id: 2, ...q2Payload },
  });

  console.log(`  ✅ Seeded 2 questions (1 answered, 1 open) + 1 answer`);
  return { patient1, patient2, pharmacist1 };
}

// ---------------------- Notifications -------------------------
async function seedNotifications(userIdByEmail, patient1Id) {
  const patient1 = await prisma.user.findUnique({ where: { email: userIdByEmail.patient1 } });
  const patient2 = await prisma.user.findUnique({ where: { email: userIdByEmail.patient2 } });

  const sample = [
    {
      userId: patient1.id,
      type: NotificationType.QUESTION_ANSWERED,
      message: 'Your question about Tylenol has been answered by a pharmacist.',
      data: { questionId: 1 },
      channel: NotificationChannel.IN_APP,
    },
    {
      userId: patient1.id,
      type: NotificationType.SYSTEM,
      message: 'Welcome to Medireach! If you need help using the app, just ask us a question and a pharmacist will reply.',
      data: null,
      channel: NotificationChannel.IN_APP,
      readAt: new Date(),
    },
    {
      userId: patient2.id,
      type: NotificationType.SYSTEM,
      message: 'Welcome to Medireach! You can ask a pharmacist any question about your medicines.',
      data: null,
      channel: NotificationChannel.IN_APP,
    },
  ];

  for (let i = 0; i < sample.length; i++) {
    await prisma.notification.upsert({
      where: { id: i + 1 },
      update: sample[i],
      create: { id: i + 1, ...sample[i] },
    });
  }
  console.log(`  ✅ Seeded ${sample.length} notifications`);
}

// --------------------------- Main -----------------------------
async function main() {
  console.log('🌱 Seeding Medireach demo data...\n');
  const userIdByEmail = await seedUsers();
  const pharmacies = await seedPharmacies();
  const medicines = await seedMedicines();
  seedInventoryLog(pharmacies, medicines);
  const { patient1 } = await seedQuestionsAndAnswers(userIdByEmail);
  await seedNotifications(userIdByEmail, patient1?.id);
  console.log('\n✅ Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
