import { seedAdmin } from "./seedAdmin";

/**
 * CLI Runner for the admin seed script.
 * Exits with code 1 on failure to ensure visibility in CI/CD and deployment logs.
 */
async function run() {
  try {
    await seedAdmin();
    console.log("🚀 Admin seed process completed successfully.");
    process.exit(0);
  } catch (error) {
    console.error("❌ Admin seed process failed with a fatal error.");
    console.error(error);
    process.exit(1);
  }
}

run();
