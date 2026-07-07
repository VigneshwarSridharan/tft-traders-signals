import type {
  BounceClass,
  CustomFieldType,
  MessageStatus,
  SenderAccountStatus,
  SuppressionReason,
  TemplateStatus,
  TrackingEventType,
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

export interface TemplateCategoryRow {
  id: string;
  name: string;
  default_template_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface EmailTemplateRow {
  id: string;
  category_id: string;
  name: string;
  status: TemplateStatus;
  current_version_id: string | null;
  created_by: string | null;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface TemplateVersionRow {
  id: string;
  template_id: string;
  version_no: number;
  subject: string;
  body_html: string;
  body_text: string | null;
  placeholders: string[];
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface EmailMessageRow {
  id: string;
  public_token: string;
  sender_account_id: string;
  customer_id: string;
  template_version_id: string | null;
  sent_by: string | null;
  to_email: string;
  to_name: string | null;
  subject: string | null;
  body_html_rendered: string | null;
  body_text_rendered: string | null;
  message_id_header: string | null;
  tracking_enabled: boolean;
  status: MessageStatus;
  smtp_response: string | null;
  queued_at: Date | null;
  sent_at: Date | null;
  open_count: number;
  unique_open_hint: boolean;
  first_opened_at: Date | null;
  last_opened_at: Date | null;
  click_count: number;
  first_clicked_at: Date | null;
  last_clicked_at: Date | null;
  replied_at: Date | null;
  bounce_type: 'none' | 'hard' | 'soft';
  unsubscribed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface ScheduledSendRow {
  id: string;
  message_id: string;
  scheduled_for: Date;
  timezone: string | null;
  job_id: string | null;
  cancelled_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface EmailLinkRow {
  id: string;
  message_id: string;
  token: string;
  original_url: string;
  link_label: string | null;
  position: number | null;
  click_count: number;
  created_at: Date;
  updated_at: Date;
}

export interface TrackingEventRow {
  id: string;
  message_id: string;
  link_id: string | null;
  event_type: TrackingEventType;
  occurred_at: Date;
  ip: string | null;
  user_agent: string | null;
  device_type: string | null;
  os: string | null;
  browser: string | null;
  geo_country: string | null;
  geo_city: string | null;
  is_bot: boolean;
  is_proxy: boolean;
  metadata: Record<string, unknown>;
}

export interface AttachmentRow {
  id: string;
  message_id: string;
  filename: string;
  content_type: string | null;
  size_bytes: number | null;
  storage_path: string;
  created_at: Date;
  updated_at: Date;
}

export interface InboundMessageRow {
  id: string;
  sender_account_id: string;
  imap_uid: string;
  message_id_header: string | null;
  in_reply_to: string | null;
  references_header: string | null;
  from_email: string | null;
  subject: string | null;
  received_at: Date | null;
  classification: 'bounce_dsn' | 'reply' | 'other';
  matched_message_id: string | null;
  raw_headers: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export interface BounceRow {
  id: string;
  message_id: string;
  inbound_message_id: string | null;
  bounce_class: BounceClass;
  status_code: string | null;
  diagnostic: string | null;
  bounced_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface SuppressionRow {
  id: string;
  email: string;
  customer_id: string | null;
  reason: SuppressionReason;
  source_message_id: string | null;
  suppressed_at: Date;
  released_at: Date | null;
  released_by: string | null;
  created_at: Date;
  updated_at: Date;
}
