/**
 * User roles for the application.
 * Exported as an object to match existing usage (UserRole.ADMIN) 
 * while centralizing the definition.
 */
export const UserRole = {
  CUSTOMER: "CUSTOMER",
  SELLER: "SELLER",
  ADMIN: "ADMIN",
} as const;

export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const USER_ROLES = Object.values(UserRole);
