export const USER_ROLES = ["admin", "manager", "agent", "viewer"] as const;

export type UserRole = (typeof USER_ROLES)[number];
