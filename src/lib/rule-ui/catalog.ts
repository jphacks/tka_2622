import { defineCatalog } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { z } from "zod";

const NoticeSchema = z.object({
  ruleId: z.string(),
  type: z.enum(["info", "caution", "needs_verification"]),
  message: z.string(),
  sourceUrl: z.string().nullable(),
});

const StoreSchema = z.object({
  id: z.string(),
  name: z.string(),
  address: z.string(),
  distanceMeters: z.number(),
  description: z.string(),
  externalUrl: z.string().nullable(),
  isMock: z.boolean(),
  openingHours: z.array(z.string()),
});

const OsmCandidateSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string().nullable(),
  latitude: z.number(),
  longitude: z.number(),
  distanceMeters: z.number(),
  sourceUrl: z.string(),
  license: z.string(),
  openingHours: z.string().nullable(),
});

export const ruleUiCatalog = defineCatalog(schema, {
  components: {
    ResultStack: {
      props: z.object({}),
      slots: ["default"],
      description: "縦に並ぶ、整理方法の結果カード群。",
    },
    RecommendationCard: {
      props: z.object({
        actionLabel: z.string(),
        selectedLabel: z.string(),
        confidenceLabel: z.string(),
        reason: z.string(),
      }),
      description: "ルールエンジンによる提案とユーザー選択を区別して表示する。",
    },
    ItemSummaryCard: {
      props: z.object({
        name: z.string(),
        categoryLabel: z.string(),
        conditionLabel: z.string(),
        observations: z.array(z.string()),
      }),
      description: "認識済みの品名、カテゴリ、外観状態を表示する。",
    },
    ActionGuideCard: {
      props: z.object({
        title: z.string(),
        introduction: z.string(),
        directoryMessage: z.string(),
      }),
      description: "選択した整理方法の案内を表示する。",
    },
    ActionCtaCard: {
      props: z.object({
        label: z.string(),
        target: z.enum([
          "#station-selector",
          "#transfer-channels",
          "#disposal-notices",
          "#action-checklist",
        ]),
      }),
      description: "選択した整理方法に応じた次の操作へ案内する。",
    },
    TransferChannelsCard: {
      props: z.object({
        channels: z.array(
          z.object({
            title: z.string(),
            description: z.string(),
          }),
        ),
      }),
      description: "利用可否の確認を前提に、譲渡先を探す候補を案内する。",
    },
    CollectionScheduleCard: {
      props: z.object({
        title: z.string(),
        bulkyWaste: z
          .object({
            message: z.string(),
            url: z.string().nullable(),
            linkLabel: z.string(),
          })
          .nullable(),
        rows: z.array(
          z.object({
            label: z.string(),
            rule: z.string(),
            next: z.string().nullable(),
          }),
        ),
        emptyMessage: z.string().nullable(),
        unknownDatesNote: z.string().nullable(),
        officialUrl: z.string().nullable(),
        officialLabel: z.string(),
        sourceText: z.string().nullable(),
        sourceUrl: z.string(),
      }),
      description:
        "選択した区市町村・地域のごみ収集曜日と、粗大ごみの申込み案内を表示する。",
    },
    DisposalVerificationCard: {
      props: z.object({
        title: z.string(),
        items: z.array(z.string()),
      }),
      description: "自治体の公式案内で確認する処分手順を表示する。",
    },
    PackingAdviceCard: {
      props: z.object({
        title: z.string(),
        items: z.array(z.string()),
      }),
      description: "商品カテゴリに合わせた搬出・梱包の注意点を表示する。",
    },
    ChecklistCard: {
      props: z.object({
        title: z.string(),
        items: z.array(z.string()),
      }),
      description: "実行前に確認できる短いチェックリストを表示する。",
    },
    StoreList: {
      props: z.object({ items: z.array(StoreSchema) }),
      description: "買取対応を確認した正式商家だけを表示する。",
    },
    OsmCandidateList: {
      props: z.object({ items: z.array(OsmCandidateSchema) }),
      description: "買取サービス未確認のOSM候補。カテゴリを買取対象とみなさない。",
    },
    NoticeCard: {
      props: z.object({
        notices: z.array(NoticeSchema),
      }),
      description: "確認が必要な法令・安全・自治体情報を表示する。",
    },
    EmptyStateCard: {
      props: z.object({
        title: z.string(),
        message: z.string(),
      }),
      description: "駅選択やサービスデータがない場合の案内を表示する。",
    },
  },
  actions: {},
});
