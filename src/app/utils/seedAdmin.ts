import { fromNodeHeaders } from "better-auth/node";
import "dotenv/config";
import { envVars } from "../config/env";
import { UserRole } from "../constants/user";
import { auth } from "../lib/auth";
import { prisma } from "../lib/prisma";

export const seedAdmin = async () => {
  try {
    if (!envVars.ADMIN_EMAIL || !envVars.ADMIN_PASSWORD || !envVars.ADMIN_NAME) {
      console.warn("⚠️ Admin credentials are not fully configured. Skipping admin seed.");
      return;
    }

    const isAdminExist = await prisma.user.findFirst({
      where: {
        role: UserRole.ADMIN,
      },
    });

    if (isAdminExist) {
      console.log("Admin already exists. Skipping seeding admin.");
      return;
    }

    const response = await auth.api.signUpEmail({
      body: {
        email: envVars.ADMIN_EMAIL,
        password: envVars.ADMIN_PASSWORD,
        name: envVars.ADMIN_NAME,
        role: UserRole.ADMIN,
        isActive: true,
        isDeleted: false,
        isBanned: false,
      },
      headers: fromNodeHeaders({}),
      asResponse: true,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error((errorData as { message?: string })?.message || "Failed to sign up admin");
    }

    const data = (await response.json()) as { user?: { id?: string } };
    const userId = data?.user?.id;

    if (!userId) {
      throw new Error("Admin user was created without a valid user id");
    }

    await prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        emailVerified: true,
      },
    });

    const admin = await prisma.user.findUnique({
      where: {
        email: envVars.ADMIN_EMAIL,
      },
    });

    console.log("✅ Admin Created Successfully:", admin?.email);
  } catch (error) {
    console.error("❌ Failed to seed admin:", error);

    try {
      if (envVars.ADMIN_EMAIL) {
        await prisma.user.delete({
          where: {
            email: envVars.ADMIN_EMAIL,
          },
        });
        console.log("Cleaned up partial admin creation.");
      }
    } catch {
      // Ignore cleanup error
    }
  }
};
