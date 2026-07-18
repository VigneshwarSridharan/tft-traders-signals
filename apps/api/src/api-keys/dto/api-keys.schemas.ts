import { z } from 'zod';
import { API_KEY_SCOPES } from '@tft/shared';

export const createApiKeySchema = z.object({
  name: z.string().min(1).max(200),
  scopes: z
    .array(z.enum(API_KEY_SCOPES))
    .min(1, 'At least one scope is required'),
  expiresAt: z.coerce.date().optional(),
});
export type CreateApiKeyDto = z.infer<typeof createApiKeySchema>;
