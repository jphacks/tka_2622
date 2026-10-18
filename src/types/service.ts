import { z } from "zod";
import {
  ActionSchema,
  ItemCategorySchema,
  Pipeline2InputSchema,
} from "./recognition";

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
  supportedCategories: z.array(ItemCategorySchema).optional(),
  purchaseStatus: z.enum(["confirmed", "unconfirmed"]).optional(),
  isMock: z.boolean(),
  externalUrl: z.string().url().optional(),
  openingHours: z.array(z.string().min(1)).optional(),
});

export const OsmStoreCandidateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  category: z.string().nullable(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  distanceMeters: z.number().int().nonnegative(),
  sourceUrl: z.string().url(),
  license: z.string().min(1),
  openingHours: z.string().min(1).nullable().optional(),
});

export const ServiceMatchResponseSchema = z.object({
  stationId: z.string().min(1),
  selectedAction: ActionSchema,
  dataSource: z.enum(["mock", "supabase"]),
  results: z.array(ServiceBusinessSchema).max(10),
});

export type ServiceMatchRequest = z.infer<typeof ServiceMatchRequestSchema>;
export type ServiceBusiness = z.infer<typeof ServiceBusinessSchema>;
export type OsmStoreCandidate = z.infer<typeof OsmStoreCandidateSchema>;
export type ServiceMatchResponse = z.infer<typeof ServiceMatchResponseSchema>;
