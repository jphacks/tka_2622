import { z } from "zod";
import type { ItemCategory } from "../../../types/recognition";
import type {
  OsmStoreCandidate,
  ServiceBusiness,
} from "../../../types/service";
import type { Station } from "../../../types/station";
import type { RuleServiceProvider } from "./types";

const SEARCH_RADIUS_METERS = 3000;

interface SupabaseConfig {
  url: string;
  apiKey: string;
}

interface StationRow {
  station_id: string;
  station_name: string;
  lines: string | null;
}

interface BusinessRow {
  business_id: string;
  name: string;
  address: string;
  website_url: string | null;
  purchase_status: string;
  business_category: string | null;
  products_handled_source_text: string | null;
  service_type_evidence: string | null;
  usage_notes: string | null;
  opening_days: string | null;
  weekday_open: string | null;
  weekday_close: string | null;
  holiday_open: string | null;
  holiday_close: string | null;
  hours_notes: string | null;
  source_record_json: Record<string, unknown> | null;
}

interface StationBusinessRow {
  station_id: string;
  business_id: string;
  distance_meters: number;
  businesses: BusinessRow;
}

interface OsmBusinessRow {
  osm_object_type: string;
  osm_object_id: string;
  name: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  source: string;
  license: string | null;
  tags: Record<string, unknown>;
  validation_status: string;
}

interface OsmStationMatchRow {
  station_id: string;
  osm_object_type: string;
  osm_object_id: string;
  distance_meters: number;
  match_radius_meters: number;
  distance_method: string;
}

interface OsmStationCandidateRow extends OsmStationMatchRow {
  osm_business_candidates: OsmBusinessRow;
}

const StationRowsSchema = z.array(
  z.object({
    station_id: z.string(),
    station_name: z.string(),
    lines: z.string().nullable(),
  }),
);

const OsmBusinessRowsSchema = z.array(
  z.object({
    osm_object_type: z.enum(["node", "way", "relation"]),
    osm_object_id: z.string(),
    name: z.string().nullable(),
    address: z.string().nullable(),
    latitude: z.number().nullable(),
    longitude: z.number().nullable(),
    source: z.string(),
    license: z.string().nullable(),
    tags: z.record(z.string(), z.unknown()),
    validation_status: z.string(),
  }),
);

const OsmStationMatchRowsSchema = z.array(
  z.object({
    station_id: z.string(),
    osm_object_type: z.enum(["node", "way", "relation"]),
    osm_object_id: z.string(),
    distance_meters: z.number().int().nonnegative(),
    match_radius_meters: z.number().int().positive(),
    distance_method: z.string(),
  }),
);

const OsmStationCandidateRowsSchema = z.array(
  z.object({
    station_id: z.string(),
    osm_object_type: z.enum(["node", "way", "relation"]),
    osm_object_id: z.string(),
    distance_meters: z.number().int().nonnegative(),
    match_radius_meters: z.number().int().positive(),
    distance_method: z.string(),
    osm_business_candidates: z.object({
      osm_object_type: z.enum(["node", "way", "relation"]),
      osm_object_id: z.string(),
      name: z.string().nullable(),
      address: z.string().nullable(),
      latitude: z.number().nullable(),
      longitude: z.number().nullable(),
      source: z.string(),
      license: z.string().nullable(),
      tags: z.record(z.string(), z.unknown()),
      validation_status: z.string(),
    }),
  }),
);

const OSM_PAGE_SIZE = 1000;
const OSM_DATA_LICENSE = "ODbL-1.0 (© OpenStreetMap contributors)";

