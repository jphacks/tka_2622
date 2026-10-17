import { validateSpec, type Spec } from "@json-render/core";
import { z } from "zod";
import type { Action, ItemCategory } from "../../types/recognition";
import type { RuleResult } from "../../server/rules/schemas";
import { ruleUiCatalog } from "./catalog";

const ACTION_LABELS: Record<Action, string> = {
  keep: "保管する",
  sell: "売る",
  give: "譲る",
  dispose: "処分する",
};

const ACTION_CTA_LABELS: Record<Action, string> = {
  keep: "持っていく準備をする",
  sell: "近くの買取店を探す",
  give: "譲り先を探す",
  dispose: "処分方法を確認する",
};

const ACTION_CTA_TARGETS: Record<Action, string> = {
  keep: "#action-checklist",
  sell: "#station-selector",
  give: "#transfer-channels",
  dispose: "#disposal-notices",
};

const CATEGORY_LABELS: Record<ItemCategory, string> = {
  furniture: "家具",
  electronics: "家電・電子機器",
  books: "本・教材",
  clothing: "衣類",
  bicycle: "自転車",
  household: "日用品",
  other: "その他",
};

const CONFIDENCE_LABELS = {
  low: "低め",
  medium: "参考",
  high: "高め",
} as const;

const RuleUiBlockSchema = z.enum([
  "recommendation",
  "item-summary",
  "action-guide",
  "checklist",
  "transfer-channels",
  "disposal-verification",
  "packing-advice",
  "action-cta",
  "store-list",
  "osm-candidates",
  "empty-state",
  "notices",
]);

const RuleUiPlanSchema = z.object({
  blocks: z.array(RuleUiBlockSchema),
});

export type RuleUiPlan = z.infer<typeof RuleUiPlanSchema>;

export interface RuleUiComposer {
  compose(result: RuleResult): unknown;
}

export const deterministicRuleUiComposer: RuleUiComposer = {
  compose(result) {
    const blocks: RuleUiPlan["blocks"] = [
      "recommendation",
      "item-summary",
      "action-guide",
    ];
    if (result.selectedAction === "give") blocks.push("transfer-channels");
    if (result.selectedAction === "dispose") {
      blocks.push("disposal-verification");
    }
    if (result.selectedAction === "keep") blocks.push("packing-advice");
    blocks.push("checklist", "action-cta");
    if (result.selectedAction === "sell") {
      blocks.push("store-list");
      if (
        result.services.status !== "available" ||
        result.services.items.length === 0
      ) {
        blocks.push("empty-state");
      }
      blocks.push("osm-candidates");
    }
    if (
      result.sections.includes("SafetyNoticeCard") &&
      result.notices.length > 0
    ) {
      blocks.push("notices");
    }
    if (result.notices.length > 0 && !blocks.includes("notices")) {
      blocks.push("notices");
    }
    return { blocks };
  },
};

type ChecklistCategory = ItemCategory | "musicalInstrument";

const CATEGORY_CHECKLISTS: Partial<
  Record<Action, Partial<Record<ChecklistCategory, string>>>
> = {
  keep: {
    furniture: "新居の設置場所と搬出経路の寸法を確認する",
    electronics: "付属品を本体と一緒にまとめる",
    musicalInstrument: "弦や可動部を保護し、ケースがあれば本体と一緒に運ぶ",
  },
  sell: {
    books: "書き込みや付属資料の有無を確認する",
    electronics: "動作状況と付属品を整理し、査定時に伝える",
    clothing: "汚れやサイズ表示を確認する",
    furniture: "寸法と搬出方法を事前に確認する",
    musicalInstrument: "楽器本体・付属品と、確認できた動作状態を整理する",
  },
  give: {
    books: "書き込みや付属資料の有無を相手に伝える",
    clothing: "サイズや目立つ汚れを相手に伝える",
    musicalInstrument: "音出し確認の可否と付属品の有無を相手に伝える",
  },
};

function isMusicalInstrument(result: RuleResult): boolean {
  return /ギター|guitar|楽器/i.test(result.item.name);
}

function categoryChecklist(result: RuleResult): string[] {
  const category = isMusicalInstrument(result)
    ? "musicalInstrument"
    : result.item.category;
  const extra = CATEGORY_CHECKLISTS[result.selectedAction]?.[category];
  return extra && !result.guidance.steps.includes(extra)
    ? [...result.guidance.steps, extra]
    : result.guidance.steps;
}

