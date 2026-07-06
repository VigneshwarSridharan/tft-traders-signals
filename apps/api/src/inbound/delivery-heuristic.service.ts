import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../config/env.validation';
import { EmailMessagesRepository } from '../database/email-messages.repository';

/** A `sent` message with no bounce after the configured window is assumed delivered. */
@Injectable()
export class DeliveryHeuristicService {
  private readonly logger = new Logger(DeliveryHeuristicService.name);

  constructor(
    private readonly emailMessagesRepository: EmailMessagesRepository,
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {}

  async run(): Promise<void> {
    const hours = this.configService.get('DELIVERY_HEURISTIC_HOURS', {
      infer: true,
    });
    const updatedIds =
      await this.emailMessagesRepository.markDeliveredAfterHeuristic(hours);
    if (updatedIds.length > 0) {
      this.logger.log(
        `Marked ${updatedIds.length} message(s) delivered via the ${hours}h no-bounce heuristic.`,
      );
    }
  }
}
