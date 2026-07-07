import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ScheduledSendListResponse } from '@tft/shared';
import { EmailMessagesRepository } from '../database/email-messages.repository';
import { ScheduledSendsRepository } from '../database/scheduled-sends.repository';
import { SendQueueService } from '../send/send-queue.service';
import type { RescheduleSendDto } from './dto/scheduled-sends.schemas';
import { toScheduledSendListItem } from './scheduled-sends.mapper';

@Injectable()
export class ScheduledSendsService {
  constructor(
    private readonly scheduledSendsRepository: ScheduledSendsRepository,
    private readonly emailMessagesRepository: EmailMessagesRepository,
    private readonly sendQueueService: SendQueueService,
  ) {}

  async list(): Promise<ScheduledSendListResponse> {
    const rows = await this.scheduledSendsRepository.listUpcoming();
    return { items: rows.map(toScheduledSendListItem), total: rows.length };
  }

  async cancel(messageId: string): Promise<void> {
    const scheduled =
      await this.scheduledSendsRepository.findByMessageId(messageId);
    if (!scheduled) {
      throw new NotFoundException('Scheduled send not found');
    }
    if (scheduled.cancelled_at) {
      throw new BadRequestException('Scheduled send is already cancelled');
    }

    const cancelled = await this.scheduledSendsRepository.cancel(messageId);
    if (!cancelled) {
      throw new BadRequestException(
        'Scheduled send was already dispatched or cancelled',
      );
    }
    if (scheduled.job_id) {
      await this.sendQueueService.cancelQueuedJob(scheduled.job_id);
    }
    await this.emailMessagesRepository.markCancelled(messageId);
  }

  async reschedule(messageId: string, dto: RescheduleSendDto): Promise<void> {
    const scheduled =
      await this.scheduledSendsRepository.findByMessageId(messageId);
    if (!scheduled) {
      throw new NotFoundException('Scheduled send not found');
    }
    if (scheduled.cancelled_at) {
      throw new BadRequestException('Scheduled send is already cancelled');
    }

    const scheduledFor = new Date(dto.scheduledFor);
    if (scheduledFor.getTime() <= Date.now()) {
      throw new BadRequestException('scheduledFor must be in the future');
    }

    if (scheduled.job_id) {
      await this.sendQueueService.cancelQueuedJob(scheduled.job_id);
    }
    const jobId = await this.sendQueueService.enqueueScheduledSend(
      messageId,
      scheduledFor,
    );
    const updated = await this.scheduledSendsRepository.reschedule(
      messageId,
      scheduledFor,
      jobId,
    );
    if (!updated) {
      throw new BadRequestException(
        'Scheduled send was already dispatched or cancelled',
      );
    }
  }
}