function conditionContext(result: RuleResult): string {
  if (result.item.conditionGrade === null) {
    return "写真だけでは状態を判断できないため、傷みや不足がないか実物で確認し、不明点として相手に伝えましょう。";
  }
  if (result.item.conditionGrade <= 2) {
    return `写真での外観評価は${result.item.conditionGrade}/5です。気になる傷みや不具合は隠さず、分かる範囲を伝えましょう。`;
  }
  return `写真での外観評価は${result.item.conditionGrade}/5です。実物の状態や動作は、受け渡し・査定前に改めて確認しましょう。`;
}

function personalizedGuide(result: RuleResult): {
  title: string;
  introduction: string;
} {
  const instrument = isMusicalInstrument(result);
  const categoryTitles: Record<ItemCategory, string> = {
    furniture: "家具",
    electronics: "家電・電子機器",
    books: "本・教材",
    clothing: "衣類",
    bicycle: "自転車",
    household: "日用品",
    other: "持ち物",
  };
  const subject = instrument
    ? "楽器"
    : categoryTitles[result.item.category];
  const titleByAction: Record<Action, string> = {
    sell: `${subject}を売る前に確認しましょう`,
    give: `${subject}を譲る準備をしましょう`,
    dispose: `${subject}の処分方法を確認しましょう`,
    keep: `${subject}を新居へ安全に運びましょう`,
  };

  if (result.selectedAction === "sell" && instrument) {
    return {
      title: titleByAction.sell,
      introduction: `「${result.item.name}」は、弦や本体の状態、アンプ等で確認できた動作、ケースなど付属品の有無を整理し、確認できた範囲を買取店へ伝えましょう。${conditionContext(result)}`,
    };
  }
  if (result.selectedAction === "keep" && instrument) {
    return {
      title: titleByAction.keep,
      introduction: `「${result.item.name}」は、ケースがあれば収納し、ネックやボディに衝撃が伝わらないよう固定しましょう。弦・ケーブルなどは本体と分けてまとめ、運搬中に動かないようにします。${conditionContext(result)}`,
    };
  }
  if (result.selectedAction === "give" && result.item.category === "books") {
    return {
      title: titleByAction.give,
      introduction: `「${result.item.name}」は、書き込み・折れ・付属資料の有無や版を確認し、受け取る人が判断できるよう伝えましょう。${conditionContext(result)}`,
    };
  }
  if (
    result.selectedAction === "dispose" &&
    /冷蔵庫|冷凍庫/.test(result.item.name)
  ) {
    return {
      title: titleByAction.dispose,
      introduction:
        "冷蔵庫・冷凍庫は家電リサイクル法の対象となる場合があります。通常のごみ区分を推測せず、お住まいの自治体と公式案内で対象品目・手続きを確認してください。",
    };
  }

  const defaultIntroductions: Record<Action, string> = {
    sell: `${result.guidance.introduction} ${conditionContext(result)}`,
    give: `${result.guidance.introduction} ${conditionContext(result)}`,
    dispose:
      "分別区分や回収方法は品目とお住まいの自治体で異なります。自治体の公式案内で確認し、未確認の区分では出さないでください。",
    keep: `${result.guidance.introduction} ${conditionContext(result)}`,
  };
  return {
    title: titleByAction[result.selectedAction],
    introduction: defaultIntroductions[result.selectedAction],
  };
}

function packingAdvice(result: RuleResult): string[] {
  if (isMusicalInstrument(result)) {
    return [
      "ケースがある場合は使用し、ケース内で動くときは柔らかい緩衝材で固定する",
      "ネック・ペグ・ボディに荷重がかからない向きで運ぶ",
      "ケーブルや小物は本体と分け、紛失しないようまとめる",
    ];
  }
  if (result.item.category === "books") {
    return [
      "重くなりすぎない量に小分けし、箱の底を補強する",
      "水濡れを避け、箱の外側に内容物を記す",
      "大切な資料や付属物は本と一緒にまとめる",
    ];
  }
  if (result.item.category === "electronics") {
    return [
      "電源を切り、ケーブルや付属品を本体ごとにまとめる",
      "画面や突起部を保護し、箱の中で動かないよう固定する",
      "取扱説明書や取り外した部品を一緒に管理する",
    ];
  }
  return [
    "新居の設置場所と搬入経路を先に確認する",
    "外せる部品や付属品をまとめ、本体に固定する",
    "運搬中に傷や破損が起きないよう保護する",
  ];
}

