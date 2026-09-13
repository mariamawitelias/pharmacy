# Medireach- Pharmacy Delivery & Prescription Management System

## Project Title & Overview

THis is a backend platform connecting **patients**, **doctors**, and **pharmacies** in one system. Doctors can issue prescriptions and route them directly to a patient's preferred pharmacy, while patients can also search independently for the **nearest pharmacy** that has their prescribed medicine in stock. Once confirmed, patients choose **pickup** or **delivery**, with real-time order tracking throughout. A built-in **Q&A module** lets patients ask licensed pharmacists questions about their medication.

A core design goal is **accessibility for older adults**, who are often the heaviest users of prescription medication but the least comfortable with complex apps. The system is built so that a simple, low-friction frontend (large text, minimal steps, guardian/family-assisted accounts, phone-call/SMS fallback options) can sit on top of it — the backend supports this by keeping flows short, statuses always human-readable, and every action reversible or explainable via the Q&A/notification system.


## Core Features & API Scope

### 1. Authentication & Users
- Register/login (patient, doctor, pharmacist, rider, admin roles)
- Role-based access control (RBAC) via middleware
- Optional **caregiver/family-linked accounts** — a family member can manage orders on behalf of an elderly patient
- `POST /auth/register`, `POST /auth/login`, `GET /users/me`, `PATCH /users/me`

### 2. Doctor-to-Pharmacy E-Prescribing
- Doctors issue prescriptions tied to a patient + medicine(s) + destination pharmacy
- Patient-doctor linking so doctors have a defined patient list
- `POST /prescriptions`, `GET /prescriptions/:id`, `PATCH /prescriptions/:id/status`, `GET /patients/:id/prescriptions`

### 3. Pharmacy, Inventory & Geolocation Search
- Pharmacies manage stock + pricing per medicine
- **Nearest pharmacy with stock** search (radius query using lat/long)
- `GET /pharmacies/nearby?lat=&lng=&medicineId=`, `GET /pharmacies/:id/inventory`, `PATCH /pharmacies/:id/inventory`

### 4. Orders & Delivery
- Full order lifecycle: `placed → confirmed → ready/out for delivery → completed`
- Fulfillment type: pickup or delivery
- Simple, always-current status the frontend can show in plain language (important for older users — no jargon, just "Your medicine is on its way")
- `POST /orders`, `GET /orders/:id`, `PATCH /orders/:id/status`, `GET /orders/:id/track`

### 5. Patient–Pharmacist Q&A
- Patients submit a question (optionally tied to a medicine/prescription)
- Verified pharmacists claim and answer from an open queue
- Doubles as a support channel for older patients who are unsure how to use the app or understand their medication
- `POST /questions`, `GET /questions/:id`, `POST /questions/:id/answer`, `GET /questions?status=open`

### 6. Notifications
- Status updates for prescriptions, orders, and answered questions
- Designed to support multiple channels (in-app, SMS, email) so older users aren't dependent on checking an app
- `GET /notifications`, `PATCH /notifications/:id/read`


## Tech Stack

- **Runtime:** Node.js
- **ORM:** Prisma
- **Database:** PostgreSQL
- **Validation:** Zod (for request/response schema validation)
- **Auth:** JWT-based authentication with RBAC middleware
- **API Style:** REST

---

## 🗂️ Core Entities

| Entity | Description |
|---|---|
| **User** | Base identity with a role: patient, doctor, pharmacist, rider, admin |
| **Patient** | Extends user; has preferred pharmacy, linked doctors, optional caregiver link |
| **Doctor** | Extends user; issues prescriptions to linked patients |
| **Pharmacy** | Location (lat/long), operating hours, verification status |
| **Medicine** | Name, generic name, form, prescription-required flag |
| **Inventory** | Per-pharmacy stock + price for each medicine |
| **Prescription** | Issued by a doctor, tied to patient + medicine(s) + pharmacy |
| **Order** | Patient + pharmacy + items + fulfillment type + status |
| **Delivery** | Rider assignment, tracking status, ETA (for delivery orders only) |
| **Question / Answer** | Patient-submitted question, answered by a verified professional |


## ♿ Accessibility Focus: Designed to Help Older People

- **Caregiver-assisted accounts** — a family member can be linked to an elderly patient's account to help manage prescriptions and orders
- **Plain-language order statuses** — backend returns human-readable status text, not just codes, so any frontend can display it simply
- **Multi-channel notifications** — SMS/call fallback for patients who don't rely on smartphone apps
- **Q&A as a support line** — older patients can ask basic questions ("how do I take this?") without needing to navigate a complex UI
- **Minimal required steps** — prescription-to-pharmacy routing (doctor-initiated) reduces the number of actions an elderly patient has to take themselves



## 🔄 Prescription & Order Flow

1. **Doctor issues prescription** → selects patient → selects medicine(s) → sends to patient's preferred pharmacy
2. **Pharmacy confirms** — checks stock/legitimacy, accepts or rejects/redirects
3. **Patient (or caregiver) chooses fulfillment**: pickup or delivery
4. **Order status progresses**: `placed → confirmed → ready/out for delivery → completed`
5. *(Alternative path)* Patient can **search nearest pharmacy with stock** directly and place an order themselves



