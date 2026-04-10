import { hashPassword } from "better-auth/crypto";
import { envVars } from "../config/env";
import { UserRole } from "../constants/user";
import { prisma } from "../lib/prisma";

/**
 * Idempotent Admin Seeding Logic.
 * Reconciles both User and linked Account state to ensure a functional admin.
 */
export const seedAdmin = async () => {
  const { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME } = envVars;

  // 1. Pre-validation: Fail fast if credentials are missing
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD || !ADMIN_NAME) {
    console.error("❌ ADMIN_NAME, ADMIN_EMAIL, or ADMIN_PASSWORD not configured. Skipping seed.");
    throw new Error("Missing admin credentials in environment variables.");
  }

  try {
    console.log(`Starting admin seed for: ${ADMIN_EMAIL}`);

    // 2. Deterministic Password Hashing
    // We use Better Auth's internal helper to ensure matching format
    const hashedPassword = await hashPassword(ADMIN_PASSWORD);

    // 3. Upsert User (Self-healing reconciliation)
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

    // 4. Upsert Account Linkage (Credential recovery)
    // Reconcile the linked account record to ensure login eligibility
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
    throw error; // Propagate to runSeedAdmin.ts for process.exit(1)
  }
};

