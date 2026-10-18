import { z } from "zod";
import bulkyWasteData from "../../data/gomi/tokyo/bulky-waste.json";
import indexData from "../../data/gomi/tokyo/index.json";
import { scheduleLoaders } from "../../data/gomi/tokyo/loaders";
import type { ItemCategory } from "../../types/recognition";
import type {
  DisposalArea,
  DisposalGuide,
  DisposalMunicipality,
} from "../../types/disposal";

const WEEKDAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;
const WEEKDAY_LABELS: Record<(typeof WEEKDAYS)[number], string> = {
  SU: "日",
  MO: "月",
  TU: "火",
  WE: "水",
  TH: "木",
  FR: "金",
  SA: "土",
};
const NEXT_DATE_COUNT = 2;
const LOOKAHEAD_DAYS = 70;

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const IndexSchema = z.object({
  source: z.object({
    name: z.string(),
    url: z.string().url(),
    revision: z.string().nullable(),
    license: z.string(),
  }),
  municipalities: z.array(
    z.object({
      code: z.string(),
      name: z.string(),
      officialUrl: z.string().url().nullable(),
      hasSchedule: z.boolean(),
      periods: z
        .array(z.object({ start: IsoDate, endExclusive: IsoDate }))
        .optional(),
    }),
  ),
});

const RuleSchema = z.object({
  category: z.string(),
  pattern: z.enum(["weekly", "monthly_nth", "monthly_specific"]),
  days: z.array(z.enum(WEEKDAYS)).optional(),
  occurrences: z.array(z.number().int().min(1).max(5)).optional(),
  dates: z.array(IsoDate).optional(),
});

const CourseSchema = z.object({
  id: z.string(),
  areas: z.array(
    z.object({
      name: z.string(),
      yomi: z.string().optional(),
      note: z.string().optional(),
    }),
  ),
  rules: z.array(RuleSchema),
  overrides: z.array(
    z.object({
      date: IsoDate,
      category: z.string().nullable().optional(),
      cancelled: z.boolean().optional(),
    }),
  ),
  unknownPeriods: z.array(z.object({ from: IsoDate, to: IsoDate })),
});

const MunicipalityScheduleSchema = z.object({
  code: z.string(),
  name: z.string(),
  officialUrl: z.string().url(),
  categories: z.record(z.string(), z.string()),
  periods: z.array(
    z.object({
      start: IsoDate,
      endExclusive: IsoDate,
      edition: z.string().nullable().optional(),
      sourceUrl: z.string().url().nullable().optional(),
      courses: z.array(CourseSchema),
    }),
  ),
});

const BulkyWasteSchema = z.object({
  pages: z.record(z.string(), z.string().url()),
});

type Rule = z.infer<typeof RuleSchema>;
type Course = z.infer<typeof CourseSchema>;
type MunicipalitySchedule = z.infer<typeof MunicipalityScheduleSchema>;

const index = IndexSchema.parse(indexData);
const bulkyWastePages = BulkyWasteSchema.parse(bulkyWasteData).pages;

const BULKY_NAME_PATTERN =
  /ソファ|ベッド|マットレス|布団|ふとん|机|デスク|テーブル|椅子|いす|イス|チェア|棚|ラック|タンス|たんす|箪笥|カーペット|じゅうたん|絨毯|自転車|スーツケース|キャリーケース|カラーボックス/;

/** Today's date in Japan, as YYYY-MM-DD. */
export function todayInJapan(now = new Date()): string {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function weekdayOf(date: string): (typeof WEEKDAYS)[number] {
  return WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()];
}

function joinDays(days: readonly (typeof WEEKDAYS)[number][]): string {
  return days.map((day) => WEEKDAY_LABELS[day]).join("・");
}

export function describeRule(rule: Rule): string {
  const days = rule.days ?? [];
  switch (rule.pattern) {
    case "weekly":
      return `毎週 ${joinDays(days)}曜日`;
    case "monthly_nth":
      return `毎月 ${(rule.occurrences ?? [])
        .map((occurrence) => `第${occurrence}`)
        .join("・")} ${joinDays(days)}曜日`;
    case "monthly_specific":
      return "指定日に収集";
  }
}

function ruleMatches(rule: Rule, date: string): boolean {
  if (rule.pattern === "monthly_specific") {
    return rule.dates?.includes(date) ?? false;
  }
  if (!rule.days?.includes(weekdayOf(date))) return false;
  if (rule.pattern === "weekly") return true;
  const occurrence = Math.ceil(Number(date.slice(8, 10)) / 7);
  return rule.occurrences?.includes(occurrence) ?? false;
}

function isUnknown(course: Course, date: string): boolean {
  return course.unknownPeriods.some(
    (period) => date >= period.from && date <= period.to,
  );
}

function isCollected(course: Course, category: string, date: string): boolean {
  const overrides = course.overrides.filter(
    (override) =>
      override.date === date &&
      (override.category == null || override.category === category),
  );
  if (overrides.some((override) => override.cancelled)) return false;
  if (overrides.some((override) => override.category === category)) {
    return true;
  }
  return course.rules.some(
    (rule) => rule.category === category && ruleMatches(rule, date),
  );
}

