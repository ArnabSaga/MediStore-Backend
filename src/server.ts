import { Server } from "http";
import app from "./app";
import { envVars } from "./app/config/env";
import { prisma } from "./app/lib/prisma";
import { seedAdmin } from "./app/utils/seedAdmin";

let server: Server | undefined;

async function cleanup() {
  console.log("Shutting down server...");
  if (server) {
    server.close();
  }
  await prisma.$disconnect();
  console.log("Cleanup complete.");
}

async function main() {
  try {
    console.log(`[Startup] Initializing application in ${envVars.NODE_ENV} mode...`);

    try {
      await prisma.$connect();
      console.log("✅ Database connected successfully");
    } catch (dbError) {
      console.error("❌ Database connection failed:", dbError);
    }

    if (process.env.VERCEL) {
      console.log("🚀 Server running in Vercel Serverless environment");
    } else {
      server = app.listen(envVars.PORT, () => {
        console.log(`🚀 Server is listening on port ${envVars.PORT}`);
        console.log(`🔗 Auth URL: ${envVars.BETTER_AUTH_URL}`);
      });
    }
  } catch (err) {
    console.error("❌ Fatal startup error:", err);
    if (!process.env.VERCEL) {
      process.exit(1);
    }
  }
}

void main();

if (!process.env.VERCEL) {
  process.on("SIGINT", () => void cleanup().then(() => process.exit(0)));
  process.on("SIGTERM", () => void cleanup().then(() => process.exit(0)));
}

export default app;
