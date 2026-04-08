import { betterAuth } from "better-auth";

import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./prisma";

import nodemailer from "nodemailer";

import { getVerificationEmailHtml } from './mail-template';
import { envVars } from '../config/env';

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
  user: {
    additionalFields: {
      role: {
        type: "string",
        defaultValue: "CUSTOMER",
      },
      isBanned: {
        type: "boolean",
        defaultValue: false,
      },
      phone: {
        type: "string",
        defaultValue: "",
      },
    },
  },
  trustedOrigins: [envVars.FRONTEND_URL, envVars.BETTER_AUTH_URL].filter(Boolean),
  emailAndPassword: {
    enabled: true,
    autoSignIn: false,
    requireEmailVerification: true,
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url, token }, request) => {
      try {
        const verificationUrl = `${envVars.FRONTEND_URL}/verify-email?token=${token}`;

        const info = await transporter.sendMail({
          from: '"Medi-Store" <medi-store@gmail.com>',
          to: user.email,
          subject: "Please verify your email!",
          html: getVerificationEmailHtml(verificationUrl, user.email),
        });

        console.log("Email sent:", info.messageId);
      } catch (error) {
        console.error("Error sending email:", error);
        throw error;
      }
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
});
