import { afterEach, describe, expect, it, vi } from "vitest";
import { PUT } from "../src/app/api/profile/route";
import { requireApiUser } from "../src/lib/supabase/server";

vi.mock("../src/lib/supabase/server", () => ({
  requireApiUser: vi.fn(),
}));

function configureProfileSave() {
  let savedProfile: Record<string, unknown> | null = null;
  const stationQuery = {
    select: vi.fn(() => stationQuery),
    eq: vi.fn(() => stationQuery),
    maybeSingle: vi.fn().mockResolvedValue({
      data: { station_id: "station-a" },
      error: null,
    }),
  };
  const profileQuery = {
    upsert: vi.fn((profile: Record<string, unknown>) => {
      savedProfile = profile;
      return profileQuery;
    }),
    select: vi.fn(() => profileQuery),
    single: vi.fn(async () => ({
      data: { ...savedProfile, moving_date: savedProfile?.moving_date ?? null },
      error: null,
    })),
  };
  const supabase = {
    from: vi.fn((table: string) =>
      table === "stations" ? stationQuery : profileQuery,
    ),
  };
  vi.mocked(requireApiUser).mockResolvedValue({
    supabase,
    user: { id: "user-1" },
  } as never);
  return { profileQuery };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("PUT /api/profile moving date", () => {
  it("saves the selected date without timezone conversion", async () => {
    const { profileQuery } = configureProfileSave();
    const response = await PUT(
      new Request("http://localhost/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          residenceType: "apartment",
          nearestStationId: "station-a",
          movingDate: "2026-11-15",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(profileQuery.upsert.mock.calls[0][0].moving_date).toBe("2026-11-15");
  });

  it("keeps an existing date when older callers omit the optional field", async () => {
    const { profileQuery } = configureProfileSave();
    const response = await PUT(
      new Request("http://localhost/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          residenceType: "apartment",
          nearestStationId: "station-a",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(profileQuery.upsert.mock.calls[0][0]).not.toHaveProperty("moving_date");
  });

  it("rejects invalid calendar dates", async () => {
    configureProfileSave();
    const response = await PUT(
      new Request("http://localhost/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          residenceType: "apartment",
          nearestStationId: "station-a",
          movingDate: "2026-02-30",
        }),
      }),
    );

    expect(response.status).toBe(400);
  });
});
