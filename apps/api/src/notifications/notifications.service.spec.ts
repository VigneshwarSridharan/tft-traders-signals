import { NotFoundException } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsRepository } from '../database/notifications.repository';
import { UsersRepository } from '../database/users.repository';
import type { NotificationRow, UserRow } from '../database/rows';

function buildUser(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: 'user-1',
    email: 'agent@example.com',
    name: 'Agent',
    password_hash: 'hash',
    role: 'agent',
    is_active: true,
    last_login_at: null,
    theme: 'system',
    notification_prefs: {},
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

function buildNotificationRow(
  overrides: Partial<NotificationRow> = {},
): NotificationRow {
  return {
    id: 'notification-1',
    user_id: 'user-1',
    type: 'bounce',
    message_id: 'message-1',
    title: 'Email bounced',
    body: null,
    read_at: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

describe('NotificationsService', () => {
  let notificationsRepository: jest.Mocked<NotificationsRepository>;
  let usersRepository: jest.Mocked<UsersRepository>;
  let service: NotificationsService;

  beforeEach(() => {
    notificationsRepository = {
      create: jest.fn().mockResolvedValue(buildNotificationRow()),
      listForUser: jest.fn().mockResolvedValue([]),
      countUnread: jest.fn().mockResolvedValue(0),
      markRead: jest.fn(),
      markAllRead: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<NotificationsRepository>;

    usersRepository = {
      findById: jest.fn().mockResolvedValue(buildUser()),
      list: jest.fn().mockResolvedValue([]),
      updateNotificationPrefs: jest.fn().mockResolvedValue(buildUser()),
    } as unknown as jest.Mocked<UsersRepository>;

    service = new NotificationsService(
      notificationsRepository,
      usersRepository,
    );
  });

  describe('notify', () => {
    it('creates a notification when the user has the event type enabled (default)', async () => {
      await service.notify({
        userId: 'user-1',
        type: 'bounce',
        title: 'Email bounced',
        messageId: 'message-1',
      });

      expect(notificationsRepository.create).toHaveBeenCalledWith({
        userId: 'user-1',
        type: 'bounce',
        title: 'Email bounced',
        body: null,
        messageId: 'message-1',
      });
    });

    it('does not create a notification when the user has disabled that event type', async () => {
      usersRepository.findById.mockResolvedValue(
        buildUser({
          notification_prefs: {
            bounce: { inApp: false, emailDigest: false },
          },
        }),
      );

      await service.notify({
        userId: 'user-1',
        type: 'bounce',
        title: 'Email bounced',
        messageId: 'message-1',
      });

      expect(notificationsRepository.create).not.toHaveBeenCalled();
    });

    it('is a no-op when userId is null', async () => {
      await service.notify({ userId: null, type: 'bounce', title: 'x' });

      expect(notificationsRepository.create).not.toHaveBeenCalled();
      expect(usersRepository.findById).not.toHaveBeenCalled();
    });

    it('swallows errors instead of throwing', async () => {
      notificationsRepository.create.mockRejectedValue(new Error('db down'));

      await expect(
        service.notify({ userId: 'user-1', type: 'bounce', title: 'x' }),
      ).resolves.toBeUndefined();
    });
  });

  describe('notifyAdmins', () => {
    it('notifies only active admins', async () => {
      usersRepository.list.mockResolvedValue([
        buildUser({ id: 'admin-1', role: 'admin', is_active: true }),
        buildUser({ id: 'admin-2', role: 'admin', is_active: false }),
        buildUser({ id: 'agent-1', role: 'agent', is_active: true }),
      ]);
      usersRepository.findById.mockImplementation((id) =>
        Promise.resolve(buildUser({ id })),
      );

      await service.notifyAdmins({
        type: 'quota_warning',
        title: 'Nearing quota',
      });

      expect(notificationsRepository.create).toHaveBeenCalledTimes(1);
      expect(notificationsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'admin-1' }),
      );
    });
  });

  describe('preferences', () => {
    it('returns defaults merged with stored preferences', async () => {
      usersRepository.findById.mockResolvedValue(
        buildUser({
          notification_prefs: { click: { inApp: false, emailDigest: true } },
        }),
      );

      const prefs = await service.getPreferences('user-1');

      expect(prefs.click).toEqual({ inApp: false, emailDigest: true });
      expect(prefs.bounce).toEqual({ inApp: true, emailDigest: false });
    });

    it('persists a merged preference update', async () => {
      usersRepository.findById.mockResolvedValue(
        buildUser({
          notification_prefs: { click: { inApp: false, emailDigest: true } },
        }),
      );

      const prefs = await service.updatePreferences('user-1', {
        bounce: { inApp: false },
      });

      expect(prefs.bounce).toEqual({ inApp: false, emailDigest: false });
      expect(prefs.click).toEqual({ inApp: false, emailDigest: true });
      expect(usersRepository.updateNotificationPrefs).toHaveBeenCalledWith(
        'user-1',
        prefs,
      );
    });

    it('throws NotFoundException for an unknown user', async () => {
      usersRepository.findById.mockResolvedValue(null);

      await expect(service.getPreferences('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('markRead', () => {
    it('throws NotFoundException when nothing matched', async () => {
      notificationsRepository.markRead.mockResolvedValue(null);

      await expect(
        service.markRead('notification-1', 'user-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
