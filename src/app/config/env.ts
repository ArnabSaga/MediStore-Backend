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
  CLOUDINARY: {
    CLOUDINARY_CLOUD_NAME: string;
    CLOUDINARY_API_KEY: string;
    CLOUDINARY_API_SECRET: string;
    USER_PROFILE_FOLDER: string;
    MEDICINE_FOLDER: string;
    CATEGORY_FOLDER: string;
  };
  AI_ENABLED: boolean;
  AI_PROVIDER: string;
  GEMINI_API_KEY: string;
  GEMINI_MODEL: string;
  AI_TIMEOUT_MS: number;
  AI_MAX_TOOL_ROUNDS: number;
  AI_MAX_TOOL_CALLS: number;
}

const requireEnv = (name: string): string => {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new AppError(
      status.INTERNAL_SERVER_ERROR,
      `Critical env var {${name}} is not set.`
    );
  }

  return value;
};

const parsePositiveIntegerEnv = (name: string, fallback: number): number => {
  const rawValue = process.env[name]?.trim();

  if (!rawValue) {
    return fallback;
  }

  const value = Number(rawValue);

  if (!Number.isInteger(value) || value <= 0) {
    throw new AppError(
      status.INTERNAL_SERVER_ERROR,
      `Env var {${name}} must be a positive integer.`
    );
  }

  return value;
};

const loadEnvVariables = (): EnvConfig => {
  const isVercel = process.env.VERCEL === "1" || !!process.env.VERCEL_ENV;
  const nodeEnv =
    process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production"
      ? "production"
      : "development";

  const isLocalDev = !isVercel;

  const localFrontendUrl = "http://localhost:3000";
  const localAuthUrl = "http://localhost:3000/api/auth";

  const productionRequiredVars = [
    "DATABASE_URL",
    "BETTER_AUTH_SECRET",
    "BETTER_AUTH_URL",
    "FRONTEND_URL",
    "EMAIL_SENDER_SMTP_HOST",
    "EMAIL_SENDER_SMTP_PORT",
    "EMAIL_SENDER_SMTP_USER",
    "EMAIL_SENDER_SMTP_PASS",
    "EMAIL_SENDER_SMTP_FROM",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "CLOUDINARY_CLOUD_NAME",
    "CLOUDINARY_API_KEY",
    "CLOUDINARY_API_SECRET",
  ];

  if (!isLocalDev) {
    productionRequiredVars.forEach(requireEnv);
  } else {
    requireEnv("DATABASE_URL");
    requireEnv("BETTER_AUTH_SECRET");
  }

  const aiEnabled = process.env.AI_ENABLED?.trim().toLowerCase() === "true";
  const aiProvider = process.env.AI_PROVIDER?.trim().toLowerCase() || "gemini";
  let geminiApiKey = process.env.GEMINI_API_KEY?.trim() || "";
  let geminiModel = process.env.GEMINI_MODEL?.trim() || "";

  if (aiEnabled) {
    geminiApiKey = requireEnv("GEMINI_API_KEY");
    geminiModel = requireEnv("GEMINI_MODEL");

    if (aiProvider !== "gemini") {
      throw new AppError(
        status.INTERNAL_SERVER_ERROR,
        `Unsupported AI provider {${aiProvider}}. Only "gemini" is supported.`
      );
    }
  }

  return {
    NODE_ENV: nodeEnv,
    PORT: process.env.PORT as string,
    DATABASE_URL: process.env.DATABASE_URL as string,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET as string,
    BETTER_AUTH_URL: isLocalDev
      ? (process.env.BETTER_AUTH_URL?.includes("localhost") || process.env.BETTER_AUTH_URL?.includes("127.0.0.1")
          ? process.env.BETTER_AUTH_URL
          : localAuthUrl)
      : process.env.BETTER_AUTH_URL as string,
    FRONTEND_URL: isLocalDev
      ? (process.env.FRONTEND_URL?.includes("localhost") || process.env.FRONTEND_URL?.includes("127.0.0.1")
          ? process.env.FRONTEND_URL
          : localFrontendUrl)
      : process.env.FRONTEND_URL as string,
    EMAIL_SENDER: {
      SMTP_HOST: process.env.EMAIL_SENDER_SMTP_HOST as string,
      SMTP_PORT: process.env.EMAIL_SENDER_SMTP_PORT as string,
      SMTP_USER: process.env.EMAIL_SENDER_SMTP_USER as string,
      SMTP_PASS: process.env.EMAIL_SENDER_SMTP_PASS as string,
      SMTP_FROM: process.env.EMAIL_SENDER_SMTP_FROM as string,
    },
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || "",
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || "",
    CLOUDINARY: {
      CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME as string,
      CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY as string,
      CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET as string,
      USER_PROFILE_FOLDER: process.env.USER_PROFILE_FOLDER as string,
      MEDICINE_FOLDER: process.env.MEDICINE_FOLDER as string,
      CATEGORY_FOLDER: process.env.CATEGORY_FOLDER as string,
    },
    AI_ENABLED: aiEnabled,
    AI_PROVIDER: aiProvider,
    GEMINI_API_KEY: geminiApiKey,
    GEMINI_MODEL: geminiModel,
    AI_TIMEOUT_MS: parsePositiveIntegerEnv("AI_TIMEOUT_MS", 15_000),
    AI_MAX_TOOL_ROUNDS: parsePositiveIntegerEnv("AI_MAX_TOOL_ROUNDS", 3),
    AI_MAX_TOOL_CALLS: parsePositiveIntegerEnv("AI_MAX_TOOL_CALLS", 6),
  };
};

export const envVars = loadEnvVariables();

