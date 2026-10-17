import type { Station } from "../types/station";

export const MOCK_STATIONS: Station[] = [
  { id: "mock-shinjuku", name: "新宿駅", lines: ["JR各線", "東京メトロ丸ノ内線"] },
  { id: "mock-shibuya", name: "渋谷駅", lines: ["JR各線", "東京メトロ各線"] },
  { id: "mock-takadanobaba", name: "高田馬場駅", lines: ["JR山手線", "東京メトロ東西線"] },
  { id: "mock-ikebukuro", name: "池袋駅", lines: ["JR各線", "東京メトロ各線"] },
  { id: "mock-akihabara", name: "秋葉原駅", lines: ["JR各線", "東京メトロ日比谷線"] },
];
