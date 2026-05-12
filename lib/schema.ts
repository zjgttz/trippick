import { z } from "zod";

/**
 * 宽容的 string 默认值：LLM 不一定吓遵守 "undefined则不包含字段"，它经常输出 null 甚至 数字。
 * 此函数会把 null/undefined/非 string 都归为 默认值（默认 空字符串）。
 */
function lenientString(defaultValue = ""): z.ZodType<string> {
  return z.preprocess(
    (v) => (v == null || typeof v !== "string" ? defaultValue : v),
    z.string()
  ) as z.ZodType<string>;
}

/** 宽容的 string[]：报 null/undefined/非数组都归为 []。 */
function lenientStringArray(): z.ZodType<string[]> {
  return z.preprocess(
    (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string") : []),
    z.array(z.string())
  ) as z.ZodType<string[]>;
}

// ============ Step 2: items 抽取 ============
export const POITypeEnum = z.enum(["景点", "餐厅", "住宿", "交通", "其他"]);
export type POIType = z.infer<typeof POITypeEnum>;

// v2.0 source: 区分 POI 是从用户笔记抽取的、还是 AI 补充的热门推荐
export const POISourceEnum = z.enum(["user_note", "ai_recommended"]);
export type POISource = z.infer<typeof POISourceEnum>;

export const POIItemSchema = z.object({
  name: z.string().min(1),
  type: POITypeEnum,
  source_count: z.preprocess(
    (v) => (typeof v === "number" ? v : 1),
    z.number().int().min(1)
  ) as z.ZodType<number>,
  recommended_reasons: lenientStringArray(),
  warnings: lenientStringArray(),
  suitable_for: lenientStringArray(),
  estimated_budget: lenientString(),
  suggested_time: lenientString(),
  confidence_score: z.preprocess(
    (v) => (typeof v === "number" ? v : 60),
    z.number().int().min(0).max(100)
  ) as z.ZodType<number>,
  source: z.preprocess(
    (v) => (v === "ai_recommended" || v === "user_note" ? v : "user_note"),
    POISourceEnum
  ) as z.ZodType<POISource>,
});
export type POIItem = z.output<typeof POIItemSchema>;

export const ExtractResultSchema = z.object({
  destination: z.string().min(1),
  trip_style: lenientStringArray(),
  items: z.array(POIItemSchema),
});
export type ExtractResult = z.output<typeof ExtractResultSchema>;

// ============ Step 4: 冲突 ============
export const ConflictTypeEnum = z.enum([
  "distance",
  "opinion",
  "time_overload",
  "prerequisite",
]);
export type ConflictType = z.infer<typeof ConflictTypeEnum>;

export const ConflictSchema = z.object({
  conflict_type: ConflictTypeEnum,
  items: lenientStringArray(),
  reason: lenientString(),
  suggestion: lenientString(),
});
export type Conflict = z.infer<typeof ConflictSchema>;

// ============ itinerary_suggestion ============
export const TimeSlotEnum = z.enum(["morning", "afternoon", "evening"]);
export type TimeSlot = z.infer<typeof TimeSlotEnum>;

export const ItinerarySlotSchema = z.object({
  time_slot: TimeSlotEnum,
  items: lenientStringArray(),
  note: lenientString(),
});
export type ItinerarySlot = z.output<typeof ItinerarySlotSchema>;

export const ItineraryDaySchema = z.object({
  day: z.number().int().min(1),
  slots: z.array(ItinerarySlotSchema),
});
export type ItineraryDay = z.output<typeof ItineraryDaySchema>;

export const ConflictResultSchema = z.object({
  conflicts: z.preprocess(
    (v) => (Array.isArray(v) ? v : []),
    z.array(ConflictSchema)
  ) as z.ZodType<z.infer<typeof ConflictSchema>[]>,
  itinerary_suggestion: z.preprocess(
    (v) => (Array.isArray(v) ? v : []),
    z.array(ItineraryDaySchema)
  ) as z.ZodType<z.infer<typeof ItineraryDaySchema>[]>,
});
export type ConflictResult = z.output<typeof ConflictResultSchema>;

// v2.0 性能：Extract + Conflict 合并为一次 LLM 调用，避免串行两次 30-60s
export const FullAnalysisSchema = z.object({
  destination: z.string().min(1),
  trip_style: lenientStringArray(),
  items: z.array(POIItemSchema),
  conflicts: z.preprocess(
    (v) => (Array.isArray(v) ? v : []),
    z.array(ConflictSchema)
  ) as z.ZodType<z.infer<typeof ConflictSchema>[]>,
  itinerary_suggestion: z.preprocess(
    (v) => (Array.isArray(v) ? v : []),
    z.array(ItineraryDaySchema)
  ) as z.ZodType<z.infer<typeof ItineraryDaySchema>[]>,
});
export type FullAnalysis = z.output<typeof FullAnalysisSchema>;

// ============ 完整分析结果（前端用） ============
// 用 output 类型，确保 default 字段都是 required
export interface AnalysisResult {
  destination: string;
  trip_style: string[];
  items: POIItem[];
  conflicts: Conflict[];
  itinerary_suggestion: ItineraryDay[];
  source_titles: string[];
  generated_at?: string;
  is_mock: boolean;
}

// ============ 冲突类型展示元信息 ============
export const CONFLICT_META: Record<
  ConflictType,
  { label: string; icon: string; color: string; bg: string; ring: string }
> = {
  distance: {
    label: "距离较远",
    icon: "🗺️",
    color: "text-warn-distance",
    bg: "bg-warn-distance/10",
    ring: "ring-warn-distance/30",
  },
  opinion: {
    label: "口碑分歧",
    icon: "⚠️",
    color: "text-warn-opinion",
    bg: "bg-warn-opinion/10",
    ring: "ring-warn-opinion/30",
  },
  time_overload: {
    label: "同时段太多",
    icon: "⏰",
    color: "text-warn-overload",
    bg: "bg-warn-overload/10",
    ring: "ring-warn-overload/30",
  },
  prerequisite: {
    label: "需要提前准备",
    icon: "📋",
    color: "text-warn-prereq",
    bg: "bg-warn-prereq/10",
    ring: "ring-warn-prereq/30",
  },
};

export const TIME_SLOT_LABEL: Record<TimeSlot, string> = {
  morning: "上午",
  afternoon: "下午",
  evening: "晚上",
};
