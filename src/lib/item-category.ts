import type { ItemCategory } from "../types/recognition";

const MUSICAL_INSTRUMENT_PATTERN = /ギター|ベース|バイオリン|ヴィオラ|チェロ|楽器|guitar|bass|violin|cello/i;
const GAME_CONSOLE_PATTERN =
  /\b(psp|playstation|game\s*boy|nintendo\s*(switch|ds|3ds))\b|ゲーム機|携帯型ゲーム機|携帯ゲーム機|プレイステーション[\s・]*ポータブル/i;
const HOME_APPLIANCE_PATTERN =
  /冷蔵庫|洗濯機|電子レンジ|掃除機|refrigerator|fridge|washing machine|microwave/i;

export function isMusicalInstrumentName(name: string): boolean {
  return MUSICAL_INSTRUMENT_PATTERN.test(name);
}

export function isGameConsoleName(name: string): boolean {
  return GAME_CONSOLE_PATTERN.test(name);
}

export function displayItemCategory(
  category: ItemCategory,
  name: string,
): string {
  if (isMusicalInstrumentName(name)) return "楽器";
  if (isGameConsoleName(name)) return "ゲーム機";
  if (category === "electronics" && HOME_APPLIANCE_PATTERN.test(name)) {
    return "家電";
  }
  const labels: Record<ItemCategory, string> = {
    furniture: "家具",
    electronics: "家電・電子機器",
    books: "本・書籍",
    clothing: "衣類",
    bicycle: "自転車",
    household: "日用品",
    other: "その他",
  };
  return labels[category];
}

export function ruleItemCategory(
  category: ItemCategory,
  name: string,
): ItemCategory {
  return isMusicalInstrumentName(name) ? "other" : category;
}
