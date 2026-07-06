import type { SenderAccountStatus } from "./sender-account-status";

export interface SenderAccountSummary {
  id: string;
  email: string;
  displayName: string | null;
  smtpHost: string;
  smtpPort: number;
  imapHost: string;
  imapPort: number;
  signatureHtml: string | null;
  dailyQuota: number | null;
  hourlyQuota: number | null;
  dailyUsed: number;
  hourlyUsed: number;
  status: SenderAccountStatus;
  lastVerifiedAt: string | null;
  createdAt: string;
}

export interface CreateSenderAccountRequest {
  email: string;
  appPassword: string;
  displayName?: string;
  smtpHost?: string;
  smtpPort?: number;
  imapHost?: string;
  imapPort?: number;
  signatureHtml?: string;
  dailyQuota?: number | null;
  hourlyQuota?: number | null;
}

export interface UpdateSenderAccountRequest {
  displayName?: string;
  smtpHost?: string;
  smtpPort?: number;
  imapHost?: string;
  imapPort?: number;
  appPassword?: string;
  signatureHtml?: string;
  dailyQuota?: number | null;
  hourlyQuota?: number | null;
  status?: Extract<SenderAccountStatus, "active" | "disabled">;
}

export interface VerifySenderAccountResponse {
  status: SenderAccountStatus;
  smtpOk: boolean;
  imapOk: boolean;
  message: string;
  lastVerifiedAt: string | null;
}
