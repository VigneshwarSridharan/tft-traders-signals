import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Job } from 'bullmq';
import type { Pool } from 'pg';
import type { EnvConfig } from '../config/env.validation';
import { PG_POOL } from '../database/database.constants';
import { EmailLinksRepository } from '../database/email-links.repository';
import { EmailMessagesRepository } from '../database/email-messages.repository';
import { TrackingEventsRepository } from '../database/tracking-events.repository';
import { withTransaction } from '../database/transaction.util';
import { NotificationsService } from '../notifications/notifications.service';
import {
  evaluateClickBotSignals,
  isScannerUserAgent,
} from './bot-detection.util';
import { GeoLookupService } from './geo-lookup.service';
import { detectMailProxy } from './mail-proxy-detection.util';
import type { TrackingJobData } from './tracking-queue.service';
import { parseUserAgent } from './user-agent.util';

function describeRecipient(message: {
  to_name: string | null;
  to_email: string;
}): string {
  return message.to_name ?? message.to_email;
}

// Window used for the "all links clicked instantly" bot heuristic.
const SIBLING_CLICK_WINDOW_MS = 2_000;

@Injectable()
export class TrackingEventProcessorService {
  private readonly logger = new Logger(TrackingEventProcessorService.name);

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly emailMessagesRepository: EmailMessagesRepository,
    private readonly emailLinksRepository: EmailLinksRepository,
    private readonly trackingEventsRepository: TrackingEventsRepository,
    private readonly geoLookupService: GeoLookupService,
    private readonly configService: ConfigService<EnvConfig, true>,
    private readonly notificationsService: NotificationsService,
  ) {}

  async processJob(job: Job<TrackingJobData>): Promise<void> {
    const data = job.data;
    if (data.kind === 'open') {
      await this.processOpen(data);
    } else {
      await this.processClick(data);
    }
  }

  private async processOpen(
    data: Extract<TrackingJobData, { kind: 'open' }>,
  ): Promise<void> {
    const message = await this.emailMessagesRepository.findByPublicToken(
      data.token,
    );
    if (!message) {
      this.logger.debug(`Unknown open pixel token: ${data.token}`);
      return;
    }

    const occurredAt = new Date(data.occurredAt);
    const ua = parseUserAgent(data.userAgent);
    const mailProxy = detectMailProxy(data.userAgent);
    const geo = this.geoLookupService.lookup(data.ip);
    const isBot = isScannerUserAgent(data.userAgent);
    const isProxy = mailProxy.isAppleMpp || mailProxy.isGmailProxy;

    await withTransaction(this.pool, async (client) => {
      await this.trackingEventsRepository.insert(
        {
          messageId: message.id,
          linkId: null,
          eventType: 'open',
          occurredAt,
          ip: data.ip,
          userAgent: data.userAgent,
          deviceType: ua.deviceType,
          os: ua.os,
          browser: ua.browser,
          geoCountry: geo?.country ?? null,
          geoCity: geo?.city ?? null,
          isBot,
          isProxy,
          metadata: {},
        },
        client,
      );

      if (!isBot) {
        await this.emailMessagesRepository.recordOpen(
          message.id,
          occurredAt,
          client,
        );
      }
    });

    if (!isBot && message.open_count === 0) {
      await this.notificationsService.notify({
        userId: message.sent_by,
        type: 'first_open',
        title: `${describeRecipient(message)} opened "${message.subject ?? '(no subject)'}"`,
        messageId: message.id,
      });
    }
  }

  private async processClick(
    data: Extract<TrackingJobData, { kind: 'click' }>,
  ): Promise<void> {
    const message = await this.emailMessagesRepository.findById(data.messageId);
    if (!message) {
      this.logger.debug(`Click for unknown message: ${data.messageId}`);
      return;
    }

    const occurredAt = new Date(data.occurredAt);
    const ua = parseUserAgent(data.userAgent);
    const mailProxy = detectMailProxy(data.userAgent);
    const geo = this.geoLookupService.lookup(data.ip);
    const isProxy = mailProxy.isAppleMpp || mailProxy.isGmailProxy;

    const secondsSinceSent = message.sent_at
      ? (occurredAt.getTime() - message.sent_at.getTime()) / 1000
      : null;
    const recentDistinctLinkClicks =
      await this.trackingEventsRepository.countRecentDistinctLinkClicks(
        message.id,
        occurredAt,
        SIBLING_CLICK_WINDOW_MS,
      );
    const botSignals = evaluateClickBotSignals({
      userAgent: data.userAgent,
      secondsSinceSent,
      minSeconds: this.configService.get('TRACKING_CLICK_BOT_MIN_SECONDS', {
        infer: true,
      }),
      recentDistinctLinkClicks,
      isHostingProviderIp: geo?.isHostingProvider ?? false,
    });

    await withTransaction(this.pool, async (client) => {
      if (!botSignals.isBot && message.open_count === 0) {
        // Click without a prior open implies an open the pixel missed
        // (image-blocking client) — record a synthetic inferred open.
        await this.trackingEventsRepository.insert(
          {
            messageId: message.id,
            linkId: null,
            eventType: 'open_inferred',
            occurredAt,
            ip: data.ip,
            userAgent: data.userAgent,
            deviceType: ua.deviceType,
            os: ua.os,
            browser: ua.browser,
            geoCountry: geo?.country ?? null,
            geoCity: geo?.city ?? null,
            isBot: false,
            isProxy,
            metadata: { inferredFrom: 'click' },
          },
          client,
        );
        await this.emailMessagesRepository.recordOpen(
          message.id,
          occurredAt,
          client,
        );
      }

      await this.trackingEventsRepository.insert(
        {
          messageId: message.id,
          linkId: data.linkId,
          eventType: 'click',
          occurredAt,
          ip: data.ip,
          userAgent: data.userAgent,
          deviceType: ua.deviceType,
          os: ua.os,
          browser: ua.browser,
          geoCountry: geo?.country ?? null,
          geoCity: geo?.city ?? null,
          isBot: botSignals.isBot,
          isProxy,
          metadata: botSignals.reasons.length
            ? { botReasons: botSignals.reasons }
            : {},
        },
        client,
      );

      if (!botSignals.isBot) {
        await this.emailMessagesRepository.recordClick(
          message.id,
          occurredAt,
          client,
        );
        await this.emailLinksRepository.recordClick(data.linkId, client);
      }
    });

    if (!botSignals.isBot) {
      await this.notificationsService.notify({
        userId: message.sent_by,
        type: 'click',
        title: `${describeRecipient(message)} clicked a link in "${message.subject ?? '(no subject)'}"`,
        messageId: message.id,
      });
    }
  }
}
