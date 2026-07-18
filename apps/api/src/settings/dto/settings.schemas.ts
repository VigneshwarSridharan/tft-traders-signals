import { z } from 'zod';

export const updateComplianceSettingsSchema = z.object({
  physicalAddress: z.string().min(1, 'Physical address is required'),
});
export type UpdateComplianceSettingsDto = z.infer<
  typeof updateComplianceSettingsSchema
>;

export const updateRetentionSettingsSchema = z.object({
  rawEventsDays: z.coerce.number().int().positive(),
  piiDays: z.coerce.number().int().positive(),
});
export type UpdateRetentionSettingsDto = z.infer<
  typeof updateRetentionSettingsSchema
>;
