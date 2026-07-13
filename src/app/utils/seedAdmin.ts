import "dotenv/config";

import { hashPassword } from "better-auth/crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client";
import { UserRole } from "../constants/user";

function getRequiredSeedEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required for pnpm seed:admin`);
  }

  return value;
}

/**
 * Idempotent Admin Seeding Logic.
 * Reconciles both User and linked Account state to ensure a functional admin.
 */
export const seedAdmin = async () => {
  const ADMIN_EMAIL = getRequiredSeedEnv("ADMIN_EMAIL");
  const ADMIN_PASSWORD = getRequiredSeedEnv("ADMIN_PASSWORD");
  const ADMIN_NAME = getRequiredSeedEnv("ADMIN_NAME");
  const DATABASE_URL = getRequiredSeedEnv("DATABASE_URL");

  const adapter = new PrismaPg({ connectionString: DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  try {
    console.log(`Starting admin seed for: ${ADMIN_EMAIL}`);

    // We use Better Auth's helper to ensure the credential hash format matches login.
    const hashedPassword = await hashPassword(ADMIN_PASSWORD);

    const user = await prisma.user.upsert({
      where: { email: ADMIN_EMAIL },
      update: {
        name: ADMIN_NAME,
        role: UserRole.ADMIN,
        emailVerified: true,
        isActive: true,
        isDeleted: false,
        isBanned: false,
        deletedAt: null,
      },
      create: {
        email: ADMIN_EMAIL,
        name: ADMIN_NAME,
        role: UserRole.ADMIN,
        emailVerified: true,
        isActive: true,
      },
    });

    console.log(`✅ User state reconciled for: ${user.email}`);

    await prisma.account.upsert({
      where: {
        providerId_accountId: {
          providerId: "credential",
          accountId: ADMIN_EMAIL,
        },
      },
      update: {
        password: hashedPassword,
        userId: user.id,
      },
      create: {
        userId: user.id,
        providerId: "credential",
        accountId: ADMIN_EMAIL,
        password: hashedPassword,
      },
    });

    console.log(`✅ Credential account reconciled for: ${ADMIN_EMAIL}`);
    console.log("🚀 Admin reconciliation complete.");
  } catch (error) {
    console.error("❌ Seed failed during reconciliation:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
};

