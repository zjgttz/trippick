/**
 * LLM Prompt 设计：两次调用拆分
 *  - extract: 多篇笔记文本 → 抽取 POI items
 *  - conflicts: 已抽取的 items → 冲突列表 + 推荐排期
 *
 * 设计原则：
 * - 强制 JSON 输出，禁止 markdown 包裹
 * - few-shot 精简到最小（仅展示字段名 + 1 项示例），节省 tokens 提速
 * - conflict_type 枚举值在 prompt 中明确列举
 */

export const EXTRACT_SYSTEM_PROMPT = `从小红书旅行笔记抽取结构化 POI。

输出字段：destination、trip_style(2-4个)、items[]。每个 item 含 source_count(出现笔记数) 和 confidence_score(0-100)。

confidence_score = 出现频次40% + 情绪强度30%(强推+/踩雷-) + 评价一致性30%。

合并：同名或仅标点差异视为同项（如"灵隐寺"="灵隐寺景区"）；recommended_reasons/warnings 取并集去重。

type 仅可取：景点/餐厅/住宿/交通/其他。

严格 JSON 输出，无 markdown 无解释。`;

// 超精简：仅列字段名/类型，response_format=json_object 已保证输出为 JSON。节省 ~250 tokens
export const EXTRACT_FEW_SHOT = `输出字段：
destination(str), trip_style(str[]),
items[]: name, type(景点|餐厅|住宿|交通|其他), source_count(int), recommended_reasons(str[]), warnings(str[]), suitable_for(str[]), estimated_budget(str), suggested_time(str), confidence_score(0-100)`;

export function buildExtractUserPrompt(notes: string[]): string {
  const noteSection = notes
    .map((n, i) => `=== 笔记${i + 1} ===\n${n.trim()}`)
    .join("\n\n");
  return `${EXTRACT_FEW_SHOT}

---
现在请处理下面 ${notes.length} 篇真实笔记，按相同 JSON 结构输出（只输出 JSON）：

${noteSection}`;
}

// ============ 冲突 + 排期 Prompt ============

export const CONFLICTS_SYSTEM_PROMPT = `分析 POI items 的冲突并生成排期。

conflict_type 仅可取：
- distance: 两地距离过远不宜同日（基于城市地理常识）
- opinion: 同一地点存在正反评价（warnings 含"避雷/坑"且有 recommended_reasons）
- time_overload: 同时段候选 > 3 个
- prerequisite: 需预约/季节限定/限工作日（warnings 含"预约/限时/季节"）

每个 conflict 必须含 items(名称取自传入 items.name)、reason、suggestion。

itinerary_suggestion：默认 2 天，items>12 可排 3 天；同日地理就近；高 confidence 排 morning/afternoon；餐厅放用餐时段；每 slot 1-3 项；note 给实用建议。

严格 JSON 输出，无 markdown。`;

// 精简：删去完整 few-shot 示例，仅保留字段结构说明，节省 ~500 tokens
export const CONFLICTS_FEW_SHOT = `输出 JSON 结构（严格按此格式）：
{
  "conflicts": [
    {"conflict_type":"distance|opinion|time_overload|prerequisite", "items":["地点1","地点2"], "reason":"原因", "suggestion":"建议"}
  ],
  "itinerary_suggestion": [
    {"day":1, "slots":[
      {"time_slot":"morning", "items":["地点A","地点B"], "note":"实用建议"},
      {"time_slot":"afternoon", "items":[], "note":""},
      {"time_slot":"evening", "items":[], "note":""}
    ]}
  ]
}
要点：items 数组元素必须严格使用传入 items.name 的原文；day 取 1/2/3；time_slot 三选一 morning/afternoon/evening。`;

export function buildConflictsUserPrompt(
  destination: string,
  items: unknown[]
): string {
  return `${CONFLICTS_FEW_SHOT}

---
目的地：${destination}
items 列表（请基于这些项做冲突分析与排期，items 字段名必须严格使用这里的 name）：

${JSON.stringify(items, null, 2)}

只输出 JSON。`;
}

// ============ 合并 Prompt（v2.0 性能，一次调用代替 Extract+Conflict） ============

export const FULL_SYSTEM_PROMPT = `从小红书旅行笔记一次性抽取推荐地点、识别提醒并生成行程排期。

输出字段（全部必填，缺则补空）：destination(非空字符串)、trip_style(2-4个字符串)、items[]、conflicts[]、itinerary_suggestion[]。
即使笔记内容不足，也绝不能输出空 destination 或空 items 数组；items 至少 1 项。
conflicts 没有时输出空数组 [] 即可，不能省略字段。

【items 计算】
source_count = 出现笔记数；confidence_score (0-100 整数) = 出现频次40% + 情绪强度30% (强推+/踩雷-) + 一致性30%。
同名或仅标点差异视为同项（如"灵隐寺"="灵隐寺景区"）；recommended_reasons/warnings 并集去重。
type 枚举：景点/餐厅/住宿/交通/其他。其它字符串字段缺失用 "" 补位，数组字段缺失用 [] 补位，不要 null。

【conflicts 识别】
conflict_type 仅取：
- distance: 两地距离过远不宜同日
- opinion: warnings 含"避雷/坑"且有 recommended_reasons
- time_overload: 同时段候选>3
- prerequisite: 需预约/季节限定/限工作日
每个 conflict 含 items(名取自 items.name)、reason、suggestion。

【itinerary_suggestion 排期】
若用户偏好里指定了行程时长（X 天），则 itinerary_suggestion 必须严格输出 X 个 day，不多不少；未指定时按 items 数量判断（≤6 一天，7-12 两天，更多三天）。
同日地理就近；高 confidence 排 morning/afternoon；餐厅放用餐时段；每 slot 1-3 项；note 给实用建议。
slot.items 中的地点名必须来自 items.name。天数超过 2 时，可允许同一地点在不同天不同时段重复出现作为备选。

严格 JSON 输出，无 markdown 无解释。`;

export const FULL_FEW_SHOT = `输出字段结构：
destination(str), trip_style(str[]),
items[]: name, type(枚举), source_count(int), recommended_reasons(str[]), warnings(str[]), suitable_for(str[]), estimated_budget(str), suggested_time(str), confidence_score(0-100),
conflicts[]: conflict_type(distance|opinion|time_overload|prerequisite), items(str[]), reason(str), suggestion(str),
itinerary_suggestion[]: day(int), slots[]: time_slot(morning|afternoon|evening), items(str[]), note(str)`;

export function buildFullUserPrompt(notes: string[]): string {
  const noteSection = notes
    .map((n, i) => `=== 笔记${i + 1} ===\n${n.trim()}`)
    .join("\n\n");
  return `${FULL_FEW_SHOT}

---
现在处理下面 ${notes.length} 篇真实笔记，一次性产出上述全部 5 个字段（只输出 JSON）：

${noteSection}`;
}
