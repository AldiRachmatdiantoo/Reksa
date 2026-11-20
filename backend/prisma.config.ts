import { defineConfig } from 'prisma/config';

// The Prisma CLI (migrate, studio) connects as the schema OWNER via
// MIGRATION_DATABASE_URL. The running app never uses this URL: it connects as
// app_service_user through the pg adapter (DATABASE_URL) in src/config/prisma.ts.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.MIGRATION_DATABASE_URL ?? '',
  },
});
