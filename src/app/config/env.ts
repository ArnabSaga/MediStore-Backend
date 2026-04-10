import dotenv from "dotenv";
import status from "http-status";
import AppError from "../error/AppError";

dotenv.config();

interface EnvConfig {
  NODE_ENV: string;
  PORT: string;
  DATABASE_URL: string;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  FRONTEND_URL: string;
  EMAIL_SENDER: {
    SMTP_USER: string;
    SMTP_PASS: string;
    SMTP_HOST: string;
    SMTP_PORT: string;
    SMTP_FROM: string;
  };
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GOOGLE_CALLBACK_URL: string;
  CLOUDINARY: {
    CLOUDINARY_CLOUD_NAME: string;
    CLOUDINARY_API_KEY: string;
    CLOUDINARY_API_SECRET: string;
    USER_PROFILE_FOLDER: string;
    MEDICINE_FOLDER: string;
    CATEGORY_FOLDER: string;
  };
  ADMIN_NAME: string;
  ADMIN_EMAIL: string;
  ADMIN_PASSWORD: string;
}

const loadEnvVariables = (): EnvConfig => {
  const isVercel = process.env.VERCEL === "1" || !!process.env.VERCEL_ENV;
  const nodeEnv =
    process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production"
      ? "production"
      : "development";

  const isDev = !isVercel && nodeEnv !== "production";

  const criticalVars = ["DATABASE_URL", "BETTER_AUTH_SECRET"];
  criticalVars.forEach((variable) => {
    if (!process.env[variable]) {
      throw new AppError(
        status.INTERNAL_SERVER_ERROR,
        `Critical env var {${variable}} is not set.`
      );
    }
  });

  [
    "EMAIL_SENDER_SMTP_USER",
    "EMAIL_SENDER_SMTP_PASS",
    "EMAIL_SENDER_SMTP_HOST",
    "EMAIL_SENDER_SMTP_PORT",
    "EMAIL_SENDER_SMTP_FROM",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "CLOUDINARY_CLOUD_NAME",
    "CLOUDINARY_API_KEY",
    "CLOUDINARY_API_SECRET",
    "ADMIN_NAME",
    "ADMIN_EMAIL",
    "ADMIN_PASSWORD",
  ].forEach((v) => {
    if (!process.env[v]) {
      console.warn(`[Config] ${v} is not set — related features may fail.`);
    }
  });

  const localFrontendUrl = "http://localhost:3000";
  const localAuthUrl = "http://localhost:5000/api/auth";
  const localGoogleCallbackUrl = "http://localhost:5000/api/auth/callback/google";

  const productionFrontendUrl = process.env.FRONTEND_URL || process.env.APP_URL || "";
  const productionAuthUrl =
    process.env.BETTER_AUTH_URL || "https://medi-store-backend.vercel.app/api/auth";
  const productionGoogleCallbackUrl =
    process.env.GOOGLE_CALLBACK_URL ||
    "https://medi-store-backend.vercel.app/api/auth/callback/google";

  // Strict validation for production
  if (nodeEnv === "production") {
    const prodCriticalVars = [
      { name: "FRONTEND_URL", value: productionFrontendUrl },
      { name: "BETTER_AUTH_URL", value: productionAuthUrl },
      { name: "ADMIN_NAME", value: process.env.ADMIN_NAME },
      { name: "ADMIN_EMAIL", value: process.env.ADMIN_EMAIL },
      { name: "ADMIN_PASSWORD", value: process.env.ADMIN_PASSWORD },
      { name: "SMTP_HOST", value: process.env.EMAIL_SENDER_SMTP_HOST },
      { name: "SMTP_USER", value: process.env.EMAIL_SENDER_SMTP_USER },
      { name: "SMTP_PASS", value: process.env.EMAIL_SENDER_SMTP_PASS },
      { name: "SMTP_PORT", value: process.env.EMAIL_SENDER_SMTP_PORT },
      { name: "SMTP_FROM", value: process.env.EMAIL_SENDER_SMTP_FROM },
    ];

    prodCriticalVars.forEach((v) => {
      if (!v.value) {
        throw new AppError(
          status.INTERNAL_SERVER_ERROR,
          `Production Check: Env var {${v.name}} is missing. This is required for secure operation.`
        );
      }
    });
  }

  return {
    NODE_ENV: nodeEnv,
    PORT: process.env.PORT || "5000",
    DATABASE_URL: process.env.DATABASE_URL as string,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET as string,
    BETTER_AUTH_URL: isDev ? localAuthUrl : productionAuthUrl,
    FRONTEND_URL: isDev ? localFrontendUrl : productionFrontendUrl,
    EMAIL_SENDER: {
      SMTP_HOST: process.env.EMAIL_SENDER_SMTP_HOST || "",
      SMTP_PORT: process.env.EMAIL_SENDER_SMTP_PORT || "587",
      SMTP_USER: process.env.EMAIL_SENDER_SMTP_USER || "",
      SMTP_PASS: process.env.EMAIL_SENDER_SMTP_PASS || "",
      SMTP_FROM: process.env.EMAIL_SENDER_SMTP_FROM || "",
    },
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || "",
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || "",
    GOOGLE_CALLBACK_URL: isDev ? localGoogleCallbackUrl : productionGoogleCallbackUrl,
    CLOUDINARY: {
      CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME || "",
      CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY || "",
      CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET || "",
      USER_PROFILE_FOLDER: process.env.USER_PROFILE_FOLDER || "medistore/profiles",
      MEDICINE_FOLDER: process.env.MEDICINE_FOLDER || "medistore/medicines",
      CATEGORY_FOLDER: process.env.CATEGORY_FOLDER || "medistore/categories",
    },
    ADMIN_NAME: process.env.ADMIN_NAME || "",
    ADMIN_EMAIL: process.env.ADMIN_EMAIL || "",
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || "",
  };
};

export const envVars = loadEnvVariables();
