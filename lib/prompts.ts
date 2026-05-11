/**
 * LLM Prompt 设计：两次调用拆分
 *  - extract: 多篇笔记文本 → 抽取 POI items
 *  - conflicts: 已抽取的 items → 冲突列表 + 推荐排期
 *
 * 设计原则：
 * - 强制 JSON 输出，禁止 markdown 包裹
 * - few-shot：1 个完整示例锚定格式
 * - conflict_type 枚举值在 prompt 中明确列举
 * - confidence_score 评分依据明确
 */

export const EXTRACT_SYSTEM_PROMPT = `你是"小红书旅行攻略结构化提取助手"。

任务：用户会粘贴若干篇小红书旅行笔记原文，你需要：
1. 自动识别目的地（destination）
2. 推断这趟旅行的风格标签（trip_style，2-4 个）
3. 提取所有出现的地点（景点/餐厅/住宿/交通/其他），合并同一地点的多次出现
4. 为每个地点计算 source_count（出现在几篇笔记中）和 confidence_score（0-100）

confidence_score 评分依据：
- 出现频次：40%（出现笔记数越多分越高）
- 情绪强度：30%（"强烈推荐""一定要去""绝美"等加分；"踩雷""避雷"减分）
- 推荐一致性：30%（多篇评价方向是否一致）

合并规则：
- 名称相同或仅大小写/标点差异的视为同一地点
- "灵隐寺" 与 "灵隐寺景区" 视为同一项
- 同类但明确不同的店铺/景点保留为独立条目（如多家不同餐厅）
- recommended_reasons 取多篇并集去重，warnings 同理

type 枚举严格使用：景点 / 餐厅 / 住宿 / 交通 / 其他

输出严格 JSON，禁止任何 markdown 包裹（不要 \`\`\`json）、不要解释文字。`;

export const EXTRACT_FEW_SHOT = `示例输入：
=== 笔记1 ===
法喜寺真的太美了，氛围超级好，建议早上来人少。
=== 笔记2 ===
法喜寺值得一去，但是周末人很多要早到。在杭州。

示例输出：
{
  "destination": "杭州",
  "trip_style": ["寺庙游", "拍照"],
  "items": [
    {
      "name": "法喜寺",
      "type": "景点",
      "source_count": 2,
      "recommended_reasons": ["氛围好", "适合拍照"],
      "warnings": ["周末人多", "需要早到"],
      "suitable_for": ["女生", "拍照党"],
      "estimated_budget": "免费",
      "suggested_time": "上午、平日",
      "confidence_score": 82
    }
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

export const CONFLICTS_SYSTEM_PROMPT = `你是"旅行行程冲突分析助手"。

输入：已经从多篇小红书笔记中抽取出的 POI items 列表（JSON 形式）。
输出：两个字段
- conflicts：识别到的冲突列表
- itinerary_suggestion：基于这些 items 给出的推荐排期（Day 1 / Day 2，每天分 morning / afternoon / evening）

conflict_type 严格使用以下 4 个枚举值：
- "distance"：两地物理距离过远，不适合同一天
- "opinion"：不同笔记对同一地点评价相反
- "time_overload"：某时段候选安排过满（同一时段建议项 > 3 个）
- "prerequisite"：有前置条件（需要预约、特定季节限定、仅限工作日等）

冲突识别规则：
- 利用你对该城市的地理知识判断 distance（如杭州西湖与良渚相距约 30 公里）
- warnings 字段中含"避雷/坑/不推荐"且 recommended_reasons 同时存在 → opinion
- 多个地点 suggested_time 都在同一时段 → time_overload
- warnings 含"预约/限时/季节"等关键词 → prerequisite

每个 conflict 必须包含 items（涉及地点名，必须来自传入的 items.name）、reason、suggestion。

itinerary_suggestion 规则：
- 默认排 2 天（Day 1 / Day 2），如果传入 items 数量超过 12 个可以排 3 天
- 同一天内尽量地理上相近的地点放在一起
- 高 confidence_score 的项目优先排进 morning / afternoon
- 餐厅类排在用餐时段
- 每个 slot 的 items 数量控制在 1-3 个，避免 time_overload
- note 字段给出该时段的实用建议（出发时间、注意事项）

严格输出 JSON，禁止 markdown 包裹。`;

export const CONFLICTS_FEW_SHOT = `示例输入 items：
[
  {"name":"法喜寺","type":"景点","confidence_score":86,"suggested_time":"上午","warnings":["周末人多"]},
  {"name":"良渚文化村","type":"景点","confidence_score":75,"suggested_time":"上午","warnings":[]},
  {"name":"灵隐寺","type":"景点","confidence_score":82,"suggested_time":"上午","warnings":["需要预约"]}
]

示例输出：
{
  "conflicts": [
    {
      "conflict_type": "distance",
      "items": ["法喜寺", "良渚文化村"],
      "reason": "两地距离约30公里，驾车需40分钟以上，不建议安排在同一天",
      "suggestion": "法喜寺与灵隐寺组合为半日游，良渚单独安排一个下午"
    },
    {
      "conflict_type": "time_overload",
      "items": ["法喜寺", "灵隐寺", "良渚文化村"],
      "reason": "三个景点均建议上午游览，集中在同一时段会导致行程过密",
      "suggestion": "良渚移至 Day 2 上午，与西湖景点错开"
    },
    {
      "conflict_type": "prerequisite",
      "items": ["灵隐寺"],
      "reason": "灵隐寺需要提前预约，临时到达可能无法进入",
      "suggestion": "出行前一天在公众号或官网预约"
    }
  ],
  "itinerary_suggestion": [
    {
      "day": 1,
      "slots": [
        {"time_slot": "morning", "items": ["法喜寺", "灵隐寺"], "note": "建议 8 点前到，提前一天预约灵隐寺"},
        {"time_slot": "afternoon", "items": [], "note": "可补充西湖周边"},
        {"time_slot": "evening", "items": [], "note": "用户自由安排"}
      ]
    },
    {
      "day": 2,
      "slots": [
        {"time_slot": "morning", "items": ["良渚文化村"], "note": "距市区远，建议早出发"},
        {"time_slot": "afternoon", "items": [], "note": ""},
        {"time_slot": "evening", "items": [], "note": ""}
      ]
    }
  ]
}`;

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
