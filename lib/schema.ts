import { z } from "zod";

// ============ Step 2: items 抽取 ============
export const POITypeEnum = z.enum(["景点", "餐厅", "住宿", "交通", "其他"]);
export type POIType = z.infer<typeof POITypeEnum>;

// v2.0 source: 区分 POI 是从用户笔记抽取的、还是 AI 补充的热门推荐
export const POISourceEnum = z.enum(["user_note", "ai_recommended"]);
export type POISource = z.infer<typeof POISourceEnum>;

export const POIItemSchema = z.object({
  name: z.string().min(1),
  type: POITypeEnum,
  source_count: z.number().int().min(1),
  recommended_reasons: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
  suitable_for: z.array(z.string()).default([]),
  estimated_budget: z.string().default(""),
  suggested_time: z.string().default(""),
  confidence_score: z.number().int().min(0).max(100),
  source: POISourceEnum.default("user_note"),
});
export type POIItem = z.output<typeof POIItemSchema>;

export const ExtractResultSchema = z.object({
  destination: z.string().min(1),
  trip_style: z.array(z.string()).default([]),
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
  items: z.array(z.string()).min(1),
  reason: z.string(),
  suggestion: z.string(),
});
export type Conflict = z.infer<typeof ConflictSchema>;

// ============ itinerary_suggestion ============
export const TimeSlotEnum = z.enum(["morning", "afternoon", "evening"]);
export type TimeSlot = z.infer<typeof TimeSlotEnum>;

export const ItinerarySlotSchema = z.object({
  time_slot: TimeSlotEnum,
  items: z.array(z.string()).default([]),
  note: z.string().default(""),
});
export type ItinerarySlot = z.output<typeof ItinerarySlotSchema>;

export const ItineraryDaySchema = z.object({
  day: z.number().int().min(1),
  slots: z.array(ItinerarySlotSchema),
});
export type ItineraryDay = z.output<typeof ItineraryDaySchema>;

export const ConflictResultSchema = z.object({
  conflicts: z.array(ConflictSchema).default([]),
  itinerary_suggestion: z.array(ItineraryDaySchema).default([]),
});
export type ConflictResult = z.output<typeof ConflictResultSchema>;

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
    label: "距离冲突",
    icon: "🗺️",
    color: "text-warn-distance",
    bg: "bg-warn-distance/10",
    ring: "ring-warn-distance/30",
  },
  opinion: {
    label: "评价分歧",
    icon: "⚠️",
    color: "text-warn-opinion",
    bg: "bg-warn-opinion/10",
    ring: "ring-warn-opinion/30",
  },
  time_overload: {
    label: "时段过载",
    icon: "⏰",
    color: "text-warn-overload",
    bg: "bg-warn-overload/10",
    ring: "ring-warn-overload/30",
  },
  prerequisite: {
    label: "前置条件",
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
