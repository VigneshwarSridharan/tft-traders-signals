import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ScheduledSendsService } from './scheduled-sends.service';
import { EmailMessagesRepository } from '../database/email-messages.repository';
import { ScheduledSendsRepository } from '../database/scheduled-sends.repository';
import { SendQueueService } from '../send/send-queue.service';
import type { ScheduledSendRow } from '../database/rows';

function buildScheduledSendRow(
  overrides: Partial<ScheduledSendRow> = {},
): ScheduledSendRow {
  return {
    id: 'scheduled-1',
    message_id: 'message-1',
    scheduled_for: new Date(Date.now() + 60 * 60 * 1000),
    timezone: 'Asia/Kolkata',
    job_id: 'job-1',
    cancelled_at: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

describe('ScheduledSendsService', () => {
  let service: ScheduledSendsService;
  let scheduledSendsRepository: jest.Mocked<ScheduledSendsRepository>;
  let emailMessagesRepository: jest.Mocked<EmailMessagesRepository>;
  let sendQueueService: jest.Mocked<SendQueueService>;

  beforeEach(() => {
    scheduledSendsRepository = {
      findByMessageId: jest.fn(),
      cancel: jest.fn(),
      reschedule: jest.fn(),
      listUpcoming: jest.fn(),
    } as unknown as jest.Mocked<ScheduledSendsRepository>;

    emailMessagesRepository = {
      markCancelled: jest.fn(),
    } as unknown as jest.Mocked<EmailMessagesRepository>;

    sendQueueService = {
      cancelQueuedJob: jest.fn(),
      enqueueScheduledSend: jest.fn().mockResolvedValue('job-2'),
    } as unknown as jest.Mocked<SendQueueService>;

    service = new ScheduledSendsService(
      scheduledSendsRepository,
      emailMessagesRepository,
      sendQueueService,
    );
  });

  describe('cancel', () => {
    it('cancels the queue job and marks the message cancelled', async () => {
      const row = buildScheduledSendRow();
      scheduledSendsRepository.findByMessageId.mockResolvedValue(row);
      scheduledSendsRepository.cancel.mockResolvedValue({
        ...row,
        cancelled_at: new Date(),
      });

      await service.cancel('message-1');

      expect(sendQueueService.cancelQueuedJob).toHaveBeenCalledWith('job-1');
      expect(emailMessagesRepository.markCancelled).toHaveBeenCalledWith(
        'message-1',
      );
    });

    it('throws NotFoundException when there is no scheduled send for the message', async () => {
      scheduledSendsRepository.findByMessageId.mockResolvedValue(null);

      await expect(service.cancel('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('rejects cancelling an already-cancelled schedule', async () => {
      scheduledSendsRepository.findByMessageId.mockResolvedValue(
        buildScheduledSendRow({ cancelled_at: new Date() }),
      );

      await expect(service.cancel('message-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(sendQueueService.cancelQueuedJob).not.toHaveBeenCalled();
    });
  });

  describe('reschedule', () => {
    it('cancels the old job, enqueues a new one, and persists the new time', async () => {
      const row = buildScheduledSendRow();
      scheduledSendsRepository.findByMessageId.mockResolvedValue(row);
      scheduledSendsRepository.reschedule.mockResolvedValue({
        ...row,
        job_id: 'job-2',
      });
      const scheduledFor = new Date(
        Date.now() + 2 * 60 * 60 * 1000,
      ).toISOString();

      await service.reschedule('message-1', { scheduledFor });

      expect(sendQueueService.cancelQueuedJob).toHaveBeenCalledWith('job-1');
      expect(sendQueueService.enqueueScheduledSend).toHaveBeenCalledWith(
        'message-1',
        new Date(scheduledFor),
      );
      expect(scheduledSendsRepository.reschedule).toHaveBeenCalledWith(
        'message-1',
        new Date(scheduledFor),
        'job-2',
      );
    });

    it('rejects a scheduledFor in the past', async () => {
      scheduledSendsRepository.findByMessageId.mockResolvedValue(
        buildScheduledSendRow(),
      );

      await expect(
        service.reschedule('message-1', {
          scheduledFor: new Date(Date.now() - 60_000).toISOString(),
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(sendQueueService.cancelQueuedJob).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when there is no scheduled send for the message', async () => {
      scheduledSendsRepository.findByMessageId.mockResolvedValue(null);

      await expect(
        service.reschedule('missing', {
          scheduledFor: new Date(Date.now() + 60_000).toISOString(),
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
