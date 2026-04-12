import type { IncomingHttpHeaders } from "http";
import status from "http-status";
import type { Prisma, Role } from "../../../generated/prisma/client";
import { fromNodeHeaders } from "better-auth/node";

import AppError from "../../error/AppError";
import { auth } from "../../lib/auth";
import { prisma } from "../../lib/prisma";
import { queryHelper } from "../../utils/queryHelper";
import { USER_ROLES } from "../../constants/user";

type TUpdateMyProfilePayload = {
  name?: string;
  phone?: string | null;
  image?: string | null;
};

type TGetAllUsersQuery = Record<string, unknown>;

type TUpdateUserStatusPayload = {
  isBanned?: boolean;
  isActive?: boolean;
};

type TDeleteUserOptions = {
  hardDelete?: boolean;
};

const USER_PROFILE_SELECT = {
  id: true,
  name: true,
  email: true,
  emailVerified: true,
  phone: true,
  image: true,
  role: true,
  isBanned: true,
  isActive: true,
  isDeleted: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

const ADMIN_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  emailVerified: true,
  phone: true,
  image: true,
  role: true,
  isBanned: true,
  isActive: true,
  isDeleted: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

const ALLOWED_SORT_FIELDS = new Set(["createdAt", "updatedAt", "name", "email", "role"]);

const ensureUserId = (id?: string) => {
  if (!id) {
    throw new AppError(status.BAD_REQUEST, "User id is required");
  }
};



const ensureUserExists = async (id: string) => {
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      role: true,
      isDeleted: true,
      isBanned: true,
      isActive: true,
    },
  });

  if (!user || user.isDeleted) {
    throw new AppError(status.NOT_FOUND, "User not found");
  }

  return user;
};

const invalidateUserSessions = async (userId: string) => {
  await prisma.session.deleteMany({
    where: { userId },
  });
};

const getMyProfile = async (userId: string) => {
  ensureUserId(userId);

  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      isDeleted: false,
    },
    select: USER_PROFILE_SELECT,
  });

  if (!user) {
    throw new AppError(status.NOT_FOUND, "User not found");
  }

  return user;
};

const updateMyProfile = async (userId: string, payload: TUpdateMyProfilePayload) => {
  ensureUserId(userId);

  await ensureUserExists(userId);

  const cleanData: Prisma.UserUpdateInput = {};

  if (payload.name !== undefined) {
    const name = payload.name.trim();
    if (!name) {
      throw new AppError(status.BAD_REQUEST, "Name cannot be empty");
    }
    cleanData.name = name;
  }

  if (payload.phone !== undefined) {
    cleanData.phone = payload.phone === null ? null : payload.phone.trim();
  }

  if (payload.image !== undefined) {
    cleanData.image = payload.image;
  }

  if (Object.keys(cleanData).length === 0) {
    throw new AppError(status.BAD_REQUEST, "No valid fields provided for update");
  }

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: cleanData,
    select: USER_PROFILE_SELECT,
  });

  return updatedUser;
};

const getAllUsers = async (query: TGetAllUsersQuery) => {
  const pagination = queryHelper.parsePagination(query);

  const role = queryHelper.getSingleValue(query.role)?.toString();
  const searchTerm = queryHelper.getSingleValue(query.searchTerm)?.toString().trim();
  const isBanned = queryHelper.parseBoolean(query.isBanned);
  const isActive = queryHelper.parseBoolean(query.isActive);
  const emailVerified = queryHelper.parseBoolean(query.emailVerified);
  const includeDeleted = queryHelper.parseBoolean(query.includeDeleted, { fallback: false });

  const sortBy =
    typeof pagination.sortBy === "string" && ALLOWED_SORT_FIELDS.has(pagination.sortBy)
      ? pagination.sortBy
      : "createdAt";

  const where: Prisma.UserWhereInput = {
    ...(includeDeleted ? {} : { isDeleted: false }),
  };

  if (role) {
    if (!USER_ROLES.includes(role as Role)) {
      throw new AppError(
        status.BAD_REQUEST,
        `Invalid role. Allowed roles: ${USER_ROLES.join(", ")}`
      );
    }

    where.role = role as Role;
  }

  if (isBanned !== undefined) {
    where.isBanned = isBanned;
  }

  if (isActive !== undefined) {
    where.isActive = isActive;
  }

  if (emailVerified !== undefined) {
    where.emailVerified = emailVerified;
  }

  if (searchTerm) {
    where.OR = [
      {
        name: {
          contains: searchTerm,
          mode: "insensitive",
        },
      },
      {
        email: {
          contains: searchTerm,
          mode: "insensitive",
        },
      },
      {
        phone: {
          contains: searchTerm,
          mode: "insensitive",
        },
      },
    ];
  }

  const [users, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      skip: pagination.skip,
      take: pagination.limit,
      orderBy: {
        [sortBy]: pagination.sortOrder,
      },
      select: ADMIN_USER_SELECT,
    }),
    prisma.user.count({ where }),
  ]);

  return {
    meta: {
      page: pagination.page,
      limit: pagination.limit,
      total,
      totalPages: Math.ceil(total / pagination.limit),
    },
    data: users,
  };
};

