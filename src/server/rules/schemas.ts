import { z } from "zod";
import {
  ActionSchema,
  ConditionGradeSchema,
  ItemCategorySchema,
} from "../../types/recognition";
import {
  OsmStoreCandidateSchema,
  ServiceBusinessSchema,
} from "../../types/service";
import { DisposalGuideSchema } from "../../types/disposal";

export const WorkingStatusSchema = z.enum([
  "working",
  "not_working",
  "unknown",
]);

export const RuleInputSchema = z.object({
  stationId: z.string().trim().min(1).optional(),
  item: z.object({
    name: z.string().trim().min(1),
    category: ItemCategorySchema,
    conditionGrade: ConditionGradeSchema.optional(),
    condition: z.enum(["good", "fair", "poor", "unknown"]).optional(),
    observations: z.array(z.string()).optional(),
    workingStatus: WorkingStatusSchema.optional(),
    isLargeItem: z.boolean().optional(),
    containsLithiumBattery: z.boolean().optional(),
  }),
  aiRecommendedAction: ActionSchema.nullable().optional(),
  aiRecommendationReason: z.string().optional(),
  preferredAction: ActionSchema.optional(),
  selectedAction: ActionSchema.optional(),
  municipalityCode: z.string().trim().min(1).optional(),
  disposalArea: z.string().trim().min(1).max(100).optional(),
  location: z
    .object({
      municipalityCode: z.string().trim().min(1).optional(),
    })
    .optional(),
});

export const RecommendationConfidenceSchema = z.enum([
  "low",
  "medium",
  "high",
]);

export const RuleNoticeSchema = z.object({
  ruleId: z.string().min(1),
  type: z.enum(["info", "caution", "needs_verification"]),
  message: z.string().min(1),
  sourceUrl: z.string().url().optional(),
});

export const RuleGuideSchema = z.object({
  title: z.string().min(1),
  introduction: z.string().min(1),
  steps: z.array(z.string()),
  directoryMessage: z.string().min(1),
});

export const RuleResultSchema = z.object({
  item: z.object({
    name: z.string().min(1),
    category: ItemCategorySchema,
    conditionGrade: ConditionGradeSchema,
    observations: z.array(z.string()),
  }),
  stationId: z.string().min(1).nullable(),
  recommendedAction: ActionSchema,
  selectedAction: ActionSchema,
  recommendationConfidence: RecommendationConfidenceSchema,
  recommendationReason: z.string().min(1),
  nextAction: z.object({
    type: z.enum([
      "search_services",
      "review_packing_checklist",
      "prepare_transfer",
      "check_local_disposal_rules",
    ]),
    label: z.string().min(1),
  }),
  guidance: RuleGuideSchema,
  services: z.object({
    status: z.enum([
      "available",
      "empty",
      "needs_station",
      "not_applicable",
      "error",
    ]),
    items: z.array(ServiceBusinessSchema),
    osmCandidates: z.array(OsmStoreCandidateSchema),
  }),
  notices: z.array(RuleNoticeSchema),
  sections: z.array(z.string().min(1)),
  disposal: DisposalGuideSchema.nullable().optional(),
});

export type RuleInput = z.infer<typeof RuleInputSchema>;
export type RuleResult = z.infer<typeof RuleResultSchema>;
export type RuleNotice = z.infer<typeof RuleNoticeSchema>;
