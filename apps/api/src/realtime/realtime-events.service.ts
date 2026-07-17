import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'pg';
import { Subject } from 'rxjs';
import type { RealtimeTrackingEvent } from '@tft/shared';
import type { EnvConfig } from '../config/env.validation';
import { EmailMessagesRepository } from '../database/email-messages.repository';
import { TRACKING_EVENTS_CHANNEL } from '../database/tracking-events.repository';

interface TrackingNotifyPayload {
  eventId: string;
  messageId: string;
  eventType: RealtimeTrackingEvent['eventType'];
  occurredAt: string;
}

const RECONNECT_DELAY_MS = 5_000;

/**
 * Owns a single dedicated Postgres connection LISTENing on the
 * `tracking_events` channel (see TrackingEventsRepository.insert) and fans
 * enriched events out to every connected SSE client via `events$`. LISTEN
 * requires a persistent connection outside the pool, so this can't reuse
 * PG_POOL.
 *
 * Not started automatically (no OnModuleInit) — AppModule is shared between
 * the `api` HTTP process and the `worker` process (see worker.ts), and only
 * the api process serves SSE clients. Call `start()` explicitly from
 * main.ts, mirroring how worker.ts explicitly starts each BullMQ worker.
 */
@Injectable()
export class RealtimeEventsService implements OnModuleDestroy {
  private readonly logger = new Logger(RealtimeEventsService.name);
  private readonly subject = new Subject<RealtimeTrackingEvent>();
  private client: Client | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private stopped = false;

  constructor(
    private readonly configService: ConfigService<EnvConfig, true>,
    private readonly emailMessagesRepository: EmailMessagesRepository,
  ) {}

  readonly events$ = this.subject.asObservable();

  async start(): Promise<void> {
    await this.connect();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.client) {
      await this.client.end().catch(() => undefined);
      this.client = null;
    }
    this.subject.complete();
  }

  private async connect(): Promise<void> {
    const client = new Client({
      connectionString: this.configService.get('DATABASE_URL', {
        infer: true,
      }),
    });

    client.on('notification', (message) => {
      if (message.channel !== TRACKING_EVENTS_CHANNEL || !message.payload) {
        return;
      }
      void this.handleNotification(message.payload);
    });

    client.on('error', (error) => {
      this.logger.error(`Realtime LISTEN connection error: ${error.message}`);
      this.scheduleReconnect();
    });

    await client.connect();
    await client.query(`LISTEN ${TRACKING_EVENTS_CHANNEL}`);
    this.client = client;
    this.logger.log('Listening for realtime tracking events.');
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) {
      return;
    }
    this.client = null;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch((error: Error) => {
        this.logger.error(`Realtime LISTEN reconnect failed: ${error.message}`);
        this.scheduleReconnect();
      });
    }, RECONNECT_DELAY_MS);
  }

  private async handleNotification(payload: string): Promise<void> {
    let parsed: TrackingNotifyPayload;
    try {
      parsed = JSON.parse(payload) as TrackingNotifyPayload;
    } catch {
      this.logger.warn(`Ignoring malformed realtime notify payload`);
      return;
    }

    const message = await this.emailMessagesRepository.findById(
      parsed.messageId,
    );
    if (!message) {
      return;
    }

    const isOpenEvent =
      parsed.eventType === 'open' || parsed.eventType === 'open_inferred';
    const event: RealtimeTrackingEvent = {
      messageId: message.id,
      eventType: parsed.eventType,
      occurredAt: parsed.occurredAt,
      toEmail: message.to_email,
      toName: message.to_name,
      subject: message.subject,
      status: message.status,
      openCount: message.open_count,
      clickCount: message.click_count,
      repliedAt: message.replied_at?.toISOString() ?? null,
      isFirstOpen: isOpenEvent && message.open_count === 1,
      isFirstClick: parsed.eventType === 'click' && message.click_count === 1,
    };

    this.subject.next(event);
  }
}
