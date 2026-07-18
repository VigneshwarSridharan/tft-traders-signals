import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  NOTIFICATION_TYPES,
  type NotificationPreferences,
  type NotificationSummary,
  type NotificationType,
  type UpdateNotificationPreferencesRequest,
} from '@tft/shared';
import { NotificationsRepository } from '../database/notifications.repository';
import { UsersRepository } from '../database/users.repository';
import { toNotificationSummary } from './notifications.mapper';

export interface NotifyInput {
  userId: string | null;
  type: NotificationType;
  title: string;
  body?: string | null;
  messageId?: string | null;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

function mergePreferences(
  stored: Partial<NotificationPreferences> | null | undefined,
  patch?: UpdateNotificationPreferencesRequest,
): NotificationPreferences {
  const merged = {} as NotificationPreferences;
  for (const type of NOTIFICATION_TYPES) {
    merged[type] = {
      ...DEFAULT_NOTIFICATION_PREFERENCES[type],
      ...stored?.[type],
      ...patch?.[type],
    };
  }
  return merged;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly notificationsRepository: NotificationsRepository,
    private readonly usersRepository: UsersRepository,
  ) {}

  async listForUser(
    userId: string,
    options: { unreadOnly?: boolean; limit?: number } = {},
  ): Promise<NotificationSummary[]> {
    const rows = await this.notificationsRepository.listForUser(
      userId,
      options,
    );
    return rows.map(toNotificationSummary);
  }

  countUnread(userId: string): Promise<number> {
    return this.notificationsRepository.countUnread(userId);
  }

  async markRead(id: string, userId: string): Promise<NotificationSummary> {
    const row = await this.notificationsRepository.markRead(id, userId);
    if (!row) {
      throw new NotFoundException('Notification not found');
    }
    return toNotificationSummary(row);
  }

  async markAllRead(userId: string): Promise<void> {
    await this.notificationsRepository.markAllRead(userId);
  }

  async getPreferences(userId: string): Promise<NotificationPreferences> {
    const user = await this.usersRepository.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return mergePreferences(user.notification_prefs);
  }

  async updatePreferences(
    userId: string,
    patch: UpdateNotificationPreferencesRequest,
  ): Promise<NotificationPreferences> {
    const user = await this.usersRepository.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const merged = mergePreferences(user.notification_prefs, patch);
    await this.usersRepository.updateNotificationPrefs(userId, merged);
    return merged;
  }

  /**
   * Creates an in-app notification for `userId` if they have that type's
   * in-app channel enabled. Never throws — a notification bug must not break
   * the send/tracking/inbound pipeline that triggered it.
   */
  async notify(input: NotifyInput): Promise<void> {
    if (!input.userId) {
      return;
    }
    try {
      const prefs = await this.getPreferences(input.userId);
      if (!prefs[input.type].inApp) {
        return;
      }
      await this.notificationsRepository.create({
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body ?? null,
        messageId: input.messageId ?? null,
      });
    } catch (error) {
      this.logger.error(
        `Failed to create ${input.type} notification for user ${input.userId}: ${toErrorMessage(error)}`,
      );
    }
  }

  /** Notifies every active admin, respecting each admin's own preferences. */
  async notifyAdmins(input: Omit<NotifyInput, 'userId'>): Promise<void> {
    const users = await this.usersRepository.list();
    const admins = users.filter(
      (user) => user.role === 'admin' && user.is_active,
    );
    await Promise.all(
      admins.map((admin) => this.notify({ ...input, userId: admin.id })),
    );
  }
}
