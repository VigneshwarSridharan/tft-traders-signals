export const AUDIT_LOG_ACTIONS = [
  "auth.login",
  "auth.logout",
  "auth.accept_invitation",
  "message.send",
  "template.create",
  "template.update",
  "template.version_create",
  "template.duplicate",
  "template.delete",
  "sender_account.create",
  "sender_account.update",
  "sender_account.delete",
  "suppression.create",
  "suppression.release",
  "suppression.override",
  "customer.export",
  "customer.gdpr_export",
  "customer.erase",
  "unsubscribe.recorded",
  "settings.update",
  "user.role_change",
  "report.export",
] as const;

export type AuditLogAction = (typeof AUDIT_LOG_ACTIONS)[number];

export interface AuditLogSummary {
  id: string;
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface AuditLogListQuery {
  userId?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}

export interface AuditLogListResponse {
  items: AuditLogSummary[];
  total: number;
  page: number;
  pageSize: number;
}