const StationBusinessRowsSchema = z.array(
  z.object({
    station_id: z.string(),
    business_id: z.string(),
    distance_meters: z.number().int().nonnegative(),
    businesses: z.object({
      business_id: z.string(),
      name: z.string(),
      address: z.string(),
      website_url: z.string().nullable(),
      purchase_status: z.string(),
      business_category: z.string().nullable(),
      products_handled_source_text: z.string().nullable(),
      service_type_evidence: z.string().nullable(),
      usage_notes: z.string().nullable(),
      opening_days: z.string().nullable(),
      weekday_open: z.string().nullable(),
      weekday_close: z.string().nullable(),
      holiday_open: z.string().nullable(),
      holiday_close: z.string().nullable(),
      hours_notes: z.string().nullable(),
      source_record_json: z.record(z.string(), z.unknown()).nullable(),
    }),
  }),
);

export class SupabaseRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SupabaseRequestError";
  }
}

function configFromEnvironment(): SupabaseConfig {
  const url =
    process.env.SUPABASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const apiKey =
    process.env.SUPABASE_ANON_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !apiKey) {
    throw new SupabaseRequestError(
      "Supabase が設定されていません。管理者に設定を確認してください。",
    );
  }
  return { url, apiKey };
}

function serviceConfigFromEnvironment(): SupabaseConfig {
  const url =
    process.env.SUPABASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const apiKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !apiKey) {
    throw new SupabaseRequestError(
      "OSM 候補データ用のサーバー側 Supabase キーが設定されていません。",
    );
  }
  return { url, apiKey };
}

