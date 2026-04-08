import "dotenv/config";
import { prisma } from "../lib/prisma";

async function seedAdmin() {
  const name = process.env.ADMIN_NAME;
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  const apiUrl = process.env.API_URL || "http://localhost:5000";

  if (!name || !email || !password) {
    throw new Error(
      "Missing ADMIN_NAME / ADMIN_EMAIL / ADMIN_PASSWORD in .env"
    );
  }

  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    await prisma.user.update({
      where: { email },
      data: {
        role: "ADMIN",
        emailVerified: true,
        isBanned: false,
      },
    });

    console.log("✅ Admin already exists. Updated role + verified.");
    return;
  }

  const res = await fetch(`${apiUrl}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password }),
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    console.error("❌ better-auth signup failed:", data);
    throw new Error("Admin signup failed");
  }

  await prisma.user.update({
    where: { email },
    data: {
      role: "ADMIN",
      emailVerified: true,
      isBanned: false,
    },
  });

  console.log("✅ Admin seeded successfully:", email);
}

seedAdmin()
  .catch((e) => {
    console.error("❌ seedAdmin error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
