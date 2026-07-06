import { z } from 'zod';

export const createSenderAccountSchema = z.object({
  email: z.string().email(),
  appPassword: z.string().min(1, 'App password is required'),
  displayName: z.string().min(1).optional(),
  smtpHost: z.string().min(1).default('smtp.zoho.com'),
  smtpPort: z.number().int().positive().default(465),
  imapHost: z.string().min(1).default('imap.zoho.com'),
  imapPort: z.number().int().positive().default(993),
  signatureHtml: z.string().optional(),
  dailyQuota: z.number().int().positive().nullable().optional(),
  hourlyQuota: z.number().int().positive().nullable().optional(),
});
export type CreateSenderAccountDto = z.infer<typeof createSenderAccountSchema>;

export const updateSenderAccountSchema = z
  .object({
    displayName: z.string().min(1).optional(),
    smtpHost: z.string().min(1).optional(),
    smtpPort: z.number().int().positive().optional(),
    imapHost: z.string().min(1).optional(),
    imapPort: z.number().int().positive().optional(),
    appPassword: z.string().min(1).optional(),
    signatureHtml: z.string().optional(),
    dailyQuota: z.number().int().positive().nullable().optional(),
    hourlyQuota: z.number().int().positive().nullable().optional(),
    status: z.enum(['active', 'disabled']).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });
export type UpdateSenderAccountDto = z.infer<typeof updateSenderAccountSchema>;
