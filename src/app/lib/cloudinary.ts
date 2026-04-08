import { v2 as cloudinary, UploadApiOptions } from "cloudinary";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import { envVars } from "../config/env";

cloudinary.config({
  cloud_name: envVars.CLOUDINARY.CLOUDINARY_CLOUD_NAME,
  api_key: envVars.CLOUDINARY.CLOUDINARY_API_KEY,
  api_secret: envVars.CLOUDINARY.CLOUDINARY_API_SECRET,
  secure: true,
});

export const uploadBufferToCloudinary = (
  buffer: Buffer,
  options: UploadApiOptions = {}
): Promise<{ secure_url: string; public_id: string; bytes: number; resource_type: string }> => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error || !result) {
        return reject(error ?? new Error("Cloudinary upload failed"));
      }

      resolve({
        secure_url: result.secure_url,
        public_id: result.public_id,
        bytes: result.bytes,
        resource_type: result.resource_type,
      });
    });

    stream.end(buffer);
  });
};

const createCloudinaryStorage = (
  folderName: string,
  resourceType: "image" | "raw" | "video" | "auto" = "image"
) => {
  return new CloudinaryStorage({
    cloudinary: cloudinary,
    params: async (req, file) => {
      const timestamp = Date.now();
      const fileName = file.originalname.split(".")[0].replace(/\s+/g, "-");

      const userId = req.user?.id ? `${req.user.id}/` : "";

      return {
        folder: `${folderName}/${userId}`.replace(/\/$/, ""),
        resource_type: resourceType,
        public_id: `${fileName}-${timestamp}`,
        allowed_formats: ["jpg", "png", "jpeg", "webp", "gif"],
      };
    },
  });
};

export const userProfileStorage = createCloudinaryStorage(envVars.CLOUDINARY.USER_PROFILE_FOLDER);

export const medicineStorage = createCloudinaryStorage(envVars.CLOUDINARY.MEDICINE_FOLDER);

export const categoryStorage = createCloudinaryStorage(envVars.CLOUDINARY.CATEGORY_FOLDER);

export const getPublicIdFromUrl = (fileUrl: string): string | null => {
  if (!fileUrl) return null;

  try {
    const url = new URL(fileUrl);
    const pathname = url.pathname;

    const uploadMatch = pathname.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.[^.]+)?$/);

    if (uploadMatch && uploadMatch[1]) {
      return decodeURIComponent(uploadMatch[1]);
    }

    return null;
  } catch {
    return null;
  }
};

export const destroyCloudinaryAssetByUrl = async (fileUrl: string): Promise<boolean> => {
  const publicId = getPublicIdFromUrl(fileUrl);

  if (!publicId) return false;

  const resourceTypes: Array<"image" | "raw" | "video"> = ["image", "raw", "video"];

  for (const resourceType of resourceTypes) {
    try {
      const result = await cloudinary.uploader.destroy(publicId, {
        invalidate: true,
        resource_type: resourceType,
      });

      if (result.result === "ok") {
        return true;
      }

      if (result.result === "not found") {
        continue;
      }
    } catch (error) {
      console.error(`Error deleting Cloudinary asset (${resourceType}):`, error);
      continue;
    }
  }

  return false;
};

export { cloudinary };
