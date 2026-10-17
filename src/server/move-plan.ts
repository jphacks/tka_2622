import { createHash } from "node:crypto";
import { z } from "zod";
import { ActionSchema, ItemCategorySchema } from "../types/recognition";
import { RuleResultSchema } from "./rules/schemas";

export { moveDateForTask } from "../lib/move-plan-date";

export const MovePlanTaskSchema = z
  .object({
    itemId: z.string().uuid(),
    action: ActionSchema,
    taskTitle: z.string().trim().min(1).max(80),
    taskDescription: z.string().trim().min(1).max(240),
    steps: z.array(z.string().trim().min(1).max(140)).min(1).max(5),
    daysBeforeMove: z.number().int().min(0).max(180),
    priority: z.enum(["high", "medium", "low"]),
    requiresOfficialConfirmation: z.boolean(),
  })
  .strict();

export const MovePlanSchema = z
  .object({
    summary: z.string().trim().min(1).max(180),
    tasks: z.array(MovePlanTaskSchema).min(1).max(40),
  })
  .strict();

export type MovePlan = z.infer<typeof MovePlanSchema>;
export type MovePlanTask = z.infer<typeof MovePlanTaskSchema>;

export interface MovePlanItem {
  id: string;
  name: string;
  category: z.infer<typeof ItemCategorySchema>;
  action: z.infer<typeof ActionSchema>;
  status: "pending" | "in_progress" | "completed";
  handlingGuide: z.infer<typeof RuleResultSchema>;
}

const DATE_LIKE_FACT_PATTERN =
  /(?:20\d{2}[/-]\d{1,2}(?:[/-]\d{1,2})?|\d{1,2}月\d{1,2}日)/;

export function buildMovePlanItems(
  itemRows: Array<Record<string, unknown>>,
  planRows: Array<Record<string, unknown>>,
): MovePlanItem[] {
  const itemsById = new Map(
    itemRows.flatMap((row) =>
      typeof row.id === "string" ? [[row.id, row] as const] : [],
    ),
  );

  return planRows.flatMap((row) => {
    if (
      typeof row.item_id !== "string" ||
      !itemsById.has(row.item_id) ||
      typeof row.selected_action !== "string"
    ) {
      return [];
    }
    const item = itemsById.get(row.item_id);
    if (!item) return [];
    const action = ActionSchema.safeParse(row.selected_action);
    const guide = RuleResultSchema.safeParse(row.handling_guide);
    const category = ItemCategorySchema.safeParse(
      typeof item.category === "string"
        ? item.category
        : guide.success
          ? guide.data.item.category
          : null,
    );
    const status = z
      .enum(["pending", "in_progress", "completed"])
      .safeParse(item.status);
    const name =
      typeof item.name === "string" && item.name.trim()
        ? item.name.trim()
        : guide.success
          ? guide.data.item.name
          : null;

    if (
      !action.success ||
      !guide.success ||
      !category.success ||
      !status.success ||
      !name ||
      guide.data.selectedAction !== action.data
    ) {
      return [];
    }

    return [
      {
        id: row.item_id,
        name,
        category: category.data,
        action: action.data,
        status: status.data,
        handlingGuide: guide.data,
      },
    ];
  });
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalize(entry)]),
  );
}

export function hashMovePlanInput(
  items: MovePlanItem[],
  selectedStationId: string | null,
): string {
  const snapshot = {
    selectedStationId,
    items: [...items]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map(({ id, name, category, action, handlingGuide }) => ({
        id,
        name,
        category,
        action,
        handlingGuide,
      })),
  };
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(snapshot)))
    .digest("hex");
}

export function validateMovePlan(
  value: unknown,
  items: MovePlanItem[],
): MovePlan {
  const parsed = MovePlanSchema.parse(value);
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const seenTasks = new Set<string>();
  const coveredItems = new Set<string>();
  const tasksByItem = new Map<string, number>();

  for (const task of parsed.tasks) {
    const sourceItem = itemsById.get(task.itemId);
    if (!sourceItem || sourceItem.action !== task.action) {
      throw new Error("The generated task does not match a saved item plan.");
    }
    if (task.action === "dispose" && !task.requiresOfficialConfirmation) {
      throw new Error("Disposal tasks must require official confirmation.");
    }
    const taskText = [
      task.taskTitle,
      task.taskDescription,
      ...task.steps,
    ].join(" ");
    if (DATE_LIKE_FACT_PATTERN.test(taskText)) {
      throw new Error("Generated tasks must not invent calendar dates.");
    }
    const duplicateKey = [
      task.itemId,
      task.action,
      task.taskTitle.toLocaleLowerCase("ja-JP"),
    ].join(":");
    if (seenTasks.has(duplicateKey)) {
      throw new Error("The generated plan contains duplicate tasks.");
    }
    seenTasks.add(duplicateKey);
    coveredItems.add(task.itemId);
    const itemTaskCount = (tasksByItem.get(task.itemId) ?? 0) + 1;
    if (itemTaskCount > 3) {
      throw new Error("The generated plan contains too many tasks for an item.");
    }
    tasksByItem.set(task.itemId, itemTaskCount);
  }

  if (coveredItems.size !== items.length) {
    throw new Error("The generated plan must include every saved item plan.");
  }

  return parsed;
}

export function buildMovePlanPrompt(
  items: MovePlanItem[],
  selectedStationId: string | null,
): string {
  return JSON.stringify({
    selectedStationId,
    items: items.map((item) => ({
      itemId: item.id,
      itemName: item.name,
      category: item.category,
      selectedAction: item.action,
      savedGuide: {
        title: item.handlingGuide.guidance.title,
        steps: item.handlingGuide.guidance.steps,
        notices: item.handlingGuide.notices.map((notice) => notice.message),
      },
      currentStatus: item.status,
    })),
  });
}