function stringTag(tags: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = tags[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function candidateMetadata(tags: Record<string, unknown>) {
  const value = tags._reuse_candidate;
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function supportedCategories(business: BusinessRow): ItemCategory[] {
  const text = [
    business.business_category,
    business.products_handled_source_text,
    business.service_type_evidence,
  ]
    .filter(Boolean)
    .join(" ");
  const categories: ItemCategory[] = [];
  const addIfMatched = (category: ItemCategory, pattern: RegExp) => {
    if (pattern.test(text)) categories.push(category);
  };

  addIfMatched("books", /書籍|本|教材|コミック|漫画|雑誌|文庫/);
  addIfMatched("electronics", /家電|スマホ|携帯|パソコン|ＰＣ|PC|ゲーム機/);
  addIfMatched("furniture", /家具|ソファ|机|椅子|タンス|ベッド/);
  addIfMatched(
    "clothing",
    /衣料|服|ファッション|洋服|バッグ|靴|シューズ|帽子|時計|宝石|貴金属|服飾/,
  );
  addIfMatched("bicycle", /自転車|サイクル/);
  addIfMatched(
    "household",
    /日用品|生活用品|雑貨|食器|ホビー|玩具|おもちゃ|トレカ|ＣＤ|CD|ＤＶＤ|DVD|ソフト/,
  );
  return categories;
}

function trimmed(value: string | null): string | null {
  return value?.trim() || null;
}

function timeRange(open: string | null, close: string | null): string | null {
  const start = trimmed(open);
  const end = trimmed(close);
  return start && end ? `${start}〜${end}` : null;
}

function openingHours(business: BusinessRow): string[] {
  const lines: string[] = [];
  const days = trimmed(business.opening_days);
  if (days) {
    // Some municipal sources store 定休日 in opening_days instead of 営業曜日.
    const isClosedDays =
      business.source_record_json !== null &&
      "定休日" in business.source_record_json;
    lines.push(`${isClosedDays ? "定休日" : "営業日"}：${days}`);
  }
  const weekday = timeRange(business.weekday_open, business.weekday_close);
  const holiday = timeRange(business.holiday_open, business.holiday_close);
  if (weekday && (!holiday || holiday === weekday)) {
    lines.push(`営業時間：${weekday}`);
  } else if (weekday || holiday) {
    lines.push(
      `営業時間：${[
        weekday ? `平日 ${weekday}` : null,
        holiday ? `休日 ${holiday}` : null,
      ]
        .filter(Boolean)
        .join("／")}`,
    );
  }
  const notes = trimmed(business.hours_notes);
  if (notes) lines.push(notes);
  return lines;
}

function validExternalUrl(value: string | null): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

export class SupabaseRuleServiceProvider implements RuleServiceProvider {
  private readonly config: SupabaseConfig | null;

  constructor(
    config?: SupabaseConfig,
    private readonly fetcher: typeof fetch = fetch,
    private readonly serviceConfig?: SupabaseConfig,
  ) {
    this.config = config
      ? { ...config, url: config.url.replace(/\/+$/, "") }
      : null;
  }

  async getStations(): Promise<Station[]> {
    const rows = await this.read<StationRow[]>(
      "stations",
      {
        select: "station_id,station_name,lines",
        order: "station_name.asc,station_id.asc",
      },
      StationRowsSchema,
    );
    return rows.map((row) => ({
      id: row.station_id,
      name: row.station_name,
      lines: row.lines?.trim() ? [row.lines.trim()] : [],
    }));
  }

  async getBusinessesByStation(stationId: string): Promise<ServiceBusiness[]> {
    const rows = await this.read<StationBusinessRow[]>(
      "station_businesses",
      {
        select:
          "station_id,business_id,distance_meters,businesses!inner(business_id,name,address,website_url,purchase_status,business_category,products_handled_source_text,service_type_evidence,usage_notes,opening_days,weekday_open,weekday_close,holiday_open,holiday_close,hours_notes,source_record_json)",
        station_id: `eq.${stationId}`,
        distance_meters: `lte.${SEARCH_RADIUS_METERS}`,
        "businesses.purchase_status": "eq.confirmed",
        order: "distance_meters.asc",
      },
      StationBusinessRowsSchema,
    );

    return rows
      .filter(
        (row) =>
          row.station_id === stationId &&
          row.distance_meters <= SEARCH_RADIUS_METERS &&
          row.businesses.purchase_status === "confirmed",
      )
      .map((row): ServiceBusiness => ({
        id: row.business_id,
        stationId: row.station_id,
        name: row.businesses.name,
        address: row.businesses.address,
        distanceMeters: row.distance_meters,
        description:
          row.businesses.usage_notes ??
          row.businesses.service_type_evidence ??
          row.businesses.products_handled_source_text ??
          "買取条件の詳細は店舗へお問い合わせください。",
        supportedActions: ["sell"],
        supportedCategories: supportedCategories(row.businesses),
        purchaseStatus: "confirmed",
        isMock: false,
        externalUrl: validExternalUrl(row.businesses.website_url),
        openingHours: openingHours(row.businesses),
      }))
      .sort((a, b) => a.distanceMeters - b.distanceMeters);
  }

  async getOsmCandidatesByStation(
    stationId: string,
  ): Promise<OsmStoreCandidate[]> {
    const rows = await this.read<OsmStationCandidateRow[]>(
      "station_osm_candidate_matches",
      {
        select:
          "station_id,osm_object_type,osm_object_id,distance_meters,match_radius_meters,distance_method,osm_business_candidates!inner(osm_object_type,osm_object_id,name,address,latitude,longitude,source,license,tags,validation_status)",
        station_id: `eq.${stationId}`,
        distance_meters: `lte.${SEARCH_RADIUS_METERS}`,
        order: "distance_meters.asc,osm_object_type.asc,osm_object_id.asc",
        limit: String(OSM_PAGE_SIZE),
      },
      OsmStationCandidateRowsSchema,
      this.serviceConfig ?? serviceConfigFromEnvironment(),
    );

    return rows
      .filter(
        (row) =>
          row.station_id === stationId &&
          row.distance_meters <= SEARCH_RADIUS_METERS &&
          row.match_radius_meters <= SEARCH_RADIUS_METERS &&
          row.osm_business_candidates.license === OSM_DATA_LICENSE &&
          row.osm_business_candidates.validation_status ===
            "osm_candidate_not_branch_verified" &&
          candidateMetadata(row.osm_business_candidates.tags)
            ?.purchase_status === "unconfirmed",
      )
      .flatMap((row) => {
        const candidate = row.osm_business_candidates;
        if (
          !candidate.name ||
          candidate.latitude === null ||
          candidate.longitude === null
        ) {
          return [];
        }
        const metadata = candidateMetadata(candidate.tags) ?? {};
        const sourceUrl =
          typeof metadata.source_url === "string"
            ? metadata.source_url
            : null;
        if (!sourceUrl || !validExternalUrl(sourceUrl)) return [];
        const sourceShopTag =
          typeof metadata.shop_tag === "string" ? metadata.shop_tag : null;
        const sourceAmenityTag =
          typeof metadata.amenity_tag === "string"
            ? metadata.amenity_tag
            : null;
        return [
          {
            id: `${candidate.osm_object_type}-${candidate.osm_object_id}`,
            name: candidate.name,
            category:
              sourceShopTag ??
              stringTag(candidate.tags, "shop") ??
              sourceAmenityTag ??
              stringTag(candidate.tags, "amenity"),
            latitude: candidate.latitude,
            longitude: candidate.longitude,
            distanceMeters: row.distance_meters,
            sourceUrl,
            license: candidate.license ?? OSM_DATA_LICENSE,
            openingHours: stringTag(candidate.tags, "opening_hours"),
          },
        ];
      })
      .sort((a, b) => a.distanceMeters - b.distanceMeters);
  }

  async getOsmCandidateDataset(): Promise<{
    candidates: OsmBusinessRow[];
    stationMatches: OsmStationMatchRow[];
  }> {
    const config = this.serviceConfig ?? serviceConfigFromEnvironment();
    const candidates = await this.readAllPages(
      "osm_business_candidates",
      {
        select:
          "osm_object_type,osm_object_id,name,address,latitude,longitude,source,license,tags,validation_status",
        order: "osm_object_type.asc,osm_object_id.asc",
      },
      OsmBusinessRowsSchema,
      config,
    );
    const stationMatches = await this.readAllPages(
      "station_osm_candidate_matches",
      {
        select:
          "station_id,osm_object_type,osm_object_id,distance_meters,match_radius_meters,distance_method",
        order: "station_id.asc,distance_meters.asc,osm_object_type.asc,osm_object_id.asc",
      },
      OsmStationMatchRowsSchema,
      config,
    );
    return { candidates, stationMatches };
  }

  private async readAllPages<T>(
    table: string,
    query: Record<string, string>,
    responseSchema: z.ZodType<T[]>,
    config: SupabaseConfig,
  ): Promise<T[]> {
    const results: T[] = [];
    for (let offset = 0; ; offset += OSM_PAGE_SIZE) {
      const page = await this.read(
        table,
        {
          ...query,
          limit: String(OSM_PAGE_SIZE),
          offset: String(offset),
        },
        responseSchema,
        config,
      );
      results.push(...page);
      if (page.length < OSM_PAGE_SIZE) return results;
    }
  }

  private async read<T>(
    table: string,
    query: Record<string, string>,
    responseSchema: z.ZodType<T>,
    requestConfig?: SupabaseConfig,
  ): Promise<T> {
    const config = requestConfig ?? this.config ?? configFromEnvironment();
    const url = new URL(`${config.url.replace(/\/+$/, "")}/rest/v1/${table}`);
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }
    const headers: Record<string, string> = {
      apikey: config.apiKey,
      Accept: "application/json",
    };
    if (config.apiKey.split(".").length === 3) {
      headers.Authorization = `Bearer ${config.apiKey}`;
    }

    let response: Response;
    try {
      response = await this.fetcher(url, {
        headers,
        cache: "no-store",
      });
    } catch {
      throw new SupabaseRequestError("Supabase データベースに接続できませんでした。");
    }
    if (!response.ok) {
      throw new SupabaseRequestError(
        `Supabase データベースの読み込みに失敗しました（HTTP ${response.status}）。`,
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new SupabaseRequestError(
        "Supabase データベースから正しい応答を受け取れませんでした。",
      );
    }
    const parsed = responseSchema.safeParse(payload);
    if (!parsed.success) {
      throw new SupabaseRequestError(
        "Supabase データベースの応答形式が正しくありません。",
      );
    }
    return parsed.data;
  }
}
