import { defineConfig } from "prisma/config";

// Dùng chung file .env ở gốc monorepo; môi trường production truyền biến qua Docker.
try {
  process.loadEnvFile("../../.env");
} catch {}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
