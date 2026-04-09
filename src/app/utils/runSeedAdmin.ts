import { seedAdmin } from "./seedAdmin";
import { prisma } from "../lib/prisma";

async function main() {
  await seedAdmin();
}

main()
  .then(() => {
    console.log("✅ Admin seed script completed");
  })
  .catch((error) => {
    console.error("❌ Admin seed script failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
