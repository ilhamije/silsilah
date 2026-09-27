import "dotenv/config";
import { defineConfig } from "prisma/config";

// Migrations need a direct (unpooled) connection; Neon's pooler does not
// support the session-level features `prisma migrate` relies on.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.SIL7878_DATABASE_URL_UNPOOLED ?? process.env.SIL7878_DATABASE_URL,
  },
});
