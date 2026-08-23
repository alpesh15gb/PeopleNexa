import "dotenv/config";
import { defineConfig } from "prisma/config";

// Prisma 7 loads this config even for `prisma generate`. Vercel preview builds
// may intentionally run before a runtime database is attached, so generation
// must not fail merely because DATABASE_URL is absent. Database commands and
// the running application should still receive a real DATABASE_URL.
const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:5432/peoplenexa";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: databaseUrl,
  },
});
