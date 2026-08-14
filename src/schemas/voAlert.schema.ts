// Radiantilyk EMR — VO Alert Validation Schema
import { z } from 'zod';

export const TriggerVoAlertSchema = z.object({
  run_id: z.string().trim().optional(),
  client_email: z.string().trim().email().optional().or(z.literal('')),
  client_name: z.string().trim().max(200).optional(),
  region: z.string().trim().max(200).optional(),
  product: z.string().trim().max(200).optional(),
});

export type TriggerVoAlertInput = z.infer<typeof TriggerVoAlertSchema>;
