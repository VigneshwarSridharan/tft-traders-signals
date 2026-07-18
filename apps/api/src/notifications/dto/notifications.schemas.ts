import { z } from 'zod';

export const listNotificationsQuerySchema = z.object({
  unreadOnly: z.preprocess((value) => value === 'true', z.boolean()).optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});
export type ListNotificationsQueryDto = z.infer<
  typeof listNotificationsQuerySchema
>;

const channelPrefsSchema = z.object({
  inApp: z.boolean().optional(),
  emailDigest: z.boolean().optional(),
});

export const updateNotificationPreferencesSchema = z.object({
  first_open: channelPrefsSchema.optional(),
  click: channelPrefsSchema.optional(),
  reply: channelPrefsSchema.optional(),
  bounce: channelPrefsSchema.optional(),
  send_failed: channelPrefsSchema.optional(),
  quota_warning: channelPrefsSchema.optional(),
});
export type UpdateNotificationPreferencesDto = z.infer<
  typeof updateNotificationPreferencesSchema
>;
