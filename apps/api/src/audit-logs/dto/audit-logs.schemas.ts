import { z } from 'zod';

export const auditLogListQuerySchema = z.object({
  userId: z.string().uuid().optional(),
  action: z.string().min(1).optional(),
  entityType: z.string().min(1).optional(),
  entityId: z.string().min(1).optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().positive().max(100).optional().default(25),
});
export type AuditLogListQueryDto = z.infer<typeof auditLogListQuerySchema>;
