import type { RuleInput, RuleNotice } from "./schemas";
import type { Action } from "../../types/recognition";

const APPLIANCE_RECYCLING_SOURCE =
  "https://www.env.go.jp/recycle/kaden/";
const SMALL_APPLIANCE_RECYCLING_SOURCE =
  "https://www.env.go.jp/recycle/recycling/raremetals/";

function includesAny(text: string, patterns: string[]): boolean {
  return patterns.some((pattern) => text.includes(pattern));
}

export function getExceptionNotices(
  input: RuleInput,
  selectedAction: Action,
): RuleNotice[] {
  if (selectedAction !== "dispose") return [];

  const name = input.item.name.toLocaleLowerCase("ja-JP");
  const notices: RuleNotice[] = [];

  if (
    includesAny(name, [
      "冷蔵庫",
      "冷凍庫",
      "テレビ",
      "エアコン",
      "洗濯機",
      "衣類乾燥機",
    ])
  ) {
    notices.push({
      ruleId: "home-appliance-recycling",
      type: "needs_verification",
      message:
        "冷蔵庫・テレビ・エアコン・洗濯機などは家電リサイクル法の対象となる場合があります。通常の粗大ごみとして出さず、自治体または公式案内で対象品目と手続を確認してください。",
      sourceUrl: APPLIANCE_RECYCLING_SOURCE,
    });
  }

  if (
    input.item.containsLithiumBattery === true ||
    includesAny(name, [
      "リチウムイオン電池",
      "モバイルバッテリー",
      "充電式電池",
      "充電池",
      "電池パック",
    ])
  ) {
    notices.push({
      ruleId: "lithium-battery",
      type: "needs_verification",
      message:
        "リチウムイオン電池や充電式電池を含む場合、回収方法は自治体や製品によって異なります。一般ごみに混ぜず、自治体または公式回収案内を確認してください。",
      sourceUrl: SMALL_APPLIANCE_RECYCLING_SOURCE,
    });
  }

  if (
    input.item.isLargeItem === true ||
    includesAny(name, ["粗大", "大型家具"])
  ) {
    notices.push({
      ruleId: "bulky-item",
      type: "needs_verification",
      message:
        "大型品の扱い、申込み、手数料は居住自治体によって異なります。駅から居住自治体を推定せず、お住まいの自治体の公式案内を確認してください。",
    });
  }

  return notices;
}
