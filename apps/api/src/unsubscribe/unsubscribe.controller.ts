import { Controller, Get, Param, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  renderUnsubscribeConfirmPage,
  renderUnsubscribeDonePage,
  renderUnsubscribeInvalidPage,
} from './unsubscribe-page.util';
import { UnsubscribeService } from './unsubscribe.service';

function clientIp(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

/**
 * Public, unauthenticated by design (mirrors TrackingController) — a
 * recipient reaches this from an email, and RFC 8058 mail clients POST here
 * directly with no session.
 */
@Controller('u')
export class UnsubscribeController {
  constructor(private readonly unsubscribeService: UnsubscribeService) {}

  /**
   * Shows a confirm-before-acting page rather than unsubscribing outright —
   * link-prefetching mail clients (Outlook SafeLinks, image proxies) GET
   * every link in an email, and a GET that mutates state would silently
   * unsubscribe recipients who never clicked anything.
   */
  @Get(':token')
  async confirm(
    @Param('token') token: string,
    @Res() res: Response,
  ): Promise<void> {
    const message = await this.unsubscribeService.findMessageByToken(token);
    res.set('Content-Type', 'text/html; charset=utf-8');
    if (!message) {
      res.status(404).send(renderUnsubscribeInvalidPage());
      return;
    }
    res.status(200).send(renderUnsubscribeConfirmPage(token, message.to_email));
  }

  /**
   * The actual unsubscribe action — reached either via the confirm page's
   * form submit, or directly via RFC 8058 List-Unsubscribe=One-Click (mail
   * clients POST here automatically with no user-visible page).
   */
  @Post(':token')
  async unsubscribe(
    @Param('token') token: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.unsubscribeService.unsubscribe(
      token,
      clientIp(req),
      req.get('user-agent') ?? null,
    );
    res.set('Content-Type', 'text/html; charset=utf-8');
    if (!result) {
      res.status(404).send(renderUnsubscribeInvalidPage());
      return;
    }
    res.status(200).send(renderUnsubscribeDonePage(result.email));
  }
}
