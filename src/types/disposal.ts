import { z } from "zod";

export const MunicipalityCodeSchema = z.string().regex(/^13\d{3}$/);

export const DisposalMunicipalitySchema = z.object({
  code: MunicipalityCodeSchema,
  name: z.string().min(1),
  hasSchedule: z.boolean(),
});

export const DisposalMunicipalityListResponseSchema = z.object({
  municipalities: z.array(DisposalMunicipalitySchema),
});

export const DisposalAreaSchema = z.object({
  name: z.string().min(1),
  yomi: z.string().min(1).optional(),
  note: z.string().min(1).optional(),
});

export const DisposalAreaListResponseSchema = z.object({
  municipality: DisposalMunicipalitySchema,
  areas: z.array(DisposalAreaSchema),
});

export const CollectionDaySchema = z.object({
  category: z.string().min(1),
  label: z.string().min(1),
  rules: z.array(z.string().min(1)).min(1),
  nextDates: z.array(z.iso.date()),
});

export const DisposalGuideSchema = z.object({
  municipality: z.object({
    code: MunicipalityCodeSchema,
    name: z.string().min(1),
    officialUrl: z.string().url().nullable(),
  }),
  status: z.enum(["scheduled", "area_required", "no_schedule"]),
  area: z.string().min(1).nullable(),
  schedule: z
    .object({
      edition: z.string().min(1).nullable(),
      sourceUrl: z.string().url().nullable(),
      validUntil: z.iso.date(),
      collections: z.array(CollectionDaySchema),
      hasUnknownDatesAhead: z.boolean(),
    })
    .nullable(),
  bulkyWaste: z.object({
    required: z.boolean(),
    pageUrl: z.string().url().nullable(),
  }),
  attribution: z.object({
    name: z.string().min(1),
    url: z.string().url(),
    license: z.string().min(1),
  }),
});

export type DisposalMunicipality = z.infer<typeof DisposalMunicipalitySchema>;
export type DisposalArea = z.infer<typeof DisposalAreaSchema>;
export type DisposalGuide = z.infer<typeof DisposalGuideSchema>;
