// src/app.ts
import express6 from "express";
import cors from "cors";
import { toNodeHandler } from "better-auth/node";

// src/lib/auth.ts
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";

// src/lib/prisma.ts
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
var connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");
var pool = new Pool({ connectionString });
var adapter = new PrismaPg(pool);
var prisma = new PrismaClient({ adapter });

// src/lib/auth.ts
import nodemailer from "nodemailer";

// src/lib/mail-template.ts
var getVerificationEmailHtml = (url, userEmail) => {
  return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Verify Your Email</title>
  </head>
  <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
      <table role="presentation" style="width: 100%; border-collapse: collapse;">
          <tr>
              <td style="padding: 40px 0; text-align: center;">
                  <table role="presentation" style="width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                      <tr>
                          <td style="padding: 40px 40px 20px; text-align: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 8px 8px 0 0;">
                              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: bold;">Medi Store</h1>
                          </td>
                      </tr>
                      <tr>
                          <td style="padding: 40px;">
                              <h2 style="margin: 0 0 20px; color: #333333; font-size: 24px; font-weight: bold;">Verify Your Email Address</h2>
                              <p style="margin: 0 0 20px; color: #666666; font-size: 16px; line-height: 1.5;">
                                  Thanks for signing up for Medi Store! Please verify your email address to complete your registration.
                              </p>
                              <table role="presentation" style="margin: 0 auto;">
                                  <tr>
                                      <td style="border-radius: 6px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
                                          <a href="${url}" style="display: inline-block; padding: 16px 40px; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: bold; border-radius: 6px;">
                                              Verify Email Address
                                          </a>
                                      </td>
                                  </tr>
                              </table>
                              <p style="margin: 30px 0 20px; color: #666666; font-size: 14px; line-height: 1.5;">
                                  Or copy and paste this link: <br/>
                                  <a href="${url}" style="color: #667eea;">${url}</a>
                              </p>
                          </td>
                      </tr>
                  </table>
              </td>
          </tr>
      </table>
  </body>
  </html>
  `;
};

// src/lib/auth.ts
var transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.APP_USER,
    pass: process.env.APP_PASS
  }
});
var auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql"
  }),
  user: {
    additionalFields: {
      role: {
        type: "string",
        defaultValue: "CUSTOMER"
      },
      isBanned: {
        type: "boolean",
        defaultValue: false
      },
      phone: {
        type: "string",
        defaultValue: ""
      }
    }
  },
  trustedOrigins: [process.env.APP_URL, process.env.API_URL].filter(Boolean),
  emailAndPassword: {
    enabled: true,
    autoSignIn: false,
    requireEmailVerification: true
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url, token }, request) => {
      try {
        const verificationUrl = `${process.env.APP_URL}/verify-email?token=${token}`;
        const info = await transporter.sendMail({
          from: '"Medi-Store" <medi-store@gmail.com>',
          to: user.email,
          subject: "Please verify your email!",
          html: getVerificationEmailHtml(verificationUrl, user.email)
        });
        console.log("Email sent:", info.messageId);
      } catch (error) {
        console.error("Error sending email:", error);
        throw error;
      }
    }
  },
  socialProviders: {
    google: {
      prompt: "select_account consent",
      accessType: "offline",
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET
    }
  }
});

// src/modules/users/user.route.ts
import express from "express";

// src/middleware/auth.middleware.ts
import { fromNodeHeaders } from "better-auth/node";
var isValidUserRole = (role) => {
  return role === "CUSTOMER" /* CUSTOMER */ || role === "SELLER" /* SELLER */ || role === "ADMIN" /* ADMIN */;
};
var auth2 = (options = {}) => {
  const { roles = [], requireVerifiedEmail = false } = options;
  return async (req, res, next) => {
    try {
      const session = await auth.api.getSession({
        headers: fromNodeHeaders(req.headers)
      });
      if (!session) {
        throw Object.assign(new Error("Unauthorized. Please login."), {
          statusCode: 401
        });
      }
      const userRole = session.user.role;
      if (!isValidUserRole(userRole)) {
        throw Object.assign(new Error("Invalid user role in session."), {
          statusCode: 401
        });
      }
      if (session.user.isBanned) {
        throw Object.assign(
          new Error("Your account is banned. Access denied."),
          { statusCode: 403 }
        );
      }
      req.user = {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        role: userRole,
        emailVerified: session.user.emailVerified,
        isBanned: session.user.isBanned
      };
      if (requireVerifiedEmail && !req.user.emailVerified) {
        throw Object.assign(
          new Error("Email verification required. Please check your inbox."),
          { statusCode: 403 }
        );
      }
      if (roles.length && !roles.includes(userRole)) {
        throw Object.assign(new Error("Forbidden. Insufficient permissions."), {
          statusCode: 403
        });
      }
      next();
    } catch (error) {
      next(error);
    }
  };
};
var auth_middleware_default = auth2;

// src/modules/users/user.service.ts
var getUserById = async (id) => {
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
      createdAt: true
    }
  });
  return result;
};
var updateUserProfile = async (id, payload) => {
  if (!id) {
    throw Object.assign(new Error("User id is required"), { statusCode: 400 });
  }
  const cleanData = {};
  Object.keys(payload).forEach(
    (key) => {
      const value = payload[key];
      if (value !== void 0) {
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
      createdAt: true
    }
  });
  return result;
};
var getAllUsers = async (role, isBanned) => {
  const where = {};
  if (role) {
    const validRoles = ["CUSTOMER", "SELLER", "ADMIN"];
    if (!validRoles.includes(role)) {
      throw Object.assign(
        new Error(`Invalid role. Must be one of: ${validRoles.join(", ")}`),
        { statusCode: 400 }
      );
    }
    where.role = role;
  }
  if (isBanned !== void 0) {
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
      createdAt: true
    },
    orderBy: { createdAt: "desc" }
  });
  return result;
};
var updateUserStatus = async (id, isBanned) => {
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
      isBanned: true
    }
  });
  return result;
};
var changeUserRole = async (id, role) => {
  if (!id) {
    throw Object.assign(new Error("User id is required"), { statusCode: 400 });
  }
  const validRoles = ["CUSTOMER", "SELLER", "ADMIN"];
  if (!validRoles.includes(role)) {
    throw Object.assign(
      new Error(`Invalid role. Must be one of: ${validRoles.join(", ")}`),
      { statusCode: 400 }
    );
  }
  const result = await prisma.user.update({
    where: { id },
    data: { role },
    select: {
      id: true,
      name: true,
      email: true,
      role: true
    }
  });
  return result;
};
var deleteUser = async (id, currentUserId) => {
  if (!id) {
    throw Object.assign(new Error("User id is required"), { statusCode: 400 });
  }
  if (currentUserId && id === currentUserId) {
    throw Object.assign(new Error("Cannot delete your own account"), {
      statusCode: 403
    });
  }
  await prisma.user.delete({ where: { id } });
};
var UserService = {
  getUserById,
  updateUserProfile,
  getAllUsers,
  updateUserStatus,
  changeUserRole,
  deleteUser
};

// src/modules/users/user.controller.ts
var getCurrentUser = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
    }
    const result = await UserService.getUserById(userId);
    res.status(200).json({
      success: true,
      message: "User fetched successfully",
      data: result
    });
  } catch (error) {
    next(error);
  }
};
var updateUserProfile2 = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
    }
    const result = await UserService.updateUserProfile(userId, req.body);
    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      data: result
    });
  } catch (error) {
    next(error);
  }
};
var getAllUsers2 = async (req, res, next) => {
  try {
    const role = typeof req.query.role === "string" ? req.query.role : void 0;
    let isBanned = void 0;
    if (typeof req.query.isBanned === "string") {
      if (req.query.isBanned !== "true" && req.query.isBanned !== "false") {
        throw Object.assign(new Error("isBanned must be 'true' or 'false'"), {
          statusCode: 400
        });
      }
      isBanned = req.query.isBanned === "true";
    }
    const result = await UserService.getAllUsers(role, isBanned);
    res.status(200).json({
      success: true,
      message: "Users fetched successfully",
      data: result
    });
  } catch (error) {
    next(error);
  }
};
var getUserById2 = async (req, res, next) => {
  try {
    const id = String(req.params.id);
    if (!id) {
      throw Object.assign(new Error("User id is required"), {
        statusCode: 400
      });
    }
    const result = await UserService.getUserById(id);
    res.status(200).json({
      success: true,
      message: "User fetched successfully",
      data: result
    });
  } catch (error) {
    next(error);
  }
};
var updateUserStatus2 = async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const { isBanned } = req.body;
    if (typeof isBanned !== "boolean") {
      throw Object.assign(new Error("isBanned must be a boolean"), {
        statusCode: 400
      });
    }
    const result = await UserService.updateUserStatus(id, isBanned);
    res.status(200).json({
      success: true,
      message: "User status updated successfully",
      data: result
    });
  } catch (error) {
    next(error);
  }
};
var changeRole = async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const { role } = req.body;
    if (typeof role !== "string") {
      throw Object.assign(new Error("role must be a string"), {
        statusCode: 400
      });
    }
    const result = await UserService.changeUserRole(id, role);
    res.status(200).json({
      success: true,
      message: "User role changed successfully",
      data: result
    });
  } catch (error) {
    next(error);
  }
};
var deleteUser2 = async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const currentUserId = req.user?.id;
    await UserService.deleteUser(id, currentUserId);
    res.status(200).json({
      success: true,
      message: "User deleted successfully"
    });
  } catch (error) {
    next(error);
  }
};
var UserController = {
  getCurrentUser,
  updateUserProfile: updateUserProfile2,
  getAllUsers: getAllUsers2,
  getUserById: getUserById2,
  updateUserStatus: updateUserStatus2,
  changeRole,
  deleteUser: deleteUser2
};

// src/modules/users/user.route.ts
var userRouter = express.Router();
userRouter.get(
  "/me",
  auth_middleware_default({
    roles: ["CUSTOMER" /* CUSTOMER */, "SELLER" /* SELLER */, "ADMIN" /* ADMIN */],
    requireVerifiedEmail: true
  }),
  UserController.getCurrentUser
);
userRouter.put(
  "/profile",
  auth_middleware_default({
    roles: ["CUSTOMER" /* CUSTOMER */, "SELLER" /* SELLER */, "ADMIN" /* ADMIN */],
    requireVerifiedEmail: true
  }),
  UserController.updateUserProfile
);
var adminUserRouter = express.Router();
adminUserRouter.get(
  "/",
  auth_middleware_default({ roles: ["ADMIN" /* ADMIN */] }),
  UserController.getAllUsers
);
adminUserRouter.get(
  "/:id",
  auth_middleware_default({ roles: ["ADMIN" /* ADMIN */] }),
  UserController.getUserById
);
adminUserRouter.patch(
  "/:id/status",
  auth_middleware_default({ roles: ["ADMIN" /* ADMIN */] }),
  UserController.updateUserStatus
);
adminUserRouter.patch(
  "/:id/role",
  auth_middleware_default({ roles: ["ADMIN" /* ADMIN */] }),
  UserController.changeRole
);
adminUserRouter.delete(
  "/:id",
  auth_middleware_default({ roles: ["ADMIN" /* ADMIN */] }),
  UserController.deleteUser
);
var UserRouter = userRouter;
var AdminUserRouter = adminUserRouter;

// src/modules/categories/category.route.ts
import express2 from "express";

// src/helpers/generateSlug.ts
var generateSlug = (name) => {
  return name.toLowerCase().trim().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-");
};

// src/modules/categories/category.service.ts
var ALLOWED_CATEGORY_SORT_FIELDS = /* @__PURE__ */ new Set(["createdAt", "name", "slug"]);
var createCategory = async (payload) => {
  if (!payload.name || !payload.slug) {
    throw Object.assign(new Error("Category name and slug are required"), {
      statusCode: 400
    });
  }
  const name = payload.name.trim();
  const slug = generateSlug(payload.slug);
  const existing = await prisma.category.findFirst({
    where: {
      OR: [{ slug }, { name }]
    },
    select: { id: true, name: true, slug: true }
  });
  if (existing) {
    throw Object.assign(
      new Error("Category with this name or slug already exists"),
      {
        statusCode: 409
      }
    );
  }
  return prisma.category.create({
    data: {
      name,
      slug,
      ...payload.description !== void 0 ? { description: payload.description } : {}
    }
  });
};
var getAllCategories = async (pagination) => {
  const sortBy = ALLOWED_CATEGORY_SORT_FIELDS.has(pagination.sortBy) ? pagination.sortBy : "createdAt";
  const [data, total] = await prisma.$transaction([
    prisma.category.findMany({
      skip: pagination.skip,
      take: pagination.limit,
      include: {
        medicines: {
          where: { isActive: true },
          select: { id: true, name: true, price: true }
        }
      },
      orderBy: { [sortBy]: pagination.sortOrder }
    }),
    prisma.category.count()
  ]);
  return {
    meta: {
      page: pagination.page,
      limit: pagination.limit,
      total,
      totalPages: Math.ceil(total / pagination.limit)
    },
    data
  };
};
var getCategoryById = async (id) => {
  return prisma.category.findUniqueOrThrow({
    where: { id },
    include: {
      medicines: {
        where: { isActive: true }
      }
    }
  });
};
var getCategoryBySlug = async (slug) => {
  return prisma.category.findUniqueOrThrow({
    where: { slug },
    include: {
      medicines: { where: { isActive: true } }
    }
  });
};
var updateCategory = async (id, payload) => {
  const nextPayload = { ...payload };
  if (nextPayload.name && !nextPayload.slug) {
    nextPayload.slug = generateSlug(nextPayload.name);
  }
  if (nextPayload.slug) {
    const existing = await prisma.category.findUnique({
      where: { slug: nextPayload.slug },
      select: { id: true }
    });
    if (existing && existing.id !== id) {
      throw Object.assign(new Error("Category with this slug already exists"), {
        statusCode: 409
      });
    }
  }
  const cleanData = {};
  Object.entries(nextPayload).forEach(([key, value]) => {
    if (value !== void 0) cleanData[key] = value;
  });
  if (Object.keys(cleanData).length === 0) {
    throw Object.assign(new Error("No fields to update"), { statusCode: 400 });
  }
  return prisma.category.update({
    where: { id },
    data: cleanData
  });
};
var deleteCategory = async (id) => {
  const medicinesCount = await prisma.medicine.count({
    where: { categoryId: id }
  });
  if (medicinesCount > 0) {
    throw Object.assign(
      new Error(
        `Cannot delete category with ${medicinesCount} medicine(s). Delete/reassign medicines first.`
      ),
      { statusCode: 409 }
    );
  }
  await prisma.category.delete({ where: { id } });
};
var CategoryService = {
  createCategory,
  getAllCategories,
  getCategoryById,
  getCategoryBySlug,
  updateCategory,
  deleteCategory
};

// src/helpers/paginationSortingHelper.ts
var MAX_LIMIT = 100;
var paginationSortingHelper = (options = {}) => {
  const page = Math.max(1, Number(options.page) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(options.limit) || 10));
  const skip = (page - 1) * limit;
  const sortBy = typeof options.sortBy === "string" && options.sortBy.trim().length > 0 ? options.sortBy.trim() : "createdAt";
  const sortOrder = options.sortOrder === "asc" ? "asc" : "desc";
  return { page, limit, skip, sortBy, sortOrder };
};
var paginationSortingHelper_default = paginationSortingHelper;

// src/modules/categories/category.controller.ts
var createCategory2 = async (req, res, next) => {
  try {
    const { name, slug, description } = req.body;
    if (!name || typeof name !== "string" || name.trim().length < 2) {
      throw Object.assign(new Error("name is required (min 2 chars)"), {
        statusCode: 400
      });
    }
    const finalSlug = typeof slug === "string" && slug.trim().length > 0 ? generateSlug(slug) : generateSlug(name);
    const categoryData = {
      name: name.trim(),
      slug: finalSlug
    };
    if (typeof description === "string" && description.trim().length > 0) {
      categoryData.description = description.trim();
    }
    const result = await CategoryService.createCategory(categoryData);
    res.status(201).json({
      success: true,
      message: "Category created successfully",
      data: result
    });
  } catch (error) {
    next(error);
  }
};
var getAllCategories2 = async (req, res, next) => {
  try {
    const pagination = paginationSortingHelper_default(req.query);
    const result = await CategoryService.getAllCategories(pagination);
    res.status(200).json({
      success: true,
      message: "Categories fetched successfully",
      meta: result.meta,
      data: result.data
    });
  } catch (error) {
    next(error);
  }
};
var getCategoryById2 = async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const result = await CategoryService.getCategoryById(id);
    res.status(200).json({
      success: true,
      message: "Category fetched successfully",
      data: result
    });
  } catch (error) {
    next(error);
  }
};
var getCategoryBySlug2 = async (req, res, next) => {
  try {
    const slug = String(req.params.slug);
    const result = await CategoryService.getCategoryBySlug(slug);
    res.status(200).json({
      success: true,
      message: "Category fetched successfully",
      data: result
    });
  } catch (error) {
    next(error);
  }
};
var updateCategory2 = async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const payload = req.body ?? {};
    if (payload.name !== void 0) {
      if (typeof payload.name !== "string" || payload.name.trim().length < 2) {
        throw Object.assign(new Error("name must be a string (min 2 chars)"), {
          statusCode: 400
        });
      }
      payload.name = payload.name.trim();
    }
    if (payload.slug !== void 0) {
      if (typeof payload.slug !== "string" || payload.slug.trim().length < 2) {
        throw Object.assign(new Error("slug must be a string (min 2 chars)"), {
          statusCode: 400
        });
      }
      payload.slug = generateSlug(payload.slug);
    }
    if (payload.description !== void 0) {
      if (payload.description !== null && typeof payload.description !== "string") {
        throw Object.assign(new Error("description must be a string or null"), {
          statusCode: 400
        });
      }
      payload.description = typeof payload.description === "string" ? payload.description.trim() : null;
    }
    const result = await CategoryService.updateCategory(id, payload);
    res.status(200).json({
      success: true,
      message: "Category updated successfully",
      data: result
    });
  } catch (error) {
    next(error);
  }
};
var deleteCategory2 = async (req, res, next) => {
  try {
    const id = String(req.params.id);
    await CategoryService.deleteCategory(id);
    res.status(200).json({
      success: true,
      message: "Category deleted successfully"
    });
  } catch (error) {
    next(error);
  }
};
var CategoryController = {
  createCategory: createCategory2,
  getAllCategories: getAllCategories2,
  getCategoryById: getCategoryById2,
  getCategoryBySlug: getCategoryBySlug2,
  updateCategory: updateCategory2,
  deleteCategory: deleteCategory2
};

// src/modules/categories/category.route.ts
var router = express2.Router();
router.get("/", CategoryController.getAllCategories);
router.get("/by-slug/:slug", CategoryController.getCategoryBySlug);
router.get("/:id", CategoryController.getCategoryById);
router.post(
  "/",
  auth_middleware_default({ roles: ["ADMIN" /* ADMIN */], requireVerifiedEmail: true }),
  CategoryController.createCategory
);
router.put(
  "/:id",
  auth_middleware_default({ roles: ["ADMIN" /* ADMIN */], requireVerifiedEmail: true }),
  CategoryController.updateCategory
);
router.delete(
  "/:id",
  auth_middleware_default({ roles: ["ADMIN" /* ADMIN */], requireVerifiedEmail: true }),
  CategoryController.deleteCategory
);
var CategoryRouter = router;

// src/modules/medicines/medicine.route.ts
import express3 from "express";

// src/modules/medicines/medicine.service.ts
import { Prisma } from "@prisma/client";
var ALLOWED_MEDICINE_SORT_FIELDS = /* @__PURE__ */ new Set([
  "createdAt",
  "price",
  "name",
  "stock"
]);
var createMedicine = async (payload) => {
  const slug = generateSlug(payload.slug);
  return prisma.medicine.create({
    data: {
      name: payload.name,
      slug,
      price: new Prisma.Decimal(payload.price),
      stock: payload.stock,
      manufacturer: payload.manufacturer,
      categoryId: payload.categoryId,
      sellerId: payload.sellerId,
      ...payload.description !== void 0 ? { description: payload.description } : {},
      ...payload.imageUrl !== void 0 ? { imageUrl: payload.imageUrl } : {},
      ...payload.isActive !== void 0 ? { isActive: payload.isActive } : {}
    },
    include: {
      category: true,
      seller: { select: { id: true, name: true, email: true } }
    }
  });
};
var getAllMedicines = async (filters, pagination) => {
  const where = { isActive: true };
  if (filters.categoryId) where.categoryId = filters.categoryId;
  if (filters.search) {
    where.OR = [
      { name: { contains: filters.search, mode: "insensitive" } },
      { description: { contains: filters.search, mode: "insensitive" } },
      { manufacturer: { contains: filters.search, mode: "insensitive" } }
    ];
  }
  if (filters.minPrice !== void 0 || filters.maxPrice !== void 0) {
    where.price = {};
    if (filters.minPrice !== void 0)
      where.price.gte = new Prisma.Decimal(filters.minPrice);
    if (filters.maxPrice !== void 0)
      where.price.lte = new Prisma.Decimal(filters.maxPrice);
  }
  if (filters.manufacturer) {
    where.manufacturer = {
      contains: filters.manufacturer,
      mode: "insensitive"
    };
  }
  const sortBy = ALLOWED_MEDICINE_SORT_FIELDS.has(pagination.sortBy) ? pagination.sortBy : "createdAt";
  return prisma.medicine.findMany({
    where,
    skip: pagination.skip,
    take: pagination.limit,
    include: {
      category: true,
      seller: { select: { id: true, name: true } },
      reviews: { select: { rating: true } }
    },
    orderBy: { [sortBy]: pagination.sortOrder }
  });
};
var getMedicineById = async (id) => {
  return prisma.medicine.findUniqueOrThrow({
    where: { id },
    include: {
      category: true,
      seller: { select: { id: true, name: true, email: true, phone: true } },
      reviews: {
        include: {
          customer: { select: { id: true, name: true, image: true } }
        }
      }
    }
  });
};
var getSellerMedicines = async (sellerId, includeInactive) => {
  return prisma.medicine.findMany({
    where: {
      sellerId,
      ...includeInactive ? {} : { isActive: true }
    },
    include: {
      category: true,
      reviews: { select: { rating: true } }
    },
    orderBy: { createdAt: "desc" }
  });
};
var updateMedicineForSeller = async (id, payload, sellerId) => {
  const medicine = await prisma.medicine.findUniqueOrThrow({ where: { id } });
  if (medicine.sellerId !== sellerId) {
    throw Object.assign(
      new Error("Forbidden: unauthorized to update this medicine"),
      {
        statusCode: 403
      }
    );
  }
  const cleanData = {};
  if (payload.name !== void 0) {
    if (typeof payload.name !== "string" || payload.name.trim().length < 2) {
      throw Object.assign(new Error("name must be at least 2 characters"), {
        statusCode: 400
      });
    }
    cleanData.name = payload.name.trim();
  }
  if (payload.slug !== void 0) {
    if (typeof payload.slug !== "string" || payload.slug.trim().length < 2) {
      throw Object.assign(new Error("slug must be at least 2 characters"), {
        statusCode: 400
      });
    }
    cleanData.slug = generateSlug(payload.slug);
  } else if (payload.name !== void 0) {
    cleanData.slug = generateSlug(payload.name);
  }
  if (payload.description !== void 0)
    cleanData.description = payload.description;
  if (payload.imageUrl !== void 0) cleanData.imageUrl = payload.imageUrl;
  if (payload.isActive !== void 0) cleanData.isActive = payload.isActive;
  if (payload.price !== void 0) {
    if (typeof payload.price !== "number" || Number.isNaN(payload.price) || payload.price <= 0) {
      throw Object.assign(new Error("price must be a positive number"), {
        statusCode: 400
      });
    }
    cleanData.price = new Prisma.Decimal(payload.price);
  }
  if (payload.stock !== void 0) {
    if (!Number.isInteger(payload.stock) || payload.stock < 0) {
      throw Object.assign(new Error("stock must be a non-negative integer"), {
        statusCode: 400
      });
    }
    cleanData.stock = payload.stock;
  }
  if (payload.manufacturer !== void 0) {
    if (typeof payload.manufacturer !== "string" || payload.manufacturer.trim().length < 2) {
      throw Object.assign(
        new Error("manufacturer must be at least 2 characters"),
        { statusCode: 400 }
      );
    }
    cleanData.manufacturer = payload.manufacturer.trim();
  }
  if (payload.categoryId !== void 0) {
    if (typeof payload.categoryId !== "string" || payload.categoryId.trim().length === 0) {
      throw Object.assign(new Error("categoryId must be a valid string"), {
        statusCode: 400
      });
    }
    cleanData.category = { connect: { id: payload.categoryId } };
  }
  if (Object.keys(cleanData).length === 0) {
    throw Object.assign(new Error("No fields to update"), { statusCode: 400 });
  }
  return prisma.medicine.update({
    where: { id },
    data: cleanData,
    include: {
      category: true,
      seller: { select: { id: true, name: true } }
    }
  });
};
var deleteMedicineForSeller = async (id, sellerId) => {
  const medicine = await prisma.medicine.findUniqueOrThrow({ where: { id } });
  if (medicine.sellerId !== sellerId) {
    throw Object.assign(
      new Error("Forbidden: unauthorized to delete this medicine"),
      {
        statusCode: 403
      }
    );
  }
  await prisma.medicine.delete({ where: { id } });
};
var updateMedicineAsAdmin = async (id, payload) => {
  return updateMedicineForSeller(
    id,
    payload,
    (await prisma.medicine.findUniqueOrThrow({ where: { id } })).sellerId
  );
};
var deleteMedicineAsAdmin = async (id) => {
  await prisma.medicine.delete({ where: { id } });
};
var MedicineService = {
  createMedicine,
  getAllMedicines,
  getMedicineById,
  getSellerMedicines,
  updateMedicineForSeller,
  deleteMedicineForSeller,
  updateMedicineAsAdmin,
  deleteMedicineAsAdmin
};

// src/modules/medicines/medicine.controller.ts
var createMedicine2 = async (req, res, next) => {
  try {
    const sellerId = req.user?.id;
    if (!sellerId)
      throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
    const {
      name,
      price,
      stock,
      manufacturer,
      categoryId,
      slug,
      description,
      imageUrl,
      isActive
    } = req.body;
    if (!name || typeof name !== "string" || name.trim().length < 2) {
      throw Object.assign(new Error("name is required (min 2 chars)"), {
        statusCode: 400
      });
    }
    if (typeof price !== "number" || Number.isNaN(price) || price <= 0) {
      throw Object.assign(new Error("price must be a positive number"), {
        statusCode: 400
      });
    }
    if (!Number.isInteger(stock) || stock < 0) {
      throw Object.assign(new Error("stock must be a non-negative integer"), {
        statusCode: 400
      });
    }
    if (!manufacturer || typeof manufacturer !== "string" || manufacturer.trim().length < 2) {
      throw Object.assign(new Error("manufacturer is required (min 2 chars)"), {
        statusCode: 400
      });
    }
    if (!categoryId || typeof categoryId !== "string") {
      throw Object.assign(new Error("categoryId is required"), {
        statusCode: 400
      });
    }
    const finalSlug = typeof slug === "string" && slug.trim().length > 0 ? generateSlug(slug) : generateSlug(name);
    const payload = {
      name: name.trim(),
      slug: finalSlug,
      price,
      stock,
      manufacturer: manufacturer.trim(),
      categoryId,
      sellerId
    };
    if (typeof description === "string" && description.trim().length > 0) {
      payload.description = description.trim();
    }
    if (typeof imageUrl === "string" && imageUrl.trim().length > 0) {
      payload.imageUrl = imageUrl.trim();
    }
    if (typeof isActive === "boolean") {
      payload.isActive = isActive;
    }
    const result = await MedicineService.createMedicine(payload);
    res.status(201).json({
      success: true,
      message: "Medicine created successfully",
      data: result
    });
  } catch (error) {
    next(error);
  }
};
var getAllMedicines2 = async (req, res, next) => {
  try {
    const { categoryId, search, minPrice, maxPrice, manufacturer } = req.query;
    const filters = {};
    if (typeof categoryId === "string") filters.categoryId = categoryId;
    if (typeof search === "string") filters.search = search;
    if (typeof manufacturer === "string") filters.manufacturer = manufacturer;
    if (typeof minPrice === "string") filters.minPrice = Number(minPrice);
    if (typeof maxPrice === "string") filters.maxPrice = Number(maxPrice);
    const pagination = paginationSortingHelper_default(req.query);
    const result = await MedicineService.getAllMedicines(filters, pagination);
    res.status(200).json({
      success: true,
      message: "Medicines fetched successfully",
      meta: {
        page: pagination.page,
        limit: pagination.limit
      },
      data: result
    });
  } catch (error) {
    next(error);
  }
};
var getMedicineById2 = async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const result = await MedicineService.getMedicineById(id);
    res.status(200).json({
      success: true,
      message: "Medicine fetched successfully",
      data: result
    });
  } catch (error) {
    next(error);
  }
};
var getSellerMedicines2 = async (req, res, next) => {
  try {
    const sellerId = req.user?.id;
    if (!sellerId)
      throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
    const includeInactive = typeof req.query.includeInactive === "string" ? req.query.includeInactive === "true" : false;
    const result = await MedicineService.getSellerMedicines(
      sellerId,
      includeInactive
    );
    res.status(200).json({
      success: true,
      message: "Seller medicines fetched successfully",
      data: result
    });
  } catch (error) {
    next(error);
  }
};
var updateMedicine = async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const actor = req.user;
    if (!actor)
      throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
    const payload = req.body ?? {};
    const result = await MedicineService.updateMedicineForSeller(
      id,
      payload,
      actor.id
    );
    res.status(200).json({
      success: true,
      message: "Medicine updated successfully",
      data: result
    });
  } catch (error) {
    next(error);
  }
};
var deleteMedicine = async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const actor = req.user;
    if (!actor)
      throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
    await MedicineService.deleteMedicineForSeller(id, actor.id);
    res.status(200).json({
      success: true,
      message: "Medicine deleted successfully"
    });
  } catch (error) {
    next(error);
  }
};
var adminUpdateMedicine = async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const payload = req.body ?? {};
    const result = await MedicineService.updateMedicineAsAdmin(id, payload);
    res.status(200).json({
      success: true,
      message: "Medicine updated successfully",
      data: result
    });
  } catch (error) {
    next(error);
  }
};
var adminDeleteMedicine = async (req, res, next) => {
  try {
    const id = String(req.params.id);
    await MedicineService.deleteMedicineAsAdmin(id);
    res.status(200).json({
      success: true,
      message: "Medicine deleted successfully"
    });
  } catch (error) {
    next(error);
  }
};
var MedicineController = {
  createMedicine: createMedicine2,
  getAllMedicines: getAllMedicines2,
  getMedicineById: getMedicineById2,
  getSellerMedicines: getSellerMedicines2,
  updateMedicine,
  deleteMedicine,
  adminUpdateMedicine,
  adminDeleteMedicine
};

// src/modules/medicines/medicine.route.ts
var medicineRouter = express3.Router();
medicineRouter.get("/", MedicineController.getAllMedicines);
medicineRouter.get("/:id", MedicineController.getMedicineById);
var sellerMedicineRouter = express3.Router();
sellerMedicineRouter.post(
  "/",
  auth_middleware_default({ roles: ["SELLER" /* SELLER */], requireVerifiedEmail: true }),
  MedicineController.createMedicine
);
sellerMedicineRouter.get(
  "/",
  auth_middleware_default({ roles: ["SELLER" /* SELLER */], requireVerifiedEmail: true }),
  MedicineController.getSellerMedicines
);
sellerMedicineRouter.put(
  "/:id",
  auth_middleware_default({ roles: ["SELLER" /* SELLER */], requireVerifiedEmail: true }),
  MedicineController.updateMedicine
);
sellerMedicineRouter.delete(
  "/:id",
  auth_middleware_default({ roles: ["SELLER" /* SELLER */], requireVerifiedEmail: true }),
  MedicineController.deleteMedicine
);
var adminMedicineRouter = express3.Router();
adminMedicineRouter.put(
  "/:id",
  auth_middleware_default({ roles: ["ADMIN" /* ADMIN */] }),
  MedicineController.adminUpdateMedicine
);
adminMedicineRouter.delete(
  "/:id",
  auth_middleware_default({ roles: ["ADMIN" /* ADMIN */] }),
  MedicineController.adminDeleteMedicine
);
var MedicineRouter = medicineRouter;
var SellerMedicineRouter = sellerMedicineRouter;
var AdminMedicineRouter = adminMedicineRouter;

// src/modules/orders/order.route.ts
import express4 from "express";

// src/modules/orders/order.service.ts
import { Prisma as Prisma2 } from "@prisma/client";
var ALLOWED_ORDER_SORT_FIELDS = /* @__PURE__ */ new Set([
  "createdAt",
  "totalAmount",
  "status"
]);
var VALID_STATUSES = [
  "PLACED",
  "PROCESSING",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED"
];
var createOrder = async (payload) => {
  if (!payload.customerId) {
    throw Object.assign(new Error("customerId is required"), {
      statusCode: 400
    });
  }
  if (!payload.shippingAddress || typeof payload.shippingAddress !== "string") {
    throw Object.assign(new Error("shippingAddress is required"), {
      statusCode: 400
    });
  }
  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    throw Object.assign(new Error("Order items are required"), {
      statusCode: 400
    });
  }
  const medicineIds = payload.items.map((i) => i.medicineId);
  const medicines = await prisma.medicine.findMany({
    where: {
      id: { in: medicineIds },
      isActive: true
    },
    select: {
      id: true,
      price: true,
      stock: true,
      sellerId: true
    }
  });
  if (medicines.length !== medicineIds.length) {
    throw Object.assign(
      new Error("One or more medicines not found or inactive"),
      {
        statusCode: 404
      }
    );
  }
  const medicineMap = new Map(medicines.map((m) => [m.id, m]));
  const orderItems = payload.items.map((it) => {
    const med = medicineMap.get(it.medicineId);
    if (!med) {
      throw Object.assign(new Error("Medicine not found"), { statusCode: 404 });
    }
    return {
      medicineId: it.medicineId,
      sellerId: med.sellerId,
      quantity: it.quantity,
      price: med.price
      // Decimal from DB
    };
  });
  let total = new Prisma2.Decimal(0);
  for (const it of orderItems) {
    total = total.plus(new Prisma2.Decimal(it.price).mul(it.quantity));
  }
  const result = await prisma.$transaction(async (tx) => {
    for (const it of orderItems) {
      const updated = await tx.medicine.updateMany({
        where: {
          id: it.medicineId,
          stock: { gte: it.quantity }
        },
        data: {
          stock: { decrement: it.quantity }
        }
      });
      if (updated.count !== 1) {
        throw Object.assign(
          new Error("Insufficient stock for one or more items"),
          {
            statusCode: 409
          }
        );
      }
    }
    const created = await tx.order.create({
      data: {
        customerId: payload.customerId,
        totalAmount: total,
        shippingAddress: payload.shippingAddress,
        items: {
          createMany: {
            data: orderItems.map((i) => ({
              medicineId: i.medicineId,
              sellerId: i.sellerId,
              quantity: i.quantity,
              price: i.price
            }))
          }
        }
      },
      include: {
        items: {
          include: { medicine: true }
        }
      }
    });
    return created;
  });
  return result;
};
var getUserOrders = async (userId, pagination) => {
  if (!userId) {
    throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
  }
  const sortBy = ALLOWED_ORDER_SORT_FIELDS.has(pagination.sortBy) ? pagination.sortBy : "createdAt";
  return prisma.order.findMany({
    where: { customerId: userId },
    skip: pagination.skip,
    take: pagination.limit,
    include: { items: { include: { medicine: true } } },
    orderBy: { [sortBy]: pagination.sortOrder }
  });
};
var getOrderByIdForCustomer = async (id, userId) => {
  const result = await prisma.order.findUniqueOrThrow({
    where: { id },
    include: { items: { include: { medicine: true } } }
  });
  if (result.customerId !== userId) {
    throw Object.assign(new Error("Forbidden: order does not belong to you"), {
      statusCode: 403
    });
  }
  return result;
};
var getAllOrders = async (status, pagination) => {
  const where = {};
  if (status) {
    if (!VALID_STATUSES.includes(status)) {
      throw Object.assign(
        new Error(
          `Invalid order status. Must be one of: ${VALID_STATUSES.join(", ")}`
        ),
        { statusCode: 400 }
      );
    }
    where.status = status;
  }
  const sortBy = ALLOWED_ORDER_SORT_FIELDS.has(pagination.sortBy) ? pagination.sortBy : "createdAt";
  return prisma.order.findMany({
    where,
    skip: pagination.skip,
    take: pagination.limit,
    include: {
      customer: { select: { id: true, name: true, email: true } },
      items: { include: { medicine: true } }
    },
    orderBy: { [sortBy]: pagination.sortOrder }
  });
};
var getSellerOrders = async (sellerId, pagination) => {
  if (!sellerId) {
    throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
  }
  const ALLOWED_ORDER_ITEM_SORT_FIELDS = /* @__PURE__ */ new Set([
    "createdAt",
    "price",
    "quantity"
  ]);
  const sortBy = ALLOWED_ORDER_ITEM_SORT_FIELDS.has(pagination.sortBy) ? pagination.sortBy : "createdAt";
  return prisma.orderItem.findMany({
    where: { sellerId },
    skip: pagination.skip,
    take: pagination.limit,
    include: {
      order: {
        include: {
          customer: {
            select: { id: true, name: true, email: true, phone: true }
          }
        }
      },
      medicine: true
    },
    orderBy: { [sortBy]: pagination.sortOrder }
  });
};
var updateOrderStatus = async (id, status, actor) => {
  if (!VALID_STATUSES.includes(status)) {
    throw Object.assign(
      new Error(
        `Invalid order status. Must be one of: ${VALID_STATUSES.join(", ")}`
      ),
      { statusCode: 400 }
    );
  }
  const order = await prisma.order.findUniqueOrThrow({
    where: { id },
    include: { items: true }
  });
  if (actor.role === "SELLER" /* SELLER */) {
    const allBelongToSeller = order.items.every(
      (it) => it.sellerId === actor.sellerId
    );
    if (!allBelongToSeller) {
      throw Object.assign(
        new Error("Forbidden: this order contains items from other sellers"),
        {
          statusCode: 403
        }
      );
    }
  }
  return prisma.order.update({
    where: { id },
    data: { status },
    include: { items: { include: { medicine: true } } }
  });
};
var cancelOrder = async (id, userId) => {
  const order = await prisma.order.findUniqueOrThrow({ where: { id } });
  if (order.customerId !== userId) {
    throw Object.assign(
      new Error("Forbidden: cannot cancel someone else's order"),
      {
        statusCode: 403
      }
    );
  }
  if (order.status !== "PLACED") {
    throw Object.assign(new Error("Only placed orders can be cancelled"), {
      statusCode: 409
    });
  }
  return prisma.order.update({
    where: { id },
    data: { status: "CANCELLED" },
    include: { items: { include: { medicine: true } } }
  });
};
var OrderService = {
  createOrder,
  getUserOrders,
  getOrderByIdForCustomer,
  getAllOrders,
  getSellerOrders,
  updateOrderStatus,
  cancelOrder
};

// src/modules/orders/order.validation.ts
var isNonEmptyString = (v) => typeof v === "string" && v.trim().length > 0;
var isPositiveInt = (v) => Number.isInteger(v) && v > 0;
var validateCreateOrderDTO = (body) => {
  if (!body || typeof body !== "object") {
    throw Object.assign(new Error("Invalid request body"), { statusCode: 400 });
  }
  if (!isNonEmptyString(body.shippingAddress)) {
    throw Object.assign(new Error("shippingAddress is required"), {
      statusCode: 400
    });
  }
  if (!Array.isArray(body.items) || body.items.length === 0) {
    throw Object.assign(new Error("items must be a non-empty array"), {
      statusCode: 400
    });
  }
  const items = body.items.map((it, idx) => {
    if (!it || typeof it !== "object") {
      throw Object.assign(new Error(`items[${idx}] must be an object`), {
        statusCode: 400
      });
    }
    if (!isNonEmptyString(it.medicineId)) {
      throw Object.assign(new Error(`items[${idx}].medicineId is required`), {
        statusCode: 400
      });
    }
    if (!isPositiveInt(it.quantity)) {
      throw Object.assign(
        new Error(`items[${idx}].quantity must be a positive integer`),
        {
          statusCode: 400
        }
      );
    }
    return { medicineId: it.medicineId.trim(), quantity: it.quantity };
  });
  return {
    shippingAddress: body.shippingAddress.trim(),
    items
  };
};
var validateUpdateOrderStatusDTO = (body) => {
  if (!body || typeof body !== "object") {
    throw Object.assign(new Error("Invalid request body"), { statusCode: 400 });
  }
  if (!isNonEmptyString(body.status)) {
    throw Object.assign(new Error("status is required"), { statusCode: 400 });
  }
  const validStatuses = [
    "PLACED",
    "PROCESSING",
    "SHIPPED",
    "DELIVERED",
    "CANCELLED"
  ];
  if (!validStatuses.includes(body.status)) {
    throw Object.assign(
      new Error(`Invalid status. Must be one of: ${validStatuses.join(", ")}`),
      { statusCode: 400 }
    );
  }
  return { status: body.status };
};

// src/modules/orders/order.controller.ts
var createOrder2 = async (req, res, next) => {
  try {
    const customerId = req.user?.id;
    if (!customerId) {
      throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
    }
    const dto = validateCreateOrderDTO(req.body);
    const result = await OrderService.createOrder({
      customerId,
      shippingAddress: dto.shippingAddress,
      items: dto.items
    });
    res.status(201).json({
      success: true,
      message: "Order created successfully",
      data: result
    });
  } catch (error) {
    next(error);
  }
};
var getUserOrders2 = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId)
      throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
    const pagination = paginationSortingHelper_default(req.query);
    const result = await OrderService.getUserOrders(userId, pagination);
    res.status(200).json({
      success: true,
      message: "Orders fetched successfully",
      meta: { page: pagination.page, limit: pagination.limit },
      data: result
    });
  } catch (error) {
    next(error);
  }
};
var getOrderById = async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const userId = req.user?.id;
    if (!userId) {
      throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
    }
    const result = await OrderService.getOrderByIdForCustomer(id, userId);
    res.status(200).json({
      success: true,
      message: "Order fetched successfully",
      data: result
    });
  } catch (error) {
    next(error);
  }
};
var cancelOrder2 = async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const userId = req.user?.id;
    if (!userId) {
      throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
    }
    const result = await OrderService.cancelOrder(id, userId);
    res.status(200).json({
      success: true,
      message: "Order cancelled successfully",
      data: result
    });
  } catch (error) {
    next(error);
  }
};
var getSellerOrders2 = async (req, res, next) => {
  try {
    const sellerId = req.user?.id;
    if (!sellerId)
      throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
    const pagination = paginationSortingHelper_default(req.query);
    const result = await OrderService.getSellerOrders(sellerId, pagination);
    res.status(200).json({
      success: true,
      message: "Seller orders fetched successfully",
      meta: { page: pagination.page, limit: pagination.limit },
      data: result
    });
  } catch (error) {
    next(error);
  }
};
var updateOrderStatus2 = async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const actor = req.user;
    if (!actor) {
      throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
    }
    if (actor.role !== "SELLER" /* SELLER */ && actor.role !== "ADMIN" /* ADMIN */) {
      throw Object.assign(new Error("Forbidden. Insufficient permissions."), {
        statusCode: 403
      });
    }
    const dto = validateUpdateOrderStatusDTO(req.body);
    const result = actor.role === "SELLER" /* SELLER */ ? await OrderService.updateOrderStatus(id, dto.status, {
      role: "SELLER" /* SELLER */,
      sellerId: actor.id
    }) : await OrderService.updateOrderStatus(id, dto.status, {
      role: "ADMIN" /* ADMIN */
    });
    res.status(200).json({
      success: true,
      message: "Order status updated successfully",
      data: result
    });
  } catch (error) {
    next(error);
  }
};
var getAllOrders2 = async (req, res, next) => {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : void 0;
    const pagination = paginationSortingHelper_default(req.query);
    const result = await OrderService.getAllOrders(status, pagination);
    res.status(200).json({
      success: true,
      message: "Orders fetched successfully",
      meta: { page: pagination.page, limit: pagination.limit },
      data: result
    });
  } catch (error) {
    next(error);
  }
};
var OrderController = {
  createOrder: createOrder2,
  getUserOrders: getUserOrders2,
  getOrderById,
  cancelOrder: cancelOrder2,
  getSellerOrders: getSellerOrders2,
  updateOrderStatus: updateOrderStatus2,
  getAllOrders: getAllOrders2
};

// src/modules/orders/order.route.ts
var orderRouter = express4.Router();
orderRouter.post(
  "/",
  auth_middleware_default({ roles: ["CUSTOMER" /* CUSTOMER */], requireVerifiedEmail: true }),
  OrderController.createOrder
);
orderRouter.get(
  "/",
  auth_middleware_default({ roles: ["CUSTOMER" /* CUSTOMER */], requireVerifiedEmail: true }),
  OrderController.getUserOrders
);
orderRouter.get(
  "/:id",
  auth_middleware_default({ roles: ["CUSTOMER" /* CUSTOMER */], requireVerifiedEmail: true }),
  OrderController.getOrderById
);
orderRouter.patch(
  "/:id/cancel",
  auth_middleware_default({ roles: ["CUSTOMER" /* CUSTOMER */], requireVerifiedEmail: true }),
  OrderController.cancelOrder
);
var sellerOrderRouter = express4.Router();
sellerOrderRouter.get(
  "/",
  auth_middleware_default({ roles: ["SELLER" /* SELLER */], requireVerifiedEmail: true }),
  OrderController.getSellerOrders
);
sellerOrderRouter.patch(
  "/:id",
  auth_middleware_default({ roles: ["SELLER" /* SELLER */], requireVerifiedEmail: true }),
  OrderController.updateOrderStatus
);
var adminOrderRouter = express4.Router();
adminOrderRouter.get(
  "/",
  auth_middleware_default({ roles: ["ADMIN" /* ADMIN */] }),
  OrderController.getAllOrders
);
adminOrderRouter.patch(
  "/:id",
  auth_middleware_default({ roles: ["ADMIN" /* ADMIN */] }),
  OrderController.updateOrderStatus
);
var OrderRouter = orderRouter;
var SellerOrderRouter = sellerOrderRouter;
var AdminOrderRouter = adminOrderRouter;

// src/modules/reviews/review.route.ts
import express5 from "express";

// src/modules/reviews/review.service.ts
var ALLOWED_REVIEW_SORT_FIELDS = /* @__PURE__ */ new Set(["createdAt", "rating"]);
var createReview = async (payload) => {
  const hasDeliveredOrder = await prisma.orderItem.findFirst({
    where: {
      medicineId: payload.medicineId,
      order: {
        customerId: payload.customerId,
        status: "DELIVERED"
      }
    },
    select: { id: true }
  });
  if (!hasDeliveredOrder) {
    throw Object.assign(
      new Error("You can review only after this medicine is delivered to you."),
      { statusCode: 403 }
    );
  }
  const result = await prisma.review.create({
    data: payload,
    include: {
      customer: {
        select: {
          id: true,
          name: true,
          image: true
        }
      },
      medicine: {
        select: {
          id: true,
          name: true
        }
      }
    }
  });
  return result;
};
var getMedicineReviews = async (medicineId, pagination) => {
  const sortBy = ALLOWED_REVIEW_SORT_FIELDS.has(pagination.sortBy) ? pagination.sortBy : "createdAt";
  return prisma.review.findMany({
    where: { medicineId },
    skip: pagination.skip,
    take: pagination.limit,
    include: {
      customer: { select: { id: true, name: true, image: true } }
    },
    orderBy: { [sortBy]: pagination.sortOrder }
  });
};
var getUserReviews = async (customerId, pagination) => {
  const sortBy = ALLOWED_REVIEW_SORT_FIELDS.has(pagination.sortBy) ? pagination.sortBy : "createdAt";
  return prisma.review.findMany({
    where: { customerId },
    skip: pagination.skip,
    take: pagination.limit,
    include: {
      medicine: { select: { id: true, name: true, imageUrl: true } }
    },
    orderBy: { [sortBy]: pagination.sortOrder }
  });
};
var updateReview = async (id, customerId, payload) => {
  const review = await prisma.review.findUniqueOrThrow({ where: { id } });
  if (review.customerId !== customerId) {
    throw Object.assign(
      new Error("Forbidden: unauthorized to update this review"),
      {
        statusCode: 403
      }
    );
  }
  const cleanData = {};
  Object.entries(payload).forEach(([key, value]) => {
    if (value !== void 0) cleanData[key] = value;
  });
  if (Object.keys(cleanData).length === 0) {
    throw Object.assign(new Error("No fields to update"), { statusCode: 400 });
  }
  return prisma.review.update({
    where: { id },
    data: cleanData,
    include: {
      customer: { select: { id: true, name: true, image: true } },
      medicine: { select: { id: true, name: true } }
    }
  });
};
var deleteReview = async (id, customerId) => {
  const review = await prisma.review.findUniqueOrThrow({ where: { id } });
  if (review.customerId !== customerId) {
    throw Object.assign(
      new Error("Forbidden: unauthorized to delete this review"),
      {
        statusCode: 403
      }
    );
  }
  await prisma.review.delete({ where: { id } });
};
var ReviewService = {
  createReview,
  getMedicineReviews,
  getUserReviews,
  updateReview,
  deleteReview
};

// src/modules/reviews/review.controller.ts
var createReview2 = async (req, res, next) => {
  try {
    const customerId = req.user?.id;
    if (!customerId) {
      throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
    }
    const { medicineId, rating, comment } = req.body;
    if (!medicineId || rating === void 0 || !comment) {
      throw Object.assign(
        new Error("Missing required fields: medicineId, rating, comment"),
        { statusCode: 400 }
      );
    }
    if (typeof rating !== "number" || rating < 1 || rating > 5) {
      throw Object.assign(
        new Error("Rating must be a number between 1 and 5"),
        {
          statusCode: 400
        }
      );
    }
    if (typeof comment !== "string" || comment.trim().length < 3) {
      throw Object.assign(new Error("Comment must be at least 3 characters"), {
        statusCode: 400
      });
    }
    const result = await ReviewService.createReview({
      customerId,
      medicineId,
      rating,
      comment: comment.trim()
    });
    res.status(201).json({
      success: true,
      message: "Review created successfully",
      data: result
    });
  } catch (error) {
    next(error);
  }
};
var getMedicineReviews2 = async (req, res, next) => {
  try {
    const medicineId = String(req.params.medicineId);
    const pagination = paginationSortingHelper_default(req.query);
    const result = await ReviewService.getMedicineReviews(
      medicineId,
      pagination
    );
    res.status(200).json({
      success: true,
      message: "Reviews fetched successfully",
      meta: { page: pagination.page, limit: pagination.limit },
      data: result
    });
  } catch (error) {
    next(error);
  }
};
var getUserReviews2 = async (req, res, next) => {
  try {
    const customerId = req.user?.id;
    if (!customerId) {
      throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
    }
    const pagination = paginationSortingHelper_default(req.query);
    const result = await ReviewService.getUserReviews(customerId, pagination);
    res.status(200).json({
      success: true,
      message: "Your reviews fetched successfully",
      meta: { page: pagination.page, limit: pagination.limit },
      data: result
    });
  } catch (error) {
    next(error);
  }
};
var updateReview2 = async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const customerId = req.user?.id;
    if (!customerId) {
      throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
    }
    const { rating, comment } = req.body;
    if (rating !== void 0 && (typeof rating !== "number" || rating < 1 || rating > 5)) {
      throw Object.assign(
        new Error("Rating must be a number between 1 and 5"),
        {
          statusCode: 400
        }
      );
    }
    if (comment !== void 0 && (typeof comment !== "string" || comment.trim().length < 3)) {
      throw Object.assign(new Error("Comment must be at least 3 characters"), {
        statusCode: 400
      });
    }
    const result = await ReviewService.updateReview(id, customerId, {
      rating,
      comment: typeof comment === "string" ? comment.trim() : void 0
    });
    res.status(200).json({
      success: true,
      message: "Review updated successfully",
      data: result
    });
  } catch (error) {
    next(error);
  }
};
var deleteReview2 = async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const customerId = req.user?.id;
    if (!customerId) {
      throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
    }
    await ReviewService.deleteReview(id, customerId);
    res.status(200).json({
      success: true,
      message: "Review deleted successfully"
    });
  } catch (error) {
    next(error);
  }
};
var ReviewController = {
  createReview: createReview2,
  getMedicineReviews: getMedicineReviews2,
  getUserReviews: getUserReviews2,
  updateReview: updateReview2,
  deleteReview: deleteReview2
};

// src/modules/reviews/review.route.ts
var router2 = express5.Router();
router2.get("/medicine/:medicineId", ReviewController.getMedicineReviews);
router2.post(
  "/",
  auth_middleware_default({ roles: ["CUSTOMER" /* CUSTOMER */], requireVerifiedEmail: true }),
  ReviewController.createReview
);
router2.get(
  "/",
  auth_middleware_default({ roles: ["CUSTOMER" /* CUSTOMER */], requireVerifiedEmail: true }),
  ReviewController.getUserReviews
);
router2.put(
  "/:id",
  auth_middleware_default({ roles: ["CUSTOMER" /* CUSTOMER */], requireVerifiedEmail: true }),
  ReviewController.updateReview
);
router2.delete(
  "/:id",
  auth_middleware_default({ roles: ["CUSTOMER" /* CUSTOMER */], requireVerifiedEmail: true }),
  ReviewController.deleteReview
);
var ReviewRouter = router2;

// src/middleware/NotFound.ts
function notFound(req, res) {
  res.status(404).json({
    success: false,
    message: "Route not found",
    path: req.originalUrl,
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  });
}

// src/middleware/globalErrorHandler.ts
import { Prisma as Prisma3 } from "@prisma/client";
function globalErrorHandler(err, req, res, next) {
  let statusCode = typeof err?.statusCode === "number" ? err.statusCode : 500;
  let message = typeof err?.message === "string" && err.message.trim().length > 0 ? err.message : "Internal Server Error";
  if (err instanceof Prisma3.PrismaClientValidationError) {
    statusCode = 400;
    message = "Invalid data provided.";
  } else if (err instanceof Prisma3.PrismaClientKnownRequestError) {
    switch (err.code) {
      case "P2002":
        statusCode = 409;
        message = "Duplicate value violates unique constraint.";
        break;
      case "P2025":
        statusCode = 404;
        message = "Requested resource not found.";
        break;
      case "P2003":
        statusCode = 409;
        message = "Foreign key constraint violation.";
        break;
      case "P2007":
        statusCode = 400;
        message = "Invalid input data.";
        break;
      default:
        statusCode = 400;
        message = "Database request error.";
    }
  } else if (err instanceof Prisma3.PrismaClientUnknownRequestError) {
    statusCode = 500;
    message = "Unexpected database error.";
  } else if (err?.name === "UnauthorizedError") {
    statusCode = 401;
    message = "Unauthorized access.";
  } else if (err?.name === "ForbiddenError") {
    statusCode = 403;
    message = "Forbidden access.";
  }
  res.status(statusCode).json({
    success: false,
    message,
    ...process.env.NODE_ENV === "development" && {
      stack: err?.stack,
      prismaCode: err?.code
    }
  });
}
var globalErrorHandler_default = globalErrorHandler;

// src/app.ts
var app = express6();
app.use(express6.json());
app.use(
  cors({
    origin: process.env.APP_URL,
    credentials: true
  })
);
app.all("/api/auth/*splat", toNodeHandler(auth));
app.use("/api/v1/users", UserRouter);
app.use("/api/v1/categories", CategoryRouter);
app.use("/api/v1/reviews", ReviewRouter);
app.use("/api/v1/medicines", MedicineRouter);
app.use("/api/v1/seller/medicines", SellerMedicineRouter);
app.use("/api/v1/admin/medicines", AdminMedicineRouter);
app.use("/api/v1/orders", OrderRouter);
app.use("/api/v1/seller/orders", SellerOrderRouter);
app.use("/api/v1/admin/orders", AdminOrderRouter);
app.use("/api/v1/admin/users", AdminUserRouter);
app.get("/", (req, res) => {
  res.send("Hello World To Medi Store");
});
app.use(notFound);
app.use(globalErrorHandler_default);
var app_default = app;

// src/index.ts
var index_default = app_default;
export {
  index_default as default
};
