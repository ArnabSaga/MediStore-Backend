import { z } from "zod";
import { UserRole } from "../../constants/user";

const userIdParamsSchema = z.object({
  id: z.string().trim().min(1, "Invalid user id"),
});

const updateMyProfileBodySchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Name must be at least 2 characters")
      .max(255, "Name cannot exceed 255 characters")
      .optional(),

    phone: z
      .union([
        z.string().trim().min(7, "Phone number is too short").max(20, "Phone number is too long"),
        z.null(),
      ])
      .optional(),

    image: z.union([z.string().url("Invalid image URL"), z.null()]).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field is required",
  });

const getAllUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  sortBy: z.enum(["createdAt", "updatedAt", "name", "email", "role"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
  role: z.enum([UserRole.CUSTOMER, UserRole.SELLER, UserRole.ADMIN]).optional(),
  isBanned: z.union([z.literal("true"), z.literal("false"), z.boolean()]).optional(),
  isActive: z.union([z.literal("true"), z.literal("false"), z.boolean()]).optional(),
  emailVerified: z.union([z.literal("true"), z.literal("false"), z.boolean()]).optional(),
  includeDeleted: z.union([z.literal("true"), z.literal("false"), z.boolean()]).optional(),
  searchTerm: z.string().trim().min(1).max(100).optional(),
});

const updateUserStatusBodySchema = z
  .object({
    isBanned: z.boolean().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((data) => data.isBanned !== undefined || data.isActive !== undefined, {
    message: "At least one status field is required",
  });

const changeUserRoleBodySchema = z.object({
  role: z.enum([UserRole.CUSTOMER, UserRole.SELLER, UserRole.ADMIN], {
    error: "Role must be CUSTOMER, SELLER, or ADMIN",
  }),
});

const deleteUserQuerySchema = z.object({
  hardDelete: z.union([z.literal("true"), z.literal("false"), z.boolean()]).optional(),
});

export const UserValidation = {
  getMyProfile: {},
  updateMyProfile: {
    body: updateMyProfileBodySchema,
  },
  getAllUsers: {
    query: getAllUsersQuerySchema,
  },
  getUserById: {
    params: userIdParamsSchema,
  },
  updateUserStatus: {
    params: userIdParamsSchema,
    body: updateUserStatusBodySchema,
  },
  changeUserRole: {
    params: userIdParamsSchema,
    body: changeUserRoleBodySchema,
  },
  deleteUser: {
    params: userIdParamsSchema,
    query: deleteUserQuerySchema,
  },
};
