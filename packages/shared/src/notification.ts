export const NOTIFICATION_TYPES = [
  "first_open",
  "click",
  "reply",
  "bounce",
  "send_failed",
  "quota_warning",
  "follow_up_due",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface NotificationChannelPrefs {
  inApp: boolean;
  emailDigest: boolean;
}

export type NotificationPreferences = Record<
  NotificationType,
  NotificationChannelPrefs
>;

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  first_open: { inApp: true, emailDigest: false },
  click: { inApp: true, emailDigest: false },
  reply: { inApp: true, emailDigest: false },
  bounce: { inApp: true, emailDigest: false },
  send_failed: { inApp: true, emailDigest: false },
  quota_warning: { inApp: true, emailDigest: false },
  follow_up_due: { inApp: true, emailDigest: false },
};

export interface NotificationSummary {
  id: string;
  type: NotificationType;
  messageId: string | null;
  title: string;
  body: string | null;
  readAt: string | null;
  createdAt: string;
}

export type UpdateNotificationPreferencesRequest = Partial<
  Record<NotificationType, Partial<NotificationChannelPrefs>>
>;
