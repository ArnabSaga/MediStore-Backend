import { prisma } from "../../lib/prisma";
import { Role } from "../../../generated/prisma/client";

interface UpdateUserProfilePayload {
  name?: string;
  phone?: string;
  image?: string;
}

const getUserById = async (id: string) => {
  if (!id) {
    throw Object.assign(new Error("User id is required"), { statusCode: 400 });
  }

  const result = await prisma.user.findUniqueOrThrow({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      emailVerified: true,
      phone: true,
      image: true,
      role: true,
      isBanned: true,
      createdAt: true,
    },
  });

  return result;
};

const updateUserProfile = async (
  id: string,
  payload: UpdateUserProfilePayload
) => {
  if (!id) {
    throw Object.assign(new Error("User id is required"), { statusCode: 400 });
  }

  const cleanData: Partial<UpdateUserProfilePayload> = {};
  (Object.keys(payload) as (keyof UpdateUserProfilePayload)[]).forEach(
    (key) => {
      const value = payload[key];
      if (value !== undefined) {
        cleanData[key] = value;
      }
    }
  );

  if (Object.keys(cleanData).length === 0) {
    throw Object.assign(new Error("No fields to update"), { statusCode: 400 });
  }

  const result = await prisma.user.update({
    where: { id },
    data: cleanData,
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      image: true,
      role: true,
      createdAt: true,
    },
  });

  return result;
};

const getAllUsers = async (role?: string, isBanned?: boolean) => {
  const where: Record<string, any> = {};

  if (role) {
    const validRoles = ["CUSTOMER", "SELLER", "ADMIN"] as const;
    if (!validRoles.includes(role as any)) {
      throw Object.assign(
        new Error(`Invalid role. Must be one of: ${validRoles.join(", ")}`),
        { statusCode: 400 }
      );
    }
    where.role = role;
  }

  if (isBanned !== undefined) {
    where.isBanned = isBanned;
  }

  const result = await prisma.user.findMany({
    where,
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      isBanned: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return result;
};

const updateUserStatus = async (id: string, isBanned: boolean) => {
  if (!id) {
    throw Object.assign(new Error("User id is required"), { statusCode: 400 });
  }

  const result = await prisma.user.update({
    where: { id },
    data: { isBanned },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isBanned: true,
    },
  });

  return result;
};

const changeUserRole = async (id: string, role: string) => {
  if (!id) {
    throw Object.assign(new Error("User id is required"), { statusCode: 400 });
  }

  const validRoles = ["CUSTOMER", "SELLER", "ADMIN"] as const;
  if (!validRoles.includes(role as any)) {
    throw Object.assign(
      new Error(`Invalid role. Must be one of: ${validRoles.join(", ")}`),
      { statusCode: 400 }
    );
  }

  const result = await prisma.user.update({
    where: { id },
    data: { role: role as Role },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
    },
  });

  return result;
};

const deleteUser = async (id: string, currentUserId?: string) => {
  if (!id) {
    throw Object.assign(new Error("User id is required"), { statusCode: 400 });
  }

  if (currentUserId && id === currentUserId) {
    throw Object.assign(new Error("Cannot delete your own account"), {
      statusCode: 403,
    });
  }

  await prisma.user.delete({ where: { id } });
};

export const UserService = {
  getUserById,
  updateUserProfile,
  getAllUsers,
  updateUserStatus,
  changeUserRole,
  deleteUser,
};
