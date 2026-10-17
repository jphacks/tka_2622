import { describe, expect, it } from "vitest";
import { POST as matchPost } from "../src/app/api/services/match/route";
import { GET as stationsGet } from "../src/app/api/stations/route";

function matchRequest(payload: unknown): Request {
  return new Request("http://localhost/api/services/match", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

const validInput = {
  item: {
    name: "エレキギター",
    category: "other",
    conditionGrade: 4,
    observations: [],
  },
  selectedAction: "sell",
};

describe("Pipeline 2 route handlers", () => {
  it("reports the unavailable station directory when Supabase is not configured", async () => {
    const originalUrl = process.env.SUPABASE_URL;
    const originalKey = process.env.SUPABASE_ANON_KEY;
    const originalPublicUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const originalPublishableKey =
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    try {
      const response = await stationsGet();
      const payload = await response.json();

      expect(response.status).toBe(503);
      expect(payload.error.code).toBe("STATION_DIRECTORY_UNAVAILABLE");
      expect(payload.error.message).toContain("Supabase が設定されていません");
    } finally {
      if (originalUrl === undefined) delete process.env.SUPABASE_URL;
      else process.env.SUPABASE_URL = originalUrl;
      if (originalKey === undefined) delete process.env.SUPABASE_ANON_KEY;
      else process.env.SUPABASE_ANON_KEY = originalKey;
      if (originalPublicUrl === undefined) {
        delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      } else {
        process.env.NEXT_PUBLIC_SUPABASE_URL = originalPublicUrl;
      }
      if (originalPublishableKey === undefined) {
        delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
      } else {
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY =
          originalPublishableKey;
      }
    }
  });

  it("does not return mock sale businesses when Supabase is unavailable", async () => {
    const originalUrl = process.env.SUPABASE_URL;
    const originalKey = process.env.SUPABASE_ANON_KEY;
    const originalPublicUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const originalPublishableKey =
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    try {
      const response = await matchPost(
        matchRequest({ ...validInput, stationId: "station-a" }),
      );
      const payload = await response.json();

      expect(response.status).toBe(503);
      expect(payload.error.code).toBe("SERVICE_DIRECTORY_UNAVAILABLE");
    } finally {
      if (originalUrl !== undefined) process.env.SUPABASE_URL = originalUrl;
      if (originalKey !== undefined) process.env.SUPABASE_ANON_KEY = originalKey;
      if (originalPublicUrl !== undefined) {
        process.env.NEXT_PUBLIC_SUPABASE_URL = originalPublicUrl;
      }
      if (originalPublishableKey !== undefined) {
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY =
          originalPublishableKey;
      }
    }
  });

  it.each(["keep", "give", "dispose"] as const)(
    "returns no sale businesses for %s",
    async (selectedAction) => {
      const response = await matchPost(
        matchRequest({
          ...validInput,
          stationId: "mock-takadanobaba",
          selectedAction,
        }),
      );
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload.results).toEqual([]);
    },
  );

  it("rejects invalid input", async () => {
    const invalid = await matchPost(matchRequest({ stationId: "mock-shinjuku" }));

    expect(invalid.status).toBe(400);
  });
});
