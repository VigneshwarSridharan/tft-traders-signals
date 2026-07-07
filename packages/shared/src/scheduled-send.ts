export interface ScheduledSendListItem {
  messageId: string;
  toEmail: string;
  toName: string | null;
  subject: string | null;
  senderAccountId: string;
  senderAccountEmail: string;
  senderAccountDisplayName: string | null;
  scheduledFor: string;
  timezone: string | null;
  createdAt: string;
}

export interface ScheduledSendListResponse {
  items: ScheduledSendListItem[];
  total: number;
}

export interface RescheduleSendRequest {
  scheduledFor: string;
  timezone?: string;
}
