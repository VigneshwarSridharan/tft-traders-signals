import type { UserRole } from "./user-role";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  theme: "system" | "light" | "dark";
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AcceptInvitationRequest {
  token: string;
  password: string;
}

export interface InviteUserRequest {
  email: string;
  name: string;
  role: UserRole;
}

export interface InvitationSummary {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  invitedBy: string;
  expiresAt: string;
  createdAt: string;
}

export interface InviteUserResponse {
  invitation: InvitationSummary;
  acceptUrl: string;
}
