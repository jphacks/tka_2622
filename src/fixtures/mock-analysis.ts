import type { AnalyzeResponse } from "../types/recognition";

export const MOCK_ANALYSIS: AnalyzeResponse = {
  item: {
    name: "携帯型ゲーム機（PSP）",
    category: "electronics",
    condition: {
      grade: 4,
      observations: [
        "本体の外装に目立つ大きな破損は見られません。",
        "画面とボタンが写真で確認できます。",
        "写真だけでは電源や各機能の動作は確認できません。",
      ],
      needsUserConfirmation: true,
    },
  },
  recommendation: {
    action: "sell",
    reason:
      "外観を確認したうえで、動作や付属品を確認してから売却を検討できます。",
  },
};
