import { Prisma } from "../../../generated/prisma/client";

/**
 * Visibility rules shared by every public catalog surface, including the AI
 * shopping assistant. Keep this in one place so the storefront and AI tools
 * cannot drift apart.
 */
export const buildPublicMedicineWhere = (): Prisma.MedicineWhereInput => {
  return {
    isActive: true,
    isDeleted: false,
    category: {
      is: {
        isActive: true,
        isDeleted: false,
      },
    },
    seller: {
      is: {
        role: "SELLER",
        emailVerified: true,
        isActive: true,
        isBanned: false,
        isDeleted: false,
      },
    },
  };
};
