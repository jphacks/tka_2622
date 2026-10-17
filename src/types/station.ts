import { z } from "zod";

export const StationSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  lines: z.array(z.string()),
});

export const StationListResponseSchema = z.object({
  stations: z.array(StationSchema),
});

export type Station = z.infer<typeof StationSchema>;