const getUserById = async (id: string) => {
  ensureUserId(id);

  const user = await prisma.user.findUnique({
    where: { id },
    select: ADMIN_USER_SELECT,
  });

  if (!user || user.isDeleted) {
    throw new AppError(status.NOT_FOUND, "User not found");
  }

  return user;
};

const updateUserStatus = async ({
  targetUserId,
  currentAdminId,
  payload,
}: {
  targetUserId: string;
  currentAdminId: string;
  payload: TUpdateUserStatusPayload;
}) => {
  ensureUserId(targetUserId);
  ensureUserId(currentAdminId);

  if (targetUserId === currentAdminId) {
    throw new AppError(status.FORBIDDEN, "You cannot update your own account status");
  }

  await ensureUserExists(targetUserId);

  const updateData: Prisma.UserUpdateInput = {};

  if (payload.isBanned !== undefined) {
    updateData.isBanned = payload.isBanned;
  }

  if (payload.isActive !== undefined) {
    updateData.isActive = payload.isActive;
  }

  if (Object.keys(updateData).length === 0) {
    throw new AppError(
      status.BAD_REQUEST,
      "At least one status field is required: isBanned or isActive"
    );
  }

  const updatedUser = await prisma.user.update({
    where: { id: targetUserId },
    data: updateData,
    select: ADMIN_USER_SELECT,
  });

  if (payload.isBanned !== undefined || payload.isActive !== undefined) {
    await invalidateUserSessions(targetUserId);
  }

  return updatedUser;
};

const changeUserRole = async (targetUserId: string, role: string, currentAdminId: string) => {
  ensureUserId(targetUserId);
  ensureUserId(currentAdminId);

  if (targetUserId === currentAdminId) {
    throw new AppError(status.FORBIDDEN, "You cannot change your own role");
  }

  if (!USER_ROLES.includes(role as Role)) {
    throw new AppError(status.BAD_REQUEST, `Invalid role. Allowed roles: ${USER_ROLES.join(", ")}`);
  }

  await ensureUserExists(targetUserId);

  const updatedUser = await prisma.user.update({
    where: { id: targetUserId },
    data: { role: role as Role },
    select: ADMIN_USER_SELECT,
  });

  await invalidateUserSessions(targetUserId);

  return updatedUser;
};

const deleteUser = async (
  targetUserId: string,
  currentAdminId: string,
  options: TDeleteUserOptions = {}
) => {
  ensureUserId(targetUserId);
  ensureUserId(currentAdminId);

  if (targetUserId === currentAdminId) {
    throw new AppError(status.FORBIDDEN, "You cannot delete your own account");
  }

  const existingUser = await ensureUserExists(targetUserId);

  if (options.hardDelete) {
    const [medicineCount, orderCount, reviewCount] = await prisma.$transaction([
      prisma.medicine.count({
        where: { sellerId: targetUserId },
      }),
      prisma.order.count({
        where: { customerId: targetUserId },
      }),
      prisma.review.count({
        where: { customerId: targetUserId },
      }),
    ]);

    if (medicineCount > 0 || orderCount > 0 || reviewCount > 0) {
      throw new AppError(
        status.CONFLICT,
        "User cannot be permanently deleted because related medicines, orders, or reviews exist"
      );
    }

    await prisma.user.delete({
      where: { id: targetUserId },
    });

    return null;
  }

  if (existingUser.isDeleted) {
    throw new AppError(status.BAD_REQUEST, "User is already deleted");
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: targetUserId },
      data: {
        isDeleted: true,
        isActive: false,
        isBanned: true,
        deletedAt: new Date(),
      },
    }),
    prisma.session.deleteMany({
      where: { userId: targetUserId },
    }),
  ]);

  return null;
};

const logout = async (headers: IncomingHttpHeaders) => {
  const { headers: responseHeaders } = await auth.api.signOut({
    headers: fromNodeHeaders(headers),
    returnHeaders: true,
  });

  const setCookies =
    typeof responseHeaders.getSetCookie === "function"
      ? responseHeaders.getSetCookie()
      : responseHeaders.get("set-cookie")
        ? [responseHeaders.get("set-cookie") as string]
        : [];

  return {
    setCookies,
  };
};

export const UserService = {
  getMyProfile,
  updateMyProfile,
  getAllUsers,
  getUserById,
  updateUserStatus,
  changeUserRole,
  deleteUser,
  logout,
};
