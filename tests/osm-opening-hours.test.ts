import { describe, expect, it } from "vitest";
import { formatOsmOpeningHours } from "../src/lib/osm-opening-hours";

describe("formatOsmOpeningHours", () => {
  it.each([
    ["Mo-Su 11:00-20:00", "月〜日 11:00〜20:00"],
    ["10:00-21:00", "10:00〜21:00"],
    ["24/7", "24時間営業"],
    ["Mo-Su,PH 10:00-22:00", "月〜日・祝日 10:00〜22:00"],
    ["11:00-18:00; Tu, We, PH off", "11:00〜18:00／火・水・祝日 休み"],
    [
      "Mo-Fr 10:30-19:30; Sa,Su,PH 10:00-19:30",
      "月〜金 10:30〜19:30／土・日・祝日 10:00〜19:30",
    ],
    ["Mo-Su 11:30-14:30, 17:30-22:30", "月〜日 11:30〜14:30、17:30〜22:30"],
    ["Mo-Fr 11:00-20:00; PH closed", "月〜金 11:00〜20:00／祝日 休み"],
    ["Th-Tu 10:00-19:00; We,Su[2,4] off", "木〜火 10:00〜19:00／水・第2・4日曜 休み"],
    ["Mo-Su 10:00-20:00; Jan 01 off", "月〜日 10:00〜20:00／1月1日 休み"],
    ["10:00-18:00; Jan 01-03 off", "10:00〜18:00／1月1日〜3日 休み"],
    ["10:00+", "10:00〜"],
    ["Mo,Tu,Th-Sa 10:00-18:30; We Off", "月・火・木〜土 10:00〜18:30／水 休み"],
  ])("formats %s", (input, expected) => {
    expect(formatOsmOpeningHours(input)).toBe(expected);
  });

  it.each(["Mo-Su sunrise-sunset", "Mo-Su 10:00-20:00 \"要予約\"", ""])(
    "keeps unsupported syntax unchanged: %s",
    (input) => {
      expect(formatOsmOpeningHours(input)).toBe(input);
    },
  );
});
