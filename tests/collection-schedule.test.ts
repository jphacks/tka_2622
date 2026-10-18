import { describe, expect, it } from "vitest";
import bulkyWaste from "../src/data/gomi/tokyo/bulky-waste.json";
import { scheduleLoaders } from "../src/data/gomi/tokyo/loaders";
import { GET as getAreas } from "../src/app/api/disposal/areas/route";
import { GET as getMunicipalities } from "../src/app/api/disposal/municipalities/route";
import { buildRuleResultSpec } from "../src/lib/rule-ui/spec-builder";
import {
  describeRule,
  getDisposalGuide,
  isBulkyItem,
  listDisposalAreas,
  listDisposalMunicipalities,
  nextCollectionDates,
} from "../src/server/disposal/collection-schedule";
import { evaluateRules } from "../src/server/rules/engine";
import { DisposalGuideSchema } from "../src/types/disposal";

const TODAY = "2026-10-18"; // Sunday

function course(overrides: Partial<Parameters<typeof nextCollectionDates>[0]> = {}) {
  return {
    id: "1",
    areas: [{ name: "テスト1丁目" }],
    rules: [],
    overrides: [],
    unknownPeriods: [],
    ...overrides,
  };
}

describe("describeRule", () => {
  it("describes weekly and nth-weekday rules in Japanese", () => {
    expect(
      describeRule({ category: "burnable", pattern: "weekly", days: ["MO", "TH"] }),
    ).toBe("毎週 月・木曜日");
    expect(
      describeRule({
        category: "non_burnable",
        pattern: "monthly_nth",
        days: ["FR"],
        occurrences: [1, 3],
      }),
    ).toBe("毎月 第1・第3 金曜日");
  });
});

describe("nextCollectionDates", () => {
  it("finds the next weekly and nth-weekday dates", () => {
    const weekly = course({
      rules: [{ category: "burnable", pattern: "weekly", days: ["MO", "TH"] }],
    });
    expect(nextCollectionDates(weekly, "burnable", TODAY, "2027-04-01").dates).toEqual([
      "2026-10-19",
      "2026-10-22",
    ]);

    const nth = course({
      rules: [
        {
          category: "non_burnable",
          pattern: "monthly_nth",
          days: ["FR"],
          occurrences: [1, 3],
        },
      ],
    });
    // October's 1st/3rd Fridays (2nd, 16th) have passed.
    expect(nextCollectionDates(nth, "non_burnable", TODAY, "2027-04-01").dates).toEqual([
      "2026-11-06",
      "2026-11-20",
    ]);
  });

  it("skips cancelled days and unknown periods, and adds extra collections", () => {
    const value = course({
      rules: [{ category: "burnable", pattern: "weekly", days: ["MO"] }],
      overrides: [
        { date: "2026-10-19", cancelled: true },
        { date: "2026-10-21", category: "burnable" },
      ],
      unknownPeriods: [{ from: "2026-10-26", to: "2026-10-26" }],
    });
    expect(nextCollectionDates(value, "burnable", TODAY, "2027-04-01")).toEqual({
      dates: ["2026-10-21", "2026-11-02"],
      hitUnknown: true,
    });
  });

  it("does not list dates past the end of the data period", () => {
    const value = course({
      rules: [{ category: "burnable", pattern: "weekly", days: ["MO"] }],
    });
    expect(nextCollectionDates(value, "burnable", TODAY, "2026-10-20").dates).toEqual([
      "2026-10-19",
    ]);
  });
});

