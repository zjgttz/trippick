/**
 * v2.0 多城市内容补全 (#6)
 *
 * 当用户笔记抽出的 POI 太少 (< 6) 时，调 Gemini 用知识库补充几个
 * 该城市的高人气 POI，丰富候选池。这个调用是异步的，不阻塞主流程。
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { callLLM, LLMError } from "@/lib/llm";
import { POIItemSchema } from "@/lib/schema";
import { checkRateLimit, getClientIP } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 120;

const RequestSchema = z.object({
  destination: z.string().min(1).max(100),
  existing_names: z.array(z.string()).default([]),
  trip_style: z.array(z.string()).default([]),
  /** 偏好（可选） */
  preferences: z
    .object({
      budget: z.string().optional(),
      party_size: z.string().optional(),
      styles: z.array(z.string()).optional(),
    })
    .nullable()
    .optional(),
});

const EnrichResultSchema = z.object({
  items: z.array(POIItemSchema).max(8),
});

const ENRICH_SYSTEM_PROMPT = `你是"旅行 POI 推荐助手"。

任务：用户已经从几篇小红书攻略中抽出了部分 POI，但数量不够。请基于你的知识库，为指定目的地补充 3-5 个高人气、口碑好的 POI（避免与已有列表重复）。

每个补充的 POI 必须包含完整字段（与抽取结果同 schema）：
- name: 真实存在的地名
- type: 景点 / 餐厅 / 住宿 / 交通 / 其他
- source_count: 固定填 1
- recommended_reasons: 2-3 个简短推荐理由
- warnings: 可空
- suitable_for: 1-2 个适合人群
- estimated_budget: 价格范围
- suggested_time: 建议游玩时段
- confidence_score: 70-85（AI 补充的均值偏中）
- source: 固定填 "ai_recommended"

输出严格 JSON: { "items": [...] }，禁止 markdown 包裹。`;

export async function POST(req: Request) {
  const ip = getClientIP(req);
  const rate = checkRateLimit(ip);
  if (!rate.ok) {
    return NextResponse.json(
      { error: "rate_limited", message: "请求过于频繁" },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_json", message: "请求体不是有效 JSON" },
      { status: 400 }
    );
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "validation_error",
        message: parsed.error.issues[0]?.message || "参数校验失败",
      },
      { status: 400 }
    );
  }

  const { destination, existing_names, trip_style, preferences } = parsed.data;

  const userPrompt = `目的地: ${destination}
${trip_style.length ? `旅行风格: ${trip_style.join("、")}\n` : ""}已有 POI（请避开，不要重复）:
${existing_names.length ? existing_names.map((n) => `- ${n}`).join("\n") : "（无）"}
${
  preferences
    ? `\n用户偏好:\n- 预算: ${preferences.budget || "任意"}\n- 同行: ${preferences.party_size || "任意"}\n- 风格: ${(preferences.styles || []).join("、") || "任意"}`
    : ""
}

请输出 3-5 个补充推荐，按 confidence_score 从高到低排序，只输出 JSON。`;

  try {
    const result = await callLLM({
      systemPrompt: ENRICH_SYSTEM_PROMPT,
      userPrompt,
      schema: EnrichResultSchema,
      tag: "enrich",
    });

    // 确保 source 字段被标对
    const items = result.items.map((it) => ({
      ...it,
      source: "ai_recommended" as const,
    }));

    return NextResponse.json({ ok: true, items });
  } catch (e) {
    const err = e instanceof LLMError ? e : new LLMError(String(e), "network");
    console.error("[enrich] failed:", err.stage, err.message);
    return NextResponse.json(
      {
        ok: false,
        error: "enrich_failed",
        message: "AI 补充推荐暂时不可用",
        items: [],
      },
      { status: 200 }
    );
  }
}
