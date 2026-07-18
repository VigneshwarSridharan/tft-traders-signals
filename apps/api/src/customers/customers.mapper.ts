import type {
  CustomerSummary,
  CustomerTimelineEntry,
  CustomerTimelineEventType,
} from '@tft/shared';
import type {
  CustomerFieldValueRow,
  CustomerRow,
  EmailMessageRow,
  SuppressionFlagsRow,
  TagRow,
  TrackingEventRow,
} from '../database/rows';

export function toCustomerSummary(
  row: CustomerRow,
  tags: TagRow[],
  fieldValues: CustomerFieldValueRow[],
  fieldKeyById: Map<string, string>,
  suppression: SuppressionFlagsRow | undefined,
): CustomerSummary {
  const customFields: Record<string, string | null> = {};
  for (const fieldValue of fieldValues) {
    const key = fieldKeyById.get(fieldValue.field_def_id);
    if (key) {
      customFields[key] = fieldValue.value;
    }
  }

  return {
    id: row.id,
    name: row.name,
    company: row.company,
    email: row.email,
    phone: row.phone,
    notes: row.notes,
    trackingOptOut: row.tracking_opt_out,
    unsubscribed: suppression?.unsubscribed ?? false,
    suppressed: suppression?.suppressed ?? false,
    engagementScore: row.engagement_score,
    tags: tags.map((tag) => ({ id: tag.id, name: tag.name, color: tag.color })),
    customFields,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

const TRACKING_EVENT_TO_TIMELINE_TYPE: Partial<
  Record<TrackingEventRow['event_type'], CustomerTimelineEventType>
> = {
  open: 'open',
  open_inferred: 'open',
  click: 'click',
  reply: 'reply',
  bounce: 'bounce',
  unsubscribe: 'unsubscribe',
};

/** One "sent" entry per message, chronologically merged with its tracking events — the full communication timeline (FR-2.3). */
export function toCustomerTimeline(
  messages: EmailMessageRow[],
  events: TrackingEventRow[],
): CustomerTimelineEntry[] {
  const subjectByMessageId = new Map(
    messages.map((message) => [message.id, message.subject]),
  );

  const sentEntries: CustomerTimelineEntry[] = messages
    .filter((message) => message.sent_at !== null)
    .map((message) => ({
      id: `sent-${message.id}`,
      type: 'sent',
      occurredAt: (message.sent_at as Date).toISOString(),
      messageId: message.id,
      subject: message.subject,
      detail: null,
    }));

  const eventEntries: CustomerTimelineEntry[] = events
    .map((event): CustomerTimelineEntry | null => {
      const type = TRACKING_EVENT_TO_TIMELINE_TYPE[event.event_type];
      if (!type) {
        return null;
      }
      return {
        id: `event-${event.id}`,
        type,
        occurredAt: event.occurred_at.toISOString(),
        messageId: event.message_id,
        subject: subjectByMessageId.get(event.message_id) ?? null,
        detail: null,
      };
    })
    .filter((entry): entry is CustomerTimelineEntry => entry !== null);

  return [...sentEntries, ...eventEntries].sort(
    (a, b) =>
      new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
  );
}
