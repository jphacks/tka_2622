import { z } from "zod";

export const ACTIONS = ["keep", "sell", "give", "dispose"] as const;
export const ITEM_CATEGORIES = [
  "furniture",
  "electronics",
  "books",
  "clothing",
  "bicycle",
  "household",
  "other",
] as const;

export const ActionSchema = z.enum(ACTIONS);
export const ItemCategorySchema = z.enum(ITEM_CATEGORIES);
export const ConditionGradeSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.null(),
]);

export const RecognizedItemSchema = z.object({
  name: z.string().min(1),
  category: ItemCategorySchema,
  condition: z.object({
    grade: ConditionGradeSchema,
    observations: z.array(z.string()),
    needsUserConfirmation: z.boolean(),
  }),
});

export const ResaleLikelihoodSchema = z.enum(["high", "medium", "low"]);

/**
 * AI estimate of whether the item could be sold second-hand. Optional and
 * dropped when malformed, so older or partial results stay valid.
 */
export const ResaleEstimateSchema = z
  .object({
    likelihood: ResaleLikelihoodSchema,
    reason: z.string().trim().min(1).max(200),
    priceRange: z
      .object({
        min: z.number().int().min(0).max(1_000_000),
        max: z.number().int().min(0).max(1_000_000),
      })
      .refine((range) => range.min <= range.max)
      .nullable(),
    tips: z.array(z.string().trim().min(1).max(80)).max(3).default([]),
  });

export const AnalyzeResponseSchema = z.object({
  item: RecognizedItemSchema,
  resale: ResaleEstimateSchema.optional().catch(undefined),
  recommendation: z.object({
    action: ActionSchema.nullable(),
    reason: z.string(),
  }),
  recommendationBasis: RecognizedItemSchema.optional(),
});

export const Pipeline2InputSchema = z.object({
  item: z.object({
    name: z.string().min(1),
    category: ItemCategorySchema,
    conditionGrade: ConditionGradeSchema,
    observations: z.array(z.string()),
  }),
  selectedAction: ActionSchema,
  location: z
    .object({
      municipalityCode: z.string().optional(),
    })
    .optional(),
});

export type Action = z.infer<typeof ActionSchema>;
export type ResaleEstimate = z.infer<typeof ResaleEstimateSchema>;
export type ItemCategory = z.infer<typeof ItemCategorySchema>;
export type ConditionGrade = z.infer<typeof ConditionGradeSchema>;
export type RecognizedItem = z.infer<typeof RecognizedItemSchema>;
export type AnalyzeResponse = z.infer<typeof AnalyzeResponseSchema>;
export type Pipeline2Input = z.infer<typeof Pipeline2InputSchema>;
