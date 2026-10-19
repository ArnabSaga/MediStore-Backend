import dotenv from "dotenv";

dotenv.config({ path: ".env.test", override: false });

process.env.NODE_ENV = "test";
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://test:test@localhost:5432/medistore_test";
process.env.BETTER_AUTH_SECRET =
  process.env.BETTER_AUTH_SECRET ?? "test-only-secret-with-at-least-32-characters";
process.env.BETTER_AUTH_URL = "http://localhost:3000/api/auth";
process.env.FRONTEND_URL = "http://localhost:3000";
process.env.AI_ENABLED = "false";
