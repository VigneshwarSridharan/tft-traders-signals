import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  ComposeRecipientResult,
  ComposeSenderAccountOption,
  ComposeSendResponse,
  ComposeTestSendResponse,
  EmailMessageSummary,
  UserRole,
} from '@tft/shared';
import type { EnvConfig } from '../config/env.validation';
import {
  generateMessageIdHeader,
  generatePublicToken,
} from '../common/id.util';
import { CustomFieldDefsRepository } from '../database/custom-field-defs.repository';
import { CustomersRepository } from '../database/customers.repository';
import { EmailLinksRepository } from '../database/email-links.repository';
import { EmailMessagesRepository } from '../database/email-messages.repository';
import { SenderAccountsRepository } from '../database/sender-accounts.repository';
import { TemplatesRepository } from '../database/templates.repository';
import { EmailSenderService } from '../send/email-sender.service';
import { SendQueueService } from '../send/send-queue.service';
import {
  htmlToPlainText,
  sanitizeTemplateHtml,
} from '../templates/sanitize.util';
import { renderMergeFields } from '../templates/merge-fields.util';
import {
  applyCustomerValues,
  buildDefaultSampleValues,
} from '../templates/sample-data.util';
import {
  MAX_TOTAL_ATTACHMENT_BYTES,
  storeAttachment,
} from './attachment-storage.util';
import { buildComposeMergeValues } from './compose-merge.util';
import { inlineCss } from './css-inline.util';
import type {
  ComposeSendDto,
  ComposeTestSendDto,
} from './dto/email-messages.schemas';
import { toEmailMessageSummary } from './email-messages.mapper';
import { applyTracking, type RewrittenLink } from './tracking-injection.util';

interface UploadedAttachment {
  filename: string;
  contentType: string | null;
  sizeBytes: number;
  storagePath: string;
}

@Injectable()
export class EmailMessagesService {
  private readonly logger = new Logger(EmailMessagesService.name);

  constructor(
    private readonly emailMessagesRepository: EmailMessagesRepository,
    private readonly emailLinksRepository: EmailLinksRepository,
    private readonly senderAccountsRepository: SenderAccountsRepository,
    private readonly customersRepository: CustomersRepository,
    private readonly customFieldDefsRepository: CustomFieldDefsRepository,
    private readonly templatesRepository: TemplatesRepository,
    private readonly sendQueueService: SendQueueService,
    private readonly configService: ConfigService<EnvConfig, true>,
    private readonly emailSenderService: EmailSenderService,
  ) {}

  async get(id: string): Promise<EmailMessageSummary> {
    const row = await this.emailMessagesRepository.findById(id);
    if (!row) {
      throw new NotFoundException('Message not found');
    }
    const attachments = await this.emailMessagesRepository.getAttachments(id);
    return toEmailMessageSummary(row, attachments);
  }

