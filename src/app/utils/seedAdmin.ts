import { fromNodeHeaders } from "better-auth/node";
import "dotenv/config";
import { envVars } from "../config/env";
import { UserRole } from "../constants/user";
import { auth } from "../lib/auth";
import { prisma } from "../lib/prisma";

export const seedAdmin = async () => {
  try {
    console.log("🔍 Starting admin seed...");
    console.log("ADMIN_EMAIL:", envVars.ADMIN_EMAIL);
    console.log("ADMIN_NAME:", envVars.ADMIN_NAME);

    if (!envVars.ADMIN_EMAIL || !envVars.ADMIN_PASSWORD || !envVars.ADMIN_NAME) {
      throw new Error(
        "❌ Admin credentials are not fully configured (ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME). Seeding aborted."
      );
    }

    const existingByEmail = await prisma.user.findUnique({
      where: { email: envVars.ADMIN_EMAIL },
    });

    if (existingByEmail) {
      console.log("⚠️ User already exists with admin email:", existingByEmail.email);

      if (existingByEmail.role !== UserRole.ADMIN) {
        await prisma.user.update({
          where: { email: envVars.ADMIN_EMAIL },
          data: {
            role: UserRole.ADMIN,
            emailVerified: true,
            isActive: true,
            isDeleted: false,
            isBanned: false,
            deletedAt: null,
          },
        });

        console.log("✅ Existing user promoted to ADMIN:", envVars.ADMIN_EMAIL);
      }

      return;
    }

    const response = await auth.api.signUpEmail({
      body: {
        email: envVars.ADMIN_EMAIL,
        password: envVars.ADMIN_PASSWORD,
        name: envVars.ADMIN_NAME,
      },
      headers: fromNodeHeaders({}),
      asResponse: true,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("❌ Better Auth signup failed:", errorData);
      throw new Error((errorData as { message?: string })?.message || "Failed to sign up admin");
    }

    const data = (await response.json()) as {
      user?: { id?: string; email?: string };
    };

    const userId = data?.user?.id;

    if (!userId) {
      throw new Error("Admin created without user id");
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        role: UserRole.ADMIN,
        emailVerified: true,
        isActive: true,
        isDeleted: false,
        isBanned: false,
        deletedAt: null,
      },
    });

    console.log("✅ Admin created successfully:", envVars.ADMIN_EMAIL);
  } catch (error) {
    console.error("❌ Failed to seed admin:", error);
  }
};
