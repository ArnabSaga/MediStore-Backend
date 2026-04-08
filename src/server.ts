import app from "./app";
import { prisma } from './app/lib/prisma';

const PORT = process.env.PORT;

async function main() {
  try {
    await prisma.$connect();
    console.log("Conneted to the database successfully");

    app.listen(PORT, () => {
      console.log(`Server is running on http://localhost:${PORT}`);
    });
  } catch (error: any) {
    console.error("An error occurred", error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

main();
