import { Controller, MessageEvent, Sse, UseGuards } from '@nestjs/common';
import { Observable, interval, map, merge } from 'rxjs';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RealtimeEventsService } from './realtime-events.service';

const HEARTBEAT_INTERVAL_MS = 20_000;

@Controller('realtime')
@UseGuards(JwtAuthGuard)
export class RealtimeController {
  constructor(private readonly realtimeEventsService: RealtimeEventsService) {}

  @Sse('stream')
  stream(): Observable<MessageEvent> {
    const events$ = this.realtimeEventsService.events$.pipe(
      map((event): MessageEvent => ({ type: 'tracking_event', data: event })),
    );
    // Keeps proxies/browsers from timing out an idle connection; the web
    // client ignores anything that isn't a 'tracking_event'.
    const heartbeat$ = interval(HEARTBEAT_INTERVAL_MS).pipe(
      map((): MessageEvent => ({ type: 'ping', data: {} })),
    );
    return merge(events$, heartbeat$);
  }
}
