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
  it("lists mock stations with namespaced IDs", async () => {
    const response = await stationsGet();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.stations.map((station: { id: string }) => station.id)).toEqual(
      expect.arrayContaining([
        "mock-shinjuku",
        "mock-shibuya",
        "mock-takadanobaba",
        "mock-ikebukuro",
        "mock-akihabara",
      ]),
    );
  });

  it("returns sorted sale results for the selected station", async () => {
    const response = await matchPost(
      matchRequest({ ...validInput, stationId: "mock-takadanobaba" }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.dataSource).toBe("mock");
    expect(payload.results.map((business: { distanceMeters: number }) =>
      business.distanceMeters,
    )).toEqual([280, 640, 910]);
    expect(payload.results.every((business: { isMock: boolean }) =>
      business.isMock,
    )).toBe(true);
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

  it("returns an empty state response for a known station without mock data", async () => {
    const response = await matchPost(
      matchRequest({ ...validInput, stationId: "mock-shibuya" }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.results).toEqual([]);
  });

  it("rejects invalid input and unknown station IDs", async () => {
    const invalid = await matchPost(matchRequest({ stationId: "mock-shinjuku" }));
    const unknownStation = await matchPost(
      matchRequest({ ...validInput, stationId: "unknown-station" }),
    );

    expect(invalid.status).toBe(400);
    expect(unknownStation.status).toBe(404);
  });
});
