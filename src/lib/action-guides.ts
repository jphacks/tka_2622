import type { Action } from "../types/recognition";

export interface ActionGuideContent {
  title: string;
  introduction: string;
  steps: string[];
  directoryMessage: string;
}

export const ACTION_GUIDES: Record<Action, ActionGuideContent> = {
  keep: {
    title: "新居でも使い続けるために",
    introduction: "搬出前に状態と搬入経路を確認しておきましょう。",
    steps: [
      "サイズを測り、新居の設置場所を確認する",
      "搬出経路とエレベーターの寸法を確認する",
      "外せる部品や付属品をまとめておく",
      "傷や汚れを写真に記録しておく",
    ],
    directoryMessage: "搬出経路と新居の設置場所を確認してから、持っていく準備を進めましょう。",
  },
  sell: {
    title: "売却前に確認しましょう",
    introduction: "査定条件は店舗によって異なるため、事前の問い合わせがおすすめです。",
    steps: [
      "商品の状態を確認する",
      "付属品・説明書・購入時の箱を確認する",
      "近くの買取店を探す",
      "店舗に買取条件と受付方法を確認する",
    ],
    directoryMessage: "買取対象や受付条件は店舗によって異なるため、利用前に確認してください。",
  },
  give: {
    title: "譲る前に準備しましょう",
    introduction: "受け取る人が状態を判断できるよう、分かる範囲を伝えましょう。",
    steps: [
      "傷・汚れ・不足している付属品を確認する",
      "サイズや受け渡し可能な日時を整理する",
      "写真と一緒に状態を具体的に伝える",
      "受け渡し方法と運搬の担当を相談する",
    ],
    directoryMessage: "身近な募集や地域の窓口を探し、品目ごとの受入れ条件を確認してください。",
  },
  dispose: {
    title: "処分前に自治体の案内を確認しましょう",
    introduction: "分別や回収方法は、お住まいの自治体と品目によって異なります。",
    steps: [
      "お住まいの自治体の公式案内を確認する",
      "品目・大きさ・素材に応じた分別方法を調べる",
      "必要な場合は回収の申込みや手数料を確認する",
      "回収日と出す場所を確認する",
    ],
    directoryMessage: "駅から居住自治体は判断できないため、分類・回収先の自動案内は行いません。",
  },
};