describe("bundled collection data", () => {
  it("lists all 62 Tokyo municipalities", () => {
    const municipalities = listDisposalMunicipalities(TODAY);
    expect(municipalities).toHaveLength(62);
    expect(municipalities.filter(({ hasSchedule }) => hasSchedule).length).toBeGreaterThan(0);
  });

  it("loads every bundled schedule and has a 粗大ごみ page for each one", async () => {
    for (const code of Object.keys(scheduleLoaders)) {
      const guide = await getDisposalGuide({
        municipalityCode: code,
        bulkyWaste: true,
        today: TODAY,
      });
      expect(DisposalGuideSchema.parse(guide).bulkyWaste.pageUrl).toBe(
        (bulkyWaste.pages as Record<string, string>)[code],
      );
    }
  });

  it("gives every area of every current schedule at least one collection", async () => {
    for (const { code, hasSchedule } of listDisposalMunicipalities(TODAY)) {
      if (!hasSchedule) continue;
      const areas = (await listDisposalAreas(code, TODAY)) ?? [];
      expect(areas.length).toBeGreaterThan(0);
      for (const area of areas) {
        const guide = await getDisposalGuide({
          municipalityCode: code,
          area: area.name,
          bulkyWaste: false,
          today: TODAY,
        });
        expect(guide?.status).toBe("scheduled");
        expect(guide?.schedule?.collections.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("getDisposalGuide", () => {
  it("returns the weekdays for a Shinagawa area", async () => {
    const guide = await getDisposalGuide({
      municipalityCode: "13109",
      area: "荏原5丁目",
      bulkyWaste: false,
      today: TODAY,
    });
    expect(guide?.status).toBe("scheduled");
    expect(guide?.schedule?.collections[0]).toEqual({
      category: "burnable",
      label: "燃やすごみ",
      rules: ["毎週 月・木曜日"],
      nextDates: ["2026-10-19", "2026-10-22"],
    });
    expect(guide?.schedule?.validUntil).toBe("2027-03-31");
  });

  it("asks for an area, or points to the official site when no data is bundled", async () => {
    expect(
      (await getDisposalGuide({ municipalityCode: "13109", bulkyWaste: false, today: TODAY }))
        ?.status,
    ).toBe("area_required");
    expect(
      (await getDisposalGuide({
        municipalityCode: "13109",
        area: "存在しない町",
        bulkyWaste: false,
        today: TODAY,
      }))?.status,
    ).toBe("area_required");
    const meguro = await getDisposalGuide({
      municipalityCode: "13110",
      area: "青葉台1丁目",
      bulkyWaste: false,
      today: TODAY,
    });
    expect(meguro?.status).toBe("no_schedule");
    expect(meguro?.municipality.officialUrl).toMatch(/^https:\/\/www\.city\.meguro/);
    expect(
      await getDisposalGuide({ municipalityCode: "99999", bulkyWaste: false }),
    ).toBeNull();
  });

  it("treats a schedule outside its data period as unavailable", async () => {
    const guide = await getDisposalGuide({
      municipalityCode: "13109",
      area: "荏原5丁目",
      bulkyWaste: false,
      today: "2027-05-01",
    });
    expect(guide?.status).toBe("no_schedule");
  });
});

describe("isBulkyItem", () => {
  it("flags furniture, bicycles and large items", () => {
    expect(isBulkyItem({ name: "木製デスク", category: "furniture" })).toBe(true);
    expect(isBulkyItem({ name: "ママチャリ", category: "bicycle" })).toBe(true);
    expect(isBulkyItem({ name: "収納ラック", category: "household" })).toBe(true);
    expect(isBulkyItem({ name: "文庫本", category: "books" })).toBe(false);
  });
});

describe("disposal API routes", () => {
  it("lists municipalities and areas", async () => {
    const municipalities = await (await getMunicipalities()).json();
    expect(municipalities.municipalities).toHaveLength(62);

    const areas = await getAreas(
      new Request("http://localhost/api/disposal/areas?municipality=13109"),
    );
    expect(areas.status).toBe(200);
    expect((await areas.json()).areas.map((area: { name: string }) => area.name)).toContain(
      "荏原5丁目",
    );
  });

  it("rejects an unknown municipality", async () => {
    const response = await getAreas(
      new Request("http://localhost/api/disposal/areas?municipality=abc"),
    );
    expect(response.status).toBe(400);
  });
});

describe("dispose results", () => {
  it("adds the collection schedule and a 粗大ごみ link for a desk", async () => {
    const result = await evaluateRules({
      item: { name: "木製デスク", category: "furniture" },
      selectedAction: "dispose",
      municipalityCode: "13109",
      disposalArea: "荏原5丁目",
    });
    expect(result.disposal?.status).toBe("scheduled");
    expect(result.disposal?.bulkyWaste.required).toBe(true);
    expect(result.notices.map(({ ruleId }) => ruleId)).toContain(
      "collection-schedule-source",
    );

    const spec = buildRuleResultSpec(result);
    const card = Object.values(spec.elements).find(
      (element) => element.type === "CollectionScheduleCard",
    );
    expect(card?.props.title).toBe("品川区 荏原5丁目のごみ収集日");
    expect(card?.props.bulkyWaste).not.toBeNull();
    // Shinagawa collects six 資源 categories on the same day; they share a row.
    const rows = card?.props.rows as Array<{ label: string; rule: string }>;
    expect(rows.find((row) => row.label.startsWith("資源プラスチック"))?.label).toBe(
      "資源プラスチック・ペットボトル・びん・飲料缶・古紙・蛍光灯・電池類",
    );
  });

  it("does not send appliance-recycling items to 粗大ごみ", async () => {
    const result = await evaluateRules({
      item: { name: "冷蔵庫", category: "furniture" },
      selectedAction: "dispose",
      municipalityCode: "13109",
      disposalArea: "荏原5丁目",
    });
    expect(result.disposal?.bulkyWaste.required).toBe(false);
  });

  it("keeps the verification card when no municipality is chosen", async () => {
    const result = await evaluateRules({
      item: { name: "木製デスク", category: "furniture" },
      selectedAction: "dispose",
    });
    expect(result.disposal).toBeNull();
    const types = Object.values(buildRuleResultSpec(result).elements).map(
      (element) => element.type,
    );
    expect(types).toContain("DisposalVerificationCard");
    expect(types).not.toContain("CollectionScheduleCard");
  });
});
