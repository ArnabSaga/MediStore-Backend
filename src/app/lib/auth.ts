import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { oAuthProxy } from "better-auth/plugins";
import nodemailer from "nodemailer";

import { envVars } from "../config/env";
import { UserRole } from "../constants/user";
import { getVerificationEmailHtml } from "./mail-template";
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

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),

  baseURL: envVars.BETTER_AUTH_URL,
  trustedOrigins: [envVars.FRONTEND_URL, envVars.BETTER_AUTH_URL].filter(Boolean),

  emailAndPassword: {
    enabled: true,
    autoSignIn: false,
    requireEmailVerification: true,
  },

  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, token }) => {
      const verificationUrl = `${envVars.FRONTEND_URL}/verify-email?token=${token}`;

      const info = await transporter.sendMail({
        from: `"Medi-Store" <${envVars.EMAIL_SENDER.SMTP_FROM}>`,
        to: user.email,
        subject: "Please verify your email!",
        html: getVerificationEmailHtml(verificationUrl, user.email),
      });

      console.log("Email sent:", info.messageId);
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
    cookies: {
      session_token: {
        name: "mediStore_session",
        attributes: {
          httpOnly: true,
          secure: envVars.NODE_ENV === "production",
          sameSite: "lax",
        },
      },
    },
  },
});
