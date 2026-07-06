import { Controller, Get, Param, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import type { EnvConfig } from '../config/env.validation';
import { EmailLinksRepository } from '../database/email-links.repository';
import { TrackingQueueService } from './tracking-queue.service';
import { TrackingRateLimiterService } from './tracking-rate-limiter.service';
import { TRACKING_PIXEL_GIF } from './tracking-pixel.util';

function clientIp(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

@Controller()
export class TrackingController {
  constructor(
    private readonly emailLinksRepository: EmailLinksRepository,
    private readonly trackingQueueService: TrackingQueueService,
    private readonly rateLimiterService: TrackingRateLimiterService,
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {}

  @Get('o/:token.gif')
  async pixel(
    @Param('token') token: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const ip = clientIp(req);
    if (this.rateLimiterService.consume(ip)) {
      await this.trackingQueueService.enqueueOpen({
        token,
        ip,
        userAgent: req.get('user-agent') ?? null,
        occurredAt: new Date().toISOString(),
      });
    }

    res.set('Cache-Control', 'no-store, private');
    res.set('Content-Type', 'image/gif');
    res.status(200).send(TRACKING_PIXEL_GIF);
  }

  @Get('c/:token')
  async click(
    @Param('token') token: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const homepage = this.configService.get('WEB_APP_URL', { infer: true });
    const link = await this.emailLinksRepository.findByToken(token);
    if (!link) {
      res.redirect(302, homepage);
      return;
    }

    const ip = clientIp(req);
    if (this.rateLimiterService.consume(ip)) {
      await this.trackingQueueService.enqueueClick({
        token,
        linkId: link.id,
        messageId: link.message_id,
        ip,
        userAgent: req.get('user-agent') ?? null,
        occurredAt: new Date().toISOString(),
      });
    }

    res.redirect(302, link.original_url);
  }
}
