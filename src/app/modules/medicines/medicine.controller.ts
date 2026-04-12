import { Request, Response } from "express";
import status from "http-status";

import AppError from "../../error/AppError";
import catchAsync from "../../utils/catchAsync";
import { queryHelper } from "../../utils/queryHelper";
import { sendResponse } from "../../utils/sendResponse";
import { MedicineService } from "./medicine.service";

const getRequiredParam = (value: unknown, fieldName: string) => {
  const parsed = queryHelper.getSingleValue(value);

  if (parsed === undefined || parsed === null || parsed === "") {
    throw new AppError(status.BAD_REQUEST, `${fieldName} is required`);
  }

  return String(parsed);
};

const createMedicine = catchAsync(async (req: Request, res: Response) => {
  const result = await MedicineService.createMedicine({
    ...req.body,
    sellerId: req.user!.id,
  });

  sendResponse(res, {
    success: true,
    statusCode: status.CREATED,
    message: "Medicine created successfully",
    data: result,
  });
});

const getAllMedicines = catchAsync(async (req: Request, res: Response) => {
  const result = await MedicineService.getAllMedicines(req.query as Record<string, unknown>);

  sendResponse(res, {
    success: true,
    statusCode: status.OK,
    message: "Medicines fetched successfully",
    meta: result.meta,
    data: result.data,
  });
});

const getMedicineById = catchAsync(async (req: Request, res: Response) => {
  const medicineId = getRequiredParam(req.params.id, "Medicine id");
  const result = await MedicineService.getMedicineById(medicineId);

  sendResponse(res, {
    success: true,
    statusCode: status.OK,
    message: "Medicine fetched successfully",
    data: result,
  });
});

const getSellerMedicines = catchAsync(async (req: Request, res: Response) => {
  const result = await MedicineService.getSellerMedicines(
    req.user!.id,
    req.query as Record<string, unknown>
  );

  sendResponse(res, {
    success: true,
    statusCode: status.OK,
    message: "Seller medicines fetched successfully",
    meta: result.meta,
    data: result.data,
  });
});

const updateMedicine = catchAsync(async (req: Request, res: Response) => {
  const medicineId = getRequiredParam(req.params.id, "Medicine id");

  const result = await MedicineService.updateMedicineForSeller(medicineId, req.body, req.user!.id);

  sendResponse(res, {
    success: true,
    statusCode: status.OK,
    message: "Medicine updated successfully",
    data: result,
  });
});

const deleteMedicine = catchAsync(async (req: Request, res: Response) => {
  const medicineId = getRequiredParam(req.params.id, "Medicine id");
  await MedicineService.deleteMedicineForSeller(medicineId, req.user!.id);

  sendResponse(res, {
    success: true,
    statusCode: status.OK,
    message: "Medicine deleted successfully",
    data: null,
  });
});

const adminUpdateMedicine = catchAsync(async (req: Request, res: Response) => {
  const medicineId = getRequiredParam(req.params.id, "Medicine id");
  const result = await MedicineService.updateMedicineAsAdmin(medicineId, req.body);

  sendResponse(res, {
    success: true,
    statusCode: status.OK,
    message: "Medicine updated successfully",
    data: result,
  });
});

const adminDeleteMedicine = catchAsync(async (req: Request, res: Response) => {
  const medicineId = getRequiredParam(req.params.id, "Medicine id");
  const hardDelete = queryHelper.getSingleValue(req.query.hardDelete) === "true";

  await MedicineService.deleteMedicineAsAdmin(medicineId, { hardDelete });

  sendResponse(res, {
    success: true,
    statusCode: status.OK,
    message: hardDelete
      ? "Medicine permanently deleted successfully"
      : "Medicine deleted successfully",
    data: null,
  });
});

export const MedicineController = {
  createMedicine,
  getAllMedicines,
  getMedicineById,
  getSellerMedicines,
  updateMedicine,
  deleteMedicine,
  adminUpdateMedicine,
  adminDeleteMedicine,
};
