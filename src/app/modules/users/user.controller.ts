import { Request, Response } from "express";
import status from "http-status";

import AppError from "../../error/AppError";
import catchAsync from "../../utils/catchAsync";
import { queryHelper } from "../../utils/queryHelper";
import { sendResponse } from "../../utils/sendResponse";
import { UserService } from "./user.service";

const getRequiredParam = (value: string | string[] | undefined, fieldName: string) => {
  const parsed = queryHelper.getSingleValue(value);
  if (!parsed) {
    throw new AppError(status.BAD_REQUEST, `${fieldName} is required`);
  }
  return parsed;
};

const getMyProfile = catchAsync(async (req: Request, res: Response) => {
  const result = await UserService.getMyProfile(req.user!.id);

  sendResponse(res, {
    success: true,
    statusCode: status.OK,
    message: "Profile fetched successfully",
    data: result,
  });
});

const updateMyProfile = catchAsync(async (req: Request, res: Response) => {
  const result = await UserService.updateMyProfile(req.user!.id, req.body);

  sendResponse(res, {
    success: true,
    statusCode: status.OK,
    message: "Profile updated successfully",
    data: result,
  });
});

const getAllUsers = catchAsync(async (req: Request, res: Response) => {
  const result = await UserService.getAllUsers(req.query as Record<string, unknown>);

  sendResponse(res, {
    success: true,
    statusCode: status.OK,
    message: "Users fetched successfully",
    meta: result.meta,
    data: result.data,
  });
});

const getUserById = catchAsync(async (req: Request, res: Response) => {
  const id = getRequiredParam(req.params.id, "User id");
  const result = await UserService.getUserById(id);

  sendResponse(res, {
    success: true,
    statusCode: status.OK,
    message: "User fetched successfully",
    data: result,
  });
});

const updateUserStatus = catchAsync(async (req: Request, res: Response) => {
  const id = getRequiredParam(req.params.id, "User id");

  const result = await UserService.updateUserStatus({
    targetUserId: id,
    currentAdminId: req.user!.id,
    payload: req.body,
  });

  sendResponse(res, {
    success: true,
    statusCode: status.OK,
    message: "User status updated successfully",
    data: result,
  });
});

const changeUserRole = catchAsync(async (req: Request, res: Response) => {
  const id = getRequiredParam(req.params.id, "User id");
  const result = await UserService.changeUserRole(id, req.body.role, req.user!.id);

  sendResponse(res, {
    success: true,
    statusCode: status.OK,
    message: "User role changed successfully",
    data: result,
  });
});

const deleteUser = catchAsync(async (req: Request, res: Response) => {
  const id = getRequiredParam(req.params.id, "User id");
  const hardDeleteValue = queryHelper.getSingleValue(req.query.hardDelete);
  const hardDelete = hardDeleteValue === "true";

  await UserService.deleteUser(id, req.user!.id, { hardDelete });

  sendResponse(res, {
    success: true,
    statusCode: status.OK,
    message: hardDelete
      ? "User permanently deleted successfully"
      : "User soft deleted successfully",
    data: null,
  });
});

const logout = catchAsync(async (req: Request, res: Response) => {
  const result = await UserService.logout(req.headers);

  if (result.setCookies.length > 0) {
    res.setHeader("Set-Cookie", result.setCookies);
  }

  sendResponse(res, {
    success: true,
    statusCode: status.OK,
    message: "Logged out successfully",
    data: null,
  });
});

export const UserController = {
  getMyProfile,
  updateMyProfile,
  getAllUsers,
  getUserById,
  updateUserStatus,
  changeUserRole,
  deleteUser,
  logout,
};
