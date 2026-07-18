import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  SentMailDetail,
  SentMailListItem,
  SentMailListResponse,
} from '@tft/shared';
import type { AccessTokenPayload } from '../auth/jwt-payload.interface';
import { EmailLinksRepository } from '../database/email-links.repository';
import { EmailMessagesRepository } from '../database/email-messages.repository';
import { InboundRepository } from '../database/inbound.repository';
import type { EmailMessageRow } from '../database/rows';
import { SenderAccountsRepository } from '../database/sender-accounts.repository';
import { TagsRepository } from '../database/tags.repository';
import { TemplatesRepository } from '../database/templates.repository';
import { TrackingEventsRepository } from '../database/tracking-events.repository';
import type {
  MessageDetailQueryDto,
  SentMailListQueryDto,
} from './dto/sent-mail.schemas';
import {
  toSentMailDetail,
  toSentMailListItem,
  type TemplateInfo,
} from './sent-mail.mapper';

@Injectable()
export class SentMailService {
  constructor(
    private readonly emailMessagesRepository: EmailMessagesRepository,
    private readonly emailLinksRepository: EmailLinksRepository,
    private readonly trackingEventsRepository: TrackingEventsRepository,
    private readonly inboundRepository: InboundRepository,
    private readonly senderAccountsRepository: SenderAccountsRepository,
    private readonly templatesRepository: TemplatesRepository,
    private readonly tagsRepository: TagsRepository,
  ) {}

  async list(
    query: SentMailListQueryDto,
    currentUser: AccessTokenPayload,
  ): Promise<SentMailListResponse> {
    const { rows, total } = await this.emailMessagesRepository.list({
      search: query.search,
      status: query.status,
      senderAccountId: query.senderAccountId,
      templateId: query.templateId,
      tagId: query.tagId,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      sentBy: currentUser.role === 'agent' ? currentUser.sub : undefined,
      sort: query.sort,
      sortDir: query.sortDir,
      page: query.page,
      pageSize: query.pageSize,
    });

    return {
      items: await this.toListItems(rows),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async get(
    id: string,
    options: MessageDetailQueryDto,
    currentUser: AccessTokenPayload,
  ): Promise<SentMailDetail> {
    const row = await this.findOrThrow(id, currentUser);

    const [
      senderAccounts,
      templateInfoByVersionId,
      attachments,
      tags,
      links,
      events,
      bounce,
    ] = await Promise.all([
      this.senderAccountsRepository.list(),
      row.template_version_id
        ? this.templatesRepository.findTemplateNamesForVersionIds([
            row.template_version_id,
          ])
        : Promise.resolve(new Map<string, TemplateInfo>()),
      this.emailMessagesRepository.getAttachments(id),
      this.tagsRepository.listForEntity('message', id),
      this.emailLinksRepository.listForMessage(id),
      this.trackingEventsRepository.listForMessage(
        id,
        options.includeBotEvents,
      ),
      this.inboundRepository.findBounceByMessageId(id),
    ]);

    const senderAccount = senderAccounts.find(
      (account) => account.id === row.sender_account_id,
    );
    const template = row.template_version_id
      ? templateInfoByVersionId.get(row.template_version_id)
      : undefined;

    return toSentMailDetail(
      row,
      senderAccount,
      template,
      attachments,
      tags,
      links,
      events,
      bounce,
    );
  }

  async addTag(
    id: string,
    tagId: string,
    currentUser: AccessTokenPayload,
  ): Promise<SentMailDetail> {
    await this.findOrThrow(id, currentUser);
    const tag = await this.tagsRepository.findById(tagId);
    if (!tag) {
      throw new NotFoundException(`Tag ${tagId} not found`);
    }
    await this.tagsRepository.addTagging(tagId, 'message', id);
    return this.get(id, { includeBotEvents: false }, currentUser);
  }

  async removeTag(
    id: string,
    tagId: string,
    currentUser: AccessTokenPayload,
  ): Promise<SentMailDetail> {
    await this.findOrThrow(id, currentUser);
    await this.tagsRepository.removeTagging(tagId, 'message', id);
    return this.get(id, { includeBotEvents: false }, currentUser);
  }

  /** Agents may only view/manage messages they sent; other authorized roles see everything. */
  private async findOrThrow(
    id: string,
    currentUser: AccessTokenPayload,
  ): Promise<EmailMessageRow> {
    const row = await this.emailMessagesRepository.findById(id);
    if (
      !row ||
      (currentUser.role === 'agent' && row.sent_by !== currentUser.sub)
    ) {
      throw new NotFoundException('Message not found');
    }
    return row;
  }

  private async toListItems(
    rows: EmailMessageRow[],
  ): Promise<SentMailListItem[]> {
    if (rows.length === 0) {
      return [];
    }
    const ids = rows.map((row) => row.id);
    const versionIds = [
      ...new Set(
        rows
          .map((row) => row.template_version_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    const [senderAccounts, templateInfoByVersionId, tagsByMessage] =
      await Promise.all([
        this.senderAccountsRepository.list(),
        this.templatesRepository.findTemplateNamesForVersionIds(versionIds),
        this.tagsRepository.listForEntities('message', ids),
      ]);

    const senderAccountById = new Map(
      senderAccounts.map((account) => [account.id, account]),
    );

    return rows.map((row) =>
      toSentMailListItem(
        row,
        senderAccountById.get(row.sender_account_id),
        row.template_version_id
          ? templateInfoByVersionId.get(row.template_version_id)
          : undefined,
        tagsByMessage.get(row.id) ?? [],
      ),
    );
  }
}
