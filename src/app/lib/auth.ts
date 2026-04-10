import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { oAuthProxy } from "better-auth/plugins";
import nodemailer from "nodemailer";

import { envVars } from "../config/env";
import { UserRole } from "../constants/user";
import { getVerificationEmailHtml } from "./mail-template";
import { getAllowedOrigins, getPrimaryFrontendOrigin } from "../config/origins";
import { prisma } from "./prisma";

const transporter = nodemailer.createTransport({
  host: envVars.EMAIL_SENDER.SMTP_HOST,
  port: Number(envVars.EMAIL_SENDER.SMTP_PORT),
  secure: envVars.EMAIL_SENDER.SMTP_PORT === "465",
  auth: {
    user: envVars.EMAIL_SENDER.SMTP_USER,
    pass: envVars.EMAIL_SENDER.SMTP_PASS,
  },
});

const trustedOrigins = getAllowedOrigins(envVars.FRONTEND_URL);
const frontendBase = getPrimaryFrontendOrigin(envVars.FRONTEND_URL);

console.log("Better Auth config:", {
  NODE_ENV: envVars.NODE_ENV,
  BETTER_AUTH_URL: envVars.BETTER_AUTH_URL,
  FRONTEND_URL: envVars.FRONTEND_URL,
  trustedOrigins,
});

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),

  // This must point to the actual backend auth endpoint
  baseURL: envVars.BETTER_AUTH_URL,

  // These are the frontend origins allowed to call auth
  trustedOrigins,

  emailAndPassword: {
    enabled: true,
    autoSignIn: false,
    requireEmailVerification: true,
  },

  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, token }) => {
      const verificationUrl = `${frontendBase}/verify-email?token=${token}`;

      const info = await transporter.sendMail({
        from: `"MediStore" <${envVars.EMAIL_SENDER.SMTP_FROM}>`,
        to: user.email,
        subject: "Please verify your email",
        html: getVerificationEmailHtml(verificationUrl, user.email),
      });

      console.log("Verification email sent:", info.messageId);
    },
  },

  socialProviders: {
    google: {
      prompt: "select_account consent",
      accessType: "offline",
      clientId: envVars.GOOGLE_CLIENT_ID,
      clientSecret: envVars.GOOGLE_CLIENT_SECRET,
    },
  },

  user: {
    additionalFields: {
      role: {
        type: "string",
        defaultValue: UserRole.CUSTOMER,
      },
      isActive: {
        type: "boolean",
        required: true,
        defaultValue: true,
      },
      isDeleted: {
        type: "boolean",
        required: true,
        defaultValue: false,
      },
      deletedAt: {
        type: "date",
        required: false,
        defaultValue: null,
      },
      isBanned: {
        type: "boolean",
        required: true,
        defaultValue: false,
      },
      phone: {
        type: "string",
        required: false,
        defaultValue: "",
      },
    },
  },

  plugins: [oAuthProxy()],

  advanced: {
    useSecureCookies: envVars.NODE_ENV === "production",
    trustProxy: true,
    cookies: {
      session_token: {
        name: "mediStore_session",
        attributes: {
          httpOnly: true,
          secure: envVars.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
        },
      },
    },
  },
});