  async compose(
    request: ComposeSendDto,
    files: Express.Multer.File[],
    userId: string,
    userRole: UserRole,
  ): Promise<ComposeSendResponse> {
    const senderAccount = await this.senderAccountsRepository.findById(
      request.senderAccountId,
    );
    if (!senderAccount) {
      throw new BadRequestException('Unknown sender account');
    }
    if (senderAccount.status !== 'active') {
      throw new BadRequestException(
        `Sender account is ${senderAccount.status} and cannot send`,
      );
    }

    let subjectTemplate: string;
    let bodyHtmlTemplate: string;
    let bodyTextTemplate: string | null;
    let templateVersionId: string | null = null;

    if (request.templateVersionId) {
      const version = await this.templatesRepository.findVersionById(
        request.templateVersionId,
      );
      if (!version) {
        throw new BadRequestException('Unknown template version');
      }
      subjectTemplate = version.subject;
      bodyHtmlTemplate = version.body_html;
      bodyTextTemplate = version.body_text;
      templateVersionId = version.id;
    } else {
      subjectTemplate = request.subject as string;
      bodyHtmlTemplate = sanitizeTemplateHtml(request.bodyHtml as string);
      bodyTextTemplate = request.bodyText ?? null;
    }

    const totalAttachmentBytes = files.reduce(
      (sum, file) => sum + file.size,
      0,
    );
    if (totalAttachmentBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
      throw new BadRequestException('Attachments exceed the 25 MB total limit');
    }

    const attachmentBasePath = this.configService.get(
      'ATTACHMENT_STORAGE_PATH',
      { infer: true },
    );
    const storedFiles: UploadedAttachment[] = await Promise.all(
      files.map(async (file) => ({
        filename: file.originalname,
        contentType: file.mimetype || null,
        sizeBytes: file.size,
        storagePath: await storeAttachment(
          attachmentBasePath,
          file.originalname,
          file.buffer,
        ),
      })),
    );

    const canOverrideSuppression =
      Boolean(request.overrideSuppression) && userRole === 'admin';

    const uniqueCustomerIds = [...new Set(request.customerIds)];
    const customersById = new Map(
      (
        await Promise.all(
          uniqueCustomerIds.map((id) => this.customersRepository.findById(id)),
        )
      )
        .filter((customer): customer is NonNullable<typeof customer> =>
          Boolean(customer),
        )
        .map((customer) => [customer.id, customer] as const),
    );

    const fieldDefs = await this.customFieldDefsRepository.list();
    const fieldDefsById = new Map(fieldDefs.map((def) => [def.id, def]));
    const fieldValuesByCustomer =
      await this.customersRepository.getFieldValuesForCustomers(
        [...customersById.values()].map((customer) => customer.id),
      );
    const suppressionFlags = await this.customersRepository.getSuppressionFlags(
      [...customersById.values()].map((customer) => customer.email),
    );

    const results: ComposeRecipientResult[] = [];

    for (const customerId of uniqueCustomerIds) {
      const customer = customersById.get(customerId);
      if (!customer) {
        results.push({
          customerId,
          ok: false,
          messageId: null,
          error: 'Customer not found',
        });
        continue;
      }

      const flags = suppressionFlags.get(customer.email.toLowerCase());
      if (flags?.suppressed && !canOverrideSuppression) {
        results.push({
          customerId,
          ok: false,
          messageId: null,
          error: flags.unsubscribed
            ? 'Customer has unsubscribed'
            : 'Customer is suppressed (bounced or manually suppressed)',
        });
        continue;
      }
      if (flags?.suppressed && canOverrideSuppression) {
        this.logger.warn(
          `Suppression override by user ${userId} for customer ${customer.id} (sender ${senderAccount.id})`,
        );
      }

      const fieldValues = fieldValuesByCustomer.get(customer.id) ?? [];
      const values = buildComposeMergeValues(
        senderAccount,
        customer,
        fieldValues,
        fieldDefsById,
        request.fallbackValues,
      );

      const subjectResult = renderMergeFields(subjectTemplate, values);
      const bodyResult = renderMergeFields(bodyHtmlTemplate, values);
      const bodyTextResult = bodyTextTemplate
        ? renderMergeFields(bodyTextTemplate, values)
        : null;

      const unresolved = new Set([
        ...subjectResult.unresolved,
        ...bodyResult.unresolved,
        ...(bodyTextResult?.unresolved ?? []),
      ]);
      if (unresolved.size > 0) {
        results.push({
          customerId,
          ok: false,
          messageId: null,
          error: `Missing merge values: ${[...unresolved].join(', ')}`,
        });
        continue;
      }

      const finalBodyHtml = inlineCss(bodyResult.rendered);
      const finalBodyText = bodyTextResult
        ? bodyTextResult.rendered
        : htmlToPlainText(finalBodyHtml);
      const trackingEnabled = customer.tracking_opt_out
        ? false
        : (request.trackingEnabled ?? true);

      const publicToken = generatePublicToken();
      let bodyHtmlForSend = finalBodyHtml;
      let linksToPersist: RewrittenLink[] = [];
      if (trackingEnabled) {
        const trackingResult = applyTracking(finalBodyHtml, {
          publicToken,
          trackingDomain: this.configService.get('TRACKING_DOMAIN', {
            infer: true,
          }),
        });
        bodyHtmlForSend = trackingResult.html;
        linksToPersist = trackingResult.links;
      }

      const message = await this.emailMessagesRepository.create({
        publicToken,
        senderAccountId: senderAccount.id,
        customerId: customer.id,
        templateVersionId,
        sentBy: userId,
        toEmail: customer.email,
        toName: customer.name,
        subject: subjectResult.rendered,
        bodyHtmlRendered: bodyHtmlForSend,
        bodyTextRendered: finalBodyText,
        messageIdHeader: generateMessageIdHeader(
          this.configService.get('SEND_FROM_DOMAIN', { infer: true }),
        ),
        trackingEnabled,
        status: 'queued',
        queuedAt: new Date(),
      });

      for (const link of linksToPersist) {
        await this.emailLinksRepository.create({
          messageId: message.id,
          token: link.token,
          originalUrl: link.originalUrl,
          linkLabel: link.label,
          position: link.position,
        });
      }

      for (const file of storedFiles) {
        await this.emailMessagesRepository.createAttachment({
          messageId: message.id,
          filename: file.filename,
          contentType: file.contentType,
          sizeBytes: file.sizeBytes,
          storagePath: file.storagePath,
        });
      }

      await this.sendQueueService.enqueueSend(message.id);

      results.push({
        customerId,
        ok: true,
        messageId: message.id,
        error: null,
      });
    }

    return { results };
  }

