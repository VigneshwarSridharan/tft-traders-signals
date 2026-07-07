import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  EmailMessageSummary,
  ScheduledSendListResponse,
} from '@tft/shared';
import { EmailMessagesRepository } from '../database/email-messages.repository';
import { ScheduledSendsRepository } from '../database/scheduled-sends.repository';
import { SenderAccountsRepository } from '../database/sender-accounts.repository';
import { TemplatesRepository } from '../database/templates.repository';
import { toEmailMessageSummary } from '../email-messages/email-messages.mapper';
import { SendQueueService } from '../send/send-queue.service';
import type {
  RescheduleSendDto,
  ScheduledSendListQueryDto,
} from './dto/scheduled-sends.schemas';
import { toScheduledSendListItem } from './scheduled-sends.mapper';

@Injectable()
export class ScheduledSendsService {
  constructor(
    private readonly scheduledSendsRepository: ScheduledSendsRepository,
    private readonly emailMessagesRepository: EmailMessagesRepository,
    private readonly senderAccountsRepository: SenderAccountsRepository,
    private readonly templatesRepository: TemplatesRepository,
    private readonly sendQueueService: SendQueueService,
  ) {}

  async list(
    query: ScheduledSendListQueryDto,
  ): Promise<ScheduledSendListResponse> {
    const { rows, total } = await this.scheduledSendsRepository.list({
      page: query.page,
      pageSize: query.pageSize,
    });

    const versionIds = [
      ...new Set(
        rows
          .map((row) => row.template_version_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const [senderAccounts, templateInfoByVersionId] = await Promise.all([
      this.senderAccountsRepository.list(),
      this.templatesRepository.findTemplateNamesForVersionIds(versionIds),
    ]);
    const senderAccountById = new Map(
      senderAccounts.map((account) => [account.id, account]),
    );

    return {
      items: rows.map((row) =>
        toScheduledSendListItem(
          row,
          senderAccountById.get(row.sender_account_id),
          row.template_version_id
            ? templateInfoByVersionId.get(row.template_version_id)
            : undefined,
        ),
      ),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async cancel(messageId: string): Promise<EmailMessageSummary> {
    const scheduledSend =
      await this.scheduledSendsRepository.findByMessageId(messageId);
    if (!scheduledSend) {
      throw new NotFoundException('Scheduled send not found');
    }
    const message = await this.emailMessagesRepository.findById(messageId);
    if (!message || message.status !== 'scheduled') {
      throw new BadRequestException('This message is no longer scheduled');
    }

    if (scheduledSend.job_id) {
      await this.sendQueueService.cancelScheduled(scheduledSend.job_id);
    }
    await this.scheduledSendsRepository.markCancelled(scheduledSend.id);
    await this.emailMessagesRepository.markCancelled(messageId);

    const updated = await this.emailMessagesRepository.findById(messageId);
    const attachments =
      await this.emailMessagesRepository.getAttachments(messageId);
    return toEmailMessageSummary(updated ?? message, attachments);
  }

  async reschedule(
    messageId: string,
    dto: RescheduleSendDto,
  ): Promise<EmailMessageSummary> {
    const scheduledSend =
      await this.scheduledSendsRepository.findByMessageId(messageId);
    if (!scheduledSend) {
      throw new NotFoundException('Scheduled send not found');
    }
    const message = await this.emailMessagesRepository.findById(messageId);
    if (!message || message.status !== 'scheduled') {
      throw new BadRequestException('This message is no longer scheduled');
    }

    if (scheduledSend.job_id) {
      await this.sendQueueService.cancelScheduled(scheduledSend.job_id);
    }
    const jobId = await this.sendQueueService.enqueueScheduled(
      messageId,
      dto.scheduledFor,
    );
    await this.scheduledSendsRepository.reschedule(
      scheduledSend.id,
      dto.scheduledFor,
      dto.timezone ?? null,
      jobId,
    );

    const attachments =
      await this.emailMessagesRepository.getAttachments(messageId);
    return toEmailMessageSummary(message, attachments);
  }
}
