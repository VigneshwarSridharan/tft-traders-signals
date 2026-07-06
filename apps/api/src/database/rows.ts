import type {
  CustomFieldType,
  SenderAccountStatus,
  UserRole,
} from '@tft/shared';

export interface UserRow {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  role: UserRole;
  is_active: boolean;
  last_login_at: Date | null;
  theme: 'system' | 'light' | 'dark';
  created_at: Date;
  updated_at: Date;
}

export interface SessionRow {
  id: string;
  user_id: string;
  refresh_token_hash: string;
  user_agent: string | null;
  ip: string | null;
  expires_at: Date;
  revoked_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface InvitationRow {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  token_hash: string;
  invited_by: string;
  expires_at: Date;
  accepted_at: Date | null;
  revoked_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface SenderAccountRow {
  id: string;
  email: string;
  display_name: string | null;
  smtp_host: string;
  smtp_port: number;
  imap_host: string;
  imap_port: number;
  credential_enc: Buffer;
  signature_html: string | null;
  daily_quota: number | null;
  hourly_quota: number | null;
  status: SenderAccountStatus;
  last_verified_at: Date | null;
  imap_last_uid: string;
  created_at: Date;
  updated_at: Date;
}

export interface CustomerRow {
  id: string;
  name: string;
  company: string | null;
  email: string;
  phone: string | null;
  notes: string | null;
  tracking_opt_out: boolean;
  engagement_score: number;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface CustomFieldDefRow {
  id: string;
  key: string;
  label: string;
  field_type: CustomFieldType;
  created_at: Date;
  updated_at: Date;
}

export interface CustomerFieldValueRow {
  customer_id: string;
  field_def_id: string;
  value: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface TagRow {
  id: string;
  name: string;
  color: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface SuppressionFlagsRow {
  email: string;
  suppressed: boolean;
  unsubscribed: boolean;
}
