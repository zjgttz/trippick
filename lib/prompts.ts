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

// 精简到最小：仅展示 1 个完整 POI 字段示例，节省 ~300 tokens
export const EXTRACT_FEW_SHOT = `输出格式（严格按此字段名）：
{
  "destination":"杭州",
  "trip_style":["寺庙游","拍照"],
  "items":[
    {"name":"法喜寺","type":"景点","source_count":2,"recommended_reasons":["氛围好","适合拍照"],"warnings":["周末人多"],"suitable_for":["女生"],"estimated_budget":"免费","suggested_time":"上午","confidence_score":82}
  ]
}`;

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
