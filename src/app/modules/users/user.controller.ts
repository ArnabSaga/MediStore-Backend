import { NextFunction, Request, Response } from "express";
import { UserService } from "./user.service";

const getCurrentUser = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
    }

    const result = await UserService.getUserById(userId);

    res.status(200).json({
      success: true,
      message: "User fetched successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const updateUserProfile = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
    }

    const result = await UserService.updateUserProfile(userId, req.body);

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const getAllUsers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const role =
      typeof req.query.role === "string" ? req.query.role : undefined;

    let isBanned: boolean | undefined = undefined;
    if (typeof req.query.isBanned === "string") {
      if (req.query.isBanned !== "true" && req.query.isBanned !== "false") {
        throw Object.assign(new Error("isBanned must be 'true' or 'false'"), {
          statusCode: 400,
        });
      }
      isBanned = req.query.isBanned === "true";
    }

    const result = await UserService.getAllUsers(role, isBanned);

    res.status(200).json({
      success: true,
      message: "Users fetched successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const getUserById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);

    if (!id) {
      throw Object.assign(new Error("User id is required"), {
        statusCode: 400,
      });
    }

    const result = await UserService.getUserById(id);

    res.status(200).json({
      success: true,
      message: "User fetched successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const updateUserStatus = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const id = String(req.params.id);
    const { isBanned } = req.body;

    if (typeof isBanned !== "boolean") {
      throw Object.assign(new Error("isBanned must be a boolean"), {
        statusCode: 400,
      });
    }

    const result = await UserService.updateUserStatus(id, isBanned);

    res.status(200).json({
      success: true,
      message: "User status updated successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const changeRole = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    const { role } = req.body;

    if (typeof role !== "string") {
      throw Object.assign(new Error("role must be a string"), {
        statusCode: 400,
      });
    }

    const result = await UserService.changeUserRole(id, role);

    res.status(200).json({
      success: true,
      message: "User role changed successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const deleteUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    const currentUserId = req.user?.id;

    await UserService.deleteUser(id, currentUserId);

    res.status(200).json({
      success: true,
      message: "User deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};

export const UserController = {
  getCurrentUser,
  updateUserProfile,
  getAllUsers,
  getUserById,
  updateUserStatus,
  changeRole,
  deleteUser,
};
