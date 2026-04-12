import { prisma } from "../lib/prisma";

async function checkUser(email: string) {
  console.log(`\n--- Verification for: ${email} ---`);
  
  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      accounts: true,
    },
  });

  if (!user) {
    console.log("❌ User NOT found in 'users' table.");
    return;
  }

  console.log("✅ User found in 'users' table:");
  console.log(`   ID: ${user.id}`);
  console.log(`   Email Verified: ${user.emailVerified}`);
  console.log(`   Active: ${user.isActive}`);
  console.log(`   Deleted: ${user.isDeleted}`);

  if (user.accounts.length === 0) {
    console.log("❌ NO records found in 'accounts' table for this user.");
  } else {
    console.log(`✅ Found ${user.accounts.length} record(s) in 'accounts' table:`);
    user.accounts.forEach((acc, i) => {
      console.log(`   [${i + 1}] Provider: ${acc.providerId}`);
      console.log(`       Account ID: ${acc.accountId}`);
      console.log(`       Password Present: ${!!acc.password}`);
      console.log(`       Linkage Correct: ${acc.userId === user.id}`);
    });
  }
  
  // Also check accounts table directly by accountId to see if it's orphaned
  const orphanedAccount = await prisma.account.findFirst({
    where: { accountId: email, providerId: "credential" },
  });
  
  if (orphanedAccount && orphanedAccount.userId !== user.id) {
    console.log("⚠️ WARNING: Found a credential account for this email linked to a DIFFERENT User ID!");
    console.log(`   Account UserID: ${orphanedAccount.userId}`);
  }
}

const targetEmail = process.argv[2] || "adidey244@gmail.com";
checkUser(targetEmail)
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
