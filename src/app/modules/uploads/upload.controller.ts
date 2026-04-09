import { Request, Response } from "express";
import status from "http-status";
import catchAsync from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { uploadBufferToCloudinary } from "../../lib/cloudinary";
import AppError from "../../error/AppError";

const uploadImage = catchAsync(async (req: Request, res: Response) => {
  if (!req.file) {
    throw new AppError(status.BAD_REQUEST, "No file uploaded");
  }

  const result = await uploadBufferToCloudinary(req.file.buffer, {
    folder: "medistore/uploads",
  });

  sendResponse(res, {
    success: true,
    statusCode: status.OK,
    message: "Image uploaded successfully",
    data: {
      url: result.secure_url,
      publicId: result.public_id,
    },
  });
});

export const UploadController = {
  uploadImage,
};