export function nextCollectionDates(
  course: Course,
  category: string,
  today: string,
  endExclusive: string,
): { dates: string[]; hitUnknown: boolean } {
  const dates: string[] = [];
  let hitUnknown = false;
  for (let offset = 0; offset < LOOKAHEAD_DAYS; offset += 1) {
    const date = addDays(today, offset);
    if (date >= endExclusive || dates.length >= NEXT_DATE_COUNT) break;
    if (isUnknown(course, date)) {
      hitUnknown = true;
      continue;
    }
    if (isCollected(course, category, date)) dates.push(date);
  }
  return { dates, hitUnknown };
}

async function loadSchedule(code: string): Promise<MunicipalitySchedule | null> {
  const loader = scheduleLoaders[code];
  if (!loader) return null;
  const module = await loader();
  return MunicipalityScheduleSchema.parse(module.default);
}

function currentPeriod(schedule: MunicipalitySchedule, today: string) {
  return (
    schedule.periods.find(
      (period) => today >= period.start && today < period.endExclusive,
    ) ?? null
  );
}

function hasCurrentSchedule(
  entry: z.infer<typeof IndexSchema>["municipalities"][number],
  today: string,
): boolean {
  return (
    entry.hasSchedule &&
    (entry.periods ?? []).some(
      (period) => today >= period.start && today < period.endExclusive,
    )
  );
}

export function listDisposalMunicipalities(
  today = todayInJapan(),
): DisposalMunicipality[] {
  return index.municipalities.map((entry) => ({
    code: entry.code,
    name: entry.name,
    hasSchedule: hasCurrentSchedule(entry, today),
  }));
}

export function findDisposalMunicipality(
  code: string,
  today = todayInJapan(),
): DisposalMunicipality | null {
  return (
    listDisposalMunicipalities(today).find((entry) => entry.code === code) ??
    null
  );
}

export async function listDisposalAreas(
  code: string,
  today = todayInJapan(),
): Promise<DisposalArea[] | null> {
  const schedule = await loadSchedule(code);
  const period = schedule && currentPeriod(schedule, today);
  if (!period) return null;
  return period.courses
    .flatMap((course) => course.areas)
    .sort((left, right) =>
      (left.yomi ?? left.name).localeCompare(right.yomi ?? right.name, "ja"),
    );
}

export function isBulkyItem(item: {
  name: string;
  category: ItemCategory;
  isLargeItem?: boolean;
}): boolean {
  return (
    item.isLargeItem === true ||
    item.category === "furniture" ||
    item.category === "bicycle" ||
    BULKY_NAME_PATTERN.test(item.name)
  );
}

export async function getDisposalGuide(input: {
  municipalityCode: string;
  area?: string | null;
  bulkyWaste: boolean;
  today?: string;
}): Promise<DisposalGuide | null> {
  const today = input.today ?? todayInJapan();
  const entry = index.municipalities.find(
    (municipality) => municipality.code === input.municipalityCode,
  );
  if (!entry) return null;

  const base = {
    municipality: {
      code: entry.code,
      name: entry.name,
      officialUrl: entry.officialUrl,
    },
    bulkyWaste: {
      required: input.bulkyWaste,
      pageUrl: bulkyWastePages[entry.code] ?? null,
    },
    attribution: {
      name: index.source.name,
      url: index.source.url,
      license: index.source.license,
    },
  };

  const schedule = await loadSchedule(entry.code);
  const period = schedule && currentPeriod(schedule, today);
  if (!schedule || !period) {
    return { ...base, status: "no_schedule", area: null, schedule: null };
  }

  const course = input.area
    ? period.courses.find((candidate) =>
        candidate.areas.some((area) => area.name === input.area),
      )
    : undefined;
  if (!course || !input.area) {
    return { ...base, status: "area_required", area: null, schedule: null };
  }

  let hasUnknownDatesAhead = false;
  const collections = Object.entries(schedule.categories).flatMap(
    ([category, label]) => {
      const rules = course.rules.filter((rule) => rule.category === category);
      if (rules.length === 0) return [];
      const next = nextCollectionDates(
        course,
        category,
        today,
        period.endExclusive,
      );
      hasUnknownDatesAhead ||= next.hitUnknown;
      return [
        {
          category,
          label,
          rules: [...new Set(rules.map(describeRule))],
          nextDates: next.dates,
        },
      ];
    },
  );

  return {
    ...base,
    status: "scheduled",
    area: input.area,
    schedule: {
      edition: period.edition ?? null,
      sourceUrl: period.sourceUrl ?? null,
      validUntil: addDays(period.endExclusive, -1),
      collections,
      hasUnknownDatesAhead,
    },
  };
}

/**
 * A saved plan stores the next collection dates as of save time. Recompute
 * them for display, keeping the saved municipality, area and bulky flag.
 */
export async function refreshDisposalGuide(
  guide: DisposalGuide,
): Promise<DisposalGuide> {
  try {
    return (
      (await getDisposalGuide({
        municipalityCode: guide.municipality.code,
        area: guide.area,
        bulkyWaste: guide.bulkyWaste.required,
      })) ?? guide
    );
  } catch (error) {
    console.error("Could not refresh the saved collection schedule.", error);
    return guide;
  }
}
