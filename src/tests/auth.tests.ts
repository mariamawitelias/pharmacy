import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import app from "../app.js";
import { prisma } from "../lib/prisma.js";

let adminToken: string;
let patientToken: string;
let pharmacyId: string;
let medicineId: string;

describe("Auth & RBAC", () => {
  beforeAll(async () => {
    const email = `admin-test-${Date.now()}@medireach.com`;
    const res = await request(app).post("/auth/admin/register").send({
      email, password: "password123", fullName: "Test Admin",
    }).catch(() => null);

    if (!res || res.status !== 201) {
      const login = await request(app).post("/auth/admin/login").send({
        email: "admin@medireach.com", password: "password123",
      });
      adminToken = login.body.token;
    } else {
      adminToken = res.body.token;
    }

    const patientRes = await request(app).post("/auth/patient/register").send({
      email: `patient-test-${Date.now()}@example.com`,
      password: "password123",
      fullName: "Test Patient",
    });
    patientToken = patientRes.body.token;
  });

  it("rejects registration with an invalid email", async () => {
    const res = await request(app).post("/auth/patient/register").send({
      email: "not-an-email", password: "password123", fullName: "Bad Email",
    });
    expect(res.status).toBe(400);
  });

  it("rejects login with wrong password", async () => {
    const res = await request(app).post("/auth/patient/login").send({
      email: "patient@example.com", password: "wrongpassword",
    });
    expect(res.status).toBe(401);
  });

  it("blocks a patient from creating a medicine (RBAC)", async () => {
    const res = await request(app)
      .post("/medicines")
      .set("Authorization", `Bearer ${patientToken}`)
      .send({ name: "Should Fail", form: "Tablet" });
    expect(res.status).toBe(403);
  });

  it("rejects pharmacist registration with no auth token", async () => {
    const res = await request(app).post("/auth/pharmacist/register").send({
      email: "sneaky@test.com", password: "password123",
      fullName: "Sneaky", pharmacyId: "00000000-0000-0000-0000-000000000000",
    });
    expect(res.status).toBe(401);
  });

  it("rejects a doctor registered with the old licenseNumber field", async () => {
    const res = await request(app).post("/auth/doctor/register").send({
      email: `doc-${Date.now()}@test.com`, password: "password123",
      fullName: "Old Field Doc", licenseNumber: "ABC123",
    });
    expect(res.status).toBe(400);
  });

  it("returns empty results for nearby search with no matching stock", async () => {
    const res = await request(app).get(
      "/pharmacies/nearby?lat=9.03&lng=38.74&medicineId=00000000-0000-0000-0000-000000000000&radiusKm=15"
    );
    expect(res.status).toBe(200);
    expect(res.body.results).toEqual([]);
  });
});