  async testSend(
    request: ComposeTestSendDto,
    toEmail: string,
  ): Promise<ComposeTestSendResponse> {
    const senderAccount = await this.senderAccountsRepository.findById(
      request.senderAccountId,
    );
    if (!senderAccount) {
      throw new BadRequestException('Unknown sender account');
    }
    if (senderAccount.status !== 'active') {
      throw new BadRequestException(
        `Sender account is ${senderAccount.status} and cannot send`,
      );
    }

    let subjectTemplate: string;
    let bodyHtmlTemplate: string;
    let bodyTextTemplate: string | null;

    if (request.templateVersionId) {
      const version = await this.templatesRepository.findVersionById(
        request.templateVersionId,
      );
      if (!version) {
        throw new BadRequestException('Unknown template version');
      }
      subjectTemplate = version.subject;
      bodyHtmlTemplate = version.body_html;
      bodyTextTemplate = version.body_text;
    } else {
      subjectTemplate = request.subject as string;
      bodyHtmlTemplate = sanitizeTemplateHtml(request.bodyHtml as string);
      bodyTextTemplate = request.bodyText ?? null;
    }

    const customFieldDefs = await this.customFieldDefsRepository.list();
    const values = buildDefaultSampleValues(customFieldDefs);
    values.set(
      'sender.name',
      senderAccount.display_name ?? senderAccount.email,
    );
    values.set('sender.signature', senderAccount.signature_html ?? '');

    if (request.fallbackValues) {
      for (const [key, value] of Object.entries(request.fallbackValues)) {
        values.set(key, value);
      }
    }

    if (request.customerId) {
      const customer = await this.customersRepository.findById(
        request.customerId,
      );
      if (!customer) {
        throw new BadRequestException('Unknown customer');
      }
      const fieldValues = await this.customersRepository.getFieldValues(
        customer.id,
      );
      const fieldDefsById = new Map(
        customFieldDefs.map((def) => [def.id, def]),
      );
      applyCustomerValues(values, customer, fieldValues, fieldDefsById);
    }

    const subjectResult = renderMergeFields(subjectTemplate, values);
    const bodyResult = renderMergeFields(bodyHtmlTemplate, values);
    const bodyTextResult = bodyTextTemplate
      ? renderMergeFields(bodyTextTemplate, values)
      : null;

    const unresolvedPlaceholders = [
      ...new Set([
        ...subjectResult.unresolved,
        ...bodyResult.unresolved,
        ...(bodyTextResult?.unresolved ?? []),
      ]),
    ];

    const finalBodyHtml = inlineCss(bodyResult.rendered);
    const finalBodyText = bodyTextResult
      ? bodyTextResult.rendered
      : htmlToPlainText(finalBodyHtml);

    let smtpResponse: string;
    try {
      smtpResponse = await this.emailSenderService.sendNow({
        senderAccount,
        to: toEmail,
        subject: `[TEST] ${subjectResult.rendered}`,
        html: finalBodyHtml,
        text: finalBodyText,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new BadRequestException(`Failed to send test email: ${message}`);
    }

    return {
      accepted: true,
      to: toEmail,
      smtpResponse,
      unresolvedPlaceholders,
    };
  }

  async listSenderAccountOptions(): Promise<ComposeSenderAccountOption[]> {
    const [rows, usageByAccount] = await Promise.all([
      this.senderAccountsRepository.list(),
      this.senderAccountsRepository.getUsageForAll(),
    ]);
    return rows
      .filter((row) => row.status === 'active')
      .map((row) => {
        const usage = usageByAccount.get(row.id) ?? {
          dailyUsed: 0,
          hourlyUsed: 0,
        };
        return {
          id: row.id,
          email: row.email,
          displayName: row.display_name,
          dailyQuota: row.daily_quota,
          dailyUsed: usage.dailyUsed,
          hourlyQuota: row.hourly_quota,
          hourlyUsed: usage.hourlyUsed,
        };
      });
  }
}
