// Prisma 7 config — the CLI no longer reads DATABASE_URL from the schema
// file or the legacy "prisma" key in package.json; everything lives here.
// NOTE: Prisma 7 auto-detects this file by the exact name `prisma.config.ts`.
// (Person 1's branch has a `prisma7.config.ts` — it needs renaming to this
// canonical name for `prisma migrate` to find the connection URL.)
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
