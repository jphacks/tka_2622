import { z } from "zod";
import { ActionSchema, Pipeline2InputSchema } from "./recognition";

export const ServiceMatchRequestSchema = Pipeline2InputSchema.extend({
  stationId: z.string().min(1),
});

export const ServiceBusinessSchema = z.object({
  id: z.string().min(1),
  stationId: z.string().min(1),
  name: z.string().min(1),
  address: z.string().min(1),
  distanceMeters: z.number().int().nonnegative(),
  description: z.string().min(1),
  supportedActions: z.array(ActionSchema),
  isMock: z.boolean(),
  externalUrl: z.string().url().optional(),
});

export const ServiceMatchResponseSchema = z.object({
  stationId: z.string().min(1),
  selectedAction: ActionSchema,
  dataSource: z.enum(["mock", "supabase"]),
  results: z.array(ServiceBusinessSchema).max(10),
});

export type ServiceMatchRequest = z.infer<typeof ServiceMatchRequestSchema>;
export type ServiceBusiness = z.infer<typeof ServiceBusinessSchema>;
export type ServiceMatchResponse = z.infer<typeof ServiceMatchResponseSchema>;
