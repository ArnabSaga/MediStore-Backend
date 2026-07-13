import { Server } from "http";
import app from "./app";
import { envVars } from "./app/config/env";
import { prisma } from "./app/lib/prisma";

let server: Server | undefined;

async function cleanup() {
  if (server) {
    server.close();
  }
  await prisma.$disconnect();
}

async function main() {
  await prisma.$connect();

  server = app.listen(envVars.PORT, () => {
    console.log(`Server listening on ${envVars.PORT}`);
  });
}

main().catch((error) => {
  console.error("Fatal startup error:", error);
  process.exit(1);
});

process.on("SIGINT", () => void cleanup().then(() => process.exit(0)));
process.on("SIGTERM", () => void cleanup().then(() => process.exit(0)));