function transferChannels(result: RuleResult): {
  title: string;
  description: string;
}[] {
  if (result.item.category === "books") {
    return [
      {
        title: "知人・学校・職場",
        description:
          "必要とする人がいないか相談し、書き込みや版など本の状態を伝えます。",
      },
      {
        title: "地域の譲渡募集",
        description:
          "自治体・地域団体の掲示板や募集窓口を探し、書籍の受入れ条件を確認します。",
      },
      {
        title: "寄付・回収窓口",
        description:
          "本を受け付ける団体や施設があるかを調べ、対象資料・状態・持込方法を確認します。",
      },
    ];
  }
  return [
    {
      title: "知人・家族",
      description: "必要とする人がいないか相談し、状態や受け渡し方法を共有します。",
    },
    {
      title: "学校・職場・地域の募集",
      description:
        "利用できる掲示板や譲渡募集を探し、掲載・受け渡しのルールを確認します。",
    },
    {
      title: "地域団体・寄付窓口",
      description:
        "受入れ先があるかを調べ、品目・状態・受付条件を事前に確認します。",
    },
  ];
}

function emptyStateContent(result: RuleResult): {
  title: string;
  message: string;
} {
  switch (result.services.status) {
    case "needs_station":
      return {
        title: "駅を選ぶと近くのサービスを確認できます",
        message: "最寄り駅を選択してください。駅から居住自治体は判断しません。",
      };
    case "error":
      return {
        title: "サービスを確認できませんでした",
        message: "時間をおいて再度お試しください。",
      };
    default:
      return {
        title: "確認済みの買取サービスはまだありません",
        message:
          "この駅の周辺では、確認済みの買取サービスがまだ登録されていません。",
      };
  }
}

function safePlan(result: RuleResult, composer: RuleUiComposer): RuleUiPlan {
  const parsed = RuleUiPlanSchema.safeParse(composer.compose(result));
  if (!parsed.success) {
    return RuleUiPlanSchema.parse(deterministicRuleUiComposer.compose(result));
  }

  const allowed = new Set<RuleUiPlan["blocks"][number]>([
    "recommendation",
    "item-summary",
    "action-guide",
    "checklist",
    "action-cta",
    ...(result.selectedAction === "give" ? ["transfer-channels" as const] : []),
    ...(result.selectedAction === "dispose"
      ? ["disposal-verification" as const]
      : []),
    ...(result.selectedAction === "keep" ? ["packing-advice" as const] : []),
    ...(result.selectedAction === "sell"
      ? [
          "store-list" as const,
          "osm-candidates" as const,
          ...(result.services.status !== "available" ||
          result.services.items.length === 0
            ? ["empty-state" as const]
            : []),
        ]
      : []),
    ...(result.notices.length > 0 ? ["notices" as const] : []),
  ]);
  const required = deterministicRuleUiComposer.compose(result) as RuleUiPlan;
  const requested = parsed.data.blocks.filter((block) => allowed.has(block));
  const blocks = [
    "recommendation" as const,
    ...requested.filter((block) => block !== "recommendation"),
    ...required.blocks.filter((block) => !requested.includes(block)),
  ];
  return { blocks: [...new Set(blocks)] };
}

export function validateRuleUiSpec(candidate: unknown): Spec | null {
  const catalogResult = ruleUiCatalog.validate(candidate);
  if (!catalogResult.success || !catalogResult.data) return null;
  return validateSpec(catalogResult.data).valid ? catalogResult.data : null;
}

