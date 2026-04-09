import { Server } from "http";
import app from "./app";
import { envVars } from "./app/config/env";
import { prisma } from "./app/lib/prisma";
import { seedAdmin } from './app/utils/seedAdmin';

let server: Server;
let isShuttingDown = false;

const shutdown = async (signal: string, exitCode: number, isException = false) => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`🛑 ${signal} triggered, shutting down...`);

  const forceShutdownTimeout = setTimeout(() => {
    console.error("❌ Forced shutdown due to timeout");
    process.exit(1);
  }, 10000);

  forceShutdownTimeout.unref();

  try {
    if (server && !isException) {
      const serverWithCloseIdle = server as Server & {
        closeIdleConnections?: () => void;
      };

      if (typeof serverWithCloseIdle.closeIdleConnections === "function") {
        serverWithCloseIdle.closeIdleConnections();
      }

      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });

      console.log("👋 Server closed");
    } else if (isException) {
      console.log("⚠️ Skipping graceful server drain due to unstable process state.");
    }

    await prisma.$disconnect();
    console.log("🗃️ Database disconnected successfully");

    clearTimeout(forceShutdownTimeout);
    process.exit(exitCode);
  } catch (error) {
    clearTimeout(forceShutdownTimeout);
    console.error("❌ Error during shutdown sequence:", error);
    process.exit(1);
  }
};

process.on("uncaughtException", (err) => {
  console.error("😈 Uncaught Exception detected:", err);
  shutdown("uncaughtException", 1, true);
});

process.on("unhandledRejection", (err) => {
  console.error("😈 Unhandled Rejection detected:", err);
  shutdown("unhandledRejection", 1, true);
});

process.on("SIGTERM", () => {
  shutdown("SIGTERM", 0);
});

process.on("SIGINT", () => {
  shutdown("SIGINT", 0);
});

async function main() {
  try {
    await seedAdmin();

    await prisma.$connect();
    console.log("🗃️ Database connected successfully");

    server = app.listen(envVars.PORT, () => {
      console.log(`🚀 Server is listening on port ${envVars.PORT}`);
    });
  } catch (err) {
    console.error("❌ Failed to start server:", err);
    await prisma.$disconnect().catch(() => {});
    process.exit(1);
  }
}

void main();