export function buildRuleResultSpec(
  result: RuleResult,
  composer: RuleUiComposer = deterministicRuleUiComposer,
): Spec {
  const plan = safePlan(result, composer);
  const elements: Spec["elements"] = {};
  const children: string[] = [];

  const add = (key: string, type: string, props: Record<string, unknown>) => {
    children.push(key);
    elements[key] = { type, props, children: [] };
  };

  for (const block of plan.blocks) {
    if (block === "recommendation") {
      add("recommendation", "RecommendationCard", {
        actionLabel: ACTION_LABELS[result.recommendedAction],
        selectedLabel: ACTION_LABELS[result.selectedAction],
        confidenceLabel: CONFIDENCE_LABELS[result.recommendationConfidence],
        reason: result.recommendationReason,
      });
    } else if (block === "item-summary") {
      add("item-summary", "ItemSummaryCard", {
        name: result.item.name,
        categoryLabel: CATEGORY_LABELS[result.item.category],
        conditionLabel:
          result.item.conditionGrade === null
            ? "写真からの外観評価：判定できません"
            : `写真からの外観評価：${result.item.conditionGrade}/5`,
        observations: result.item.observations,
      });
    } else if (block === "action-guide") {
      const guide = personalizedGuide(result);
      add("action-guide", "ActionGuideCard", {
        title: guide.title,
        introduction: guide.introduction,
        directoryMessage:
          result.selectedAction === "sell"
            ? result.services.status === "empty"
              ? "この駅の周辺では、確認済みの買取サービスがまだ登録されていません。"
              : "買取対象や受付条件は店舗によって異なるため、利用前に確認してください。"
            : result.guidance.directoryMessage,
      });
    } else if (block === "checklist") {
      add("checklist", "ChecklistCard", {
        title:
          result.selectedAction === "keep"
            ? "引っ越し前のチェックリスト"
            : result.selectedAction === "sell"
              ? "売却前のチェックリスト"
              : result.selectedAction === "give"
                ? "譲渡前のチェックリスト"
                : "処分前の確認事項",
        items: categoryChecklist(result),
      });
    } else if (block === "action-cta") {
      add("action-cta", "ActionCtaCard", {
        label: ACTION_CTA_LABELS[result.selectedAction],
        target: ACTION_CTA_TARGETS[result.selectedAction],
      });
    } else if (block === "transfer-channels") {
      add("transfer-channels", "TransferChannelsCard", {
        channels: transferChannels(result),
      });
    } else if (block === "disposal-verification") {
      add("disposal-verification", "DisposalVerificationCard", {
        title: "自治体の公式案内で確認すること",
        items: [
          `「${result.item.name}」の分別・回収区分`,
          "対象品目に応じたリサイクル制度や申込み方法",
          "手数料、回収日、出す場所または持込先",
          "不明点がある場合の自治体窓口",
        ],
      });
    } else if (block === "packing-advice") {
      add("packing-advice", "PackingAdviceCard", {
        title: isMusicalInstrument(result)
          ? "楽器の梱包・運搬"
          : result.item.category === "books"
            ? "本・教材の梱包"
            : result.item.category === "electronics"
              ? "電子機器の梱包・運搬"
              : "持ち物の梱包・運搬",
        items: packingAdvice(result),
      });
    } else if (block === "store-list") {
      add(
        "store-list",
        "StoreList",
        {
          items: result.services.items.map((item) => ({
            id: item.id,
            name: item.name,
            address: item.address,
            distanceMeters: item.distanceMeters,
            description: item.description,
            externalUrl: item.externalUrl ?? null,
            isMock: item.isMock,
          })),
        },
      );
    } else if (block === "osm-candidates") {
      add("osm-candidates", "OsmCandidateList", {
        items: result.services.osmCandidates.map((candidate) => ({
          id: candidate.id,
          name: candidate.name,
          category: candidate.category,
          latitude: candidate.latitude,
          longitude: candidate.longitude,
          distanceMeters: candidate.distanceMeters,
          sourceUrl: candidate.sourceUrl,
          license: candidate.license,
        })),
      });
    } else if (block === "empty-state") {
      add("empty-state", "EmptyStateCard", emptyStateContent(result));
    } else if (block === "notices" && result.notices.length > 0) {
      add("notices", "NoticeCard", {
        notices: result.notices.map((notice) => ({
          ...notice,
          sourceUrl: notice.sourceUrl ?? null,
        })),
      });
    }
  }

  const candidate: Spec = {
    root: "result",
    elements: {
      result: {
        type: "ResultStack",
        props: {},
        children,
      },
      ...elements,
    },
  };
  const validated = validateRuleUiSpec(candidate);
  if (validated) return validated;

  const fallback = deterministicRuleUiComposer.compose(result);
  if (composer === deterministicRuleUiComposer || !RuleUiPlanSchema.safeParse(fallback).success) {
    throw new Error("固定の結果UI Specを検証できませんでした。");
  }
  return buildRuleResultSpec(result, deterministicRuleUiComposer);
}
