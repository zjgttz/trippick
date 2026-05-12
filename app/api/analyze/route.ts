/**
 * 主 API Route：
 * - 接收用户粘贴的笔记数组
 * - 顺序调用 extract → conflicts 两次 LLM
 * - 失败时返回 isFallback=true，由前端用 mock-result.json 兜底
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { callLLM, LLMError } from "@/lib/llm";
import {
  ExtractResultSchema,
  ConflictResultSchema,
  type AnalysisResult,
} from "@/lib/schema";
import {
  EXTRACT_SYSTEM_PROMPT,
  buildExtractUserPrompt,
  CONFLICTS_SYSTEM_PROMPT,
  buildConflictsUserPrompt,
} from "@/lib/prompts";
import { checkRateLimit, getClientIP } from "@/lib/rate-limit";
import { preferencesToPromptHint, type UserPreferences } from "@/lib/preferences";

export const runtime = "nodejs";
// Vercel Hobby 上限为 300 秒；免费 LLM 两次调用总耗时可能 30~90s
export const maxDuration = 300;

const PreferencesSchema = z
  .object({
    budget: z.enum(["budget", "mid", "premium", "any"]).optional(),
    party_size: z
      .enum(["solo", "couple", "family", "group", "any"])
      .optional(),
    styles: z.array(z.string()).optional(),
  })
  .nullable()
  .optional();

const RequestSchema = z.object({
  notes: z
    .array(z.string().min(20, "每篇笔记至少 20 字").max(3500))
    .min(2, "最少 2 篇笔记")
    .max(8, "最多 8 篇笔记"),
  titles: z.array(z.string()).optional(),
  preferences: PreferencesSchema,
});

export async function POST(req: Request) {
  const ip = getClientIP(req);
  const rate = checkRateLimit(ip);
  if (!rate.ok) {
    return NextResponse.json(
      {
        error: "rate_limited",
        message: "你（或你所在网络）这一小时内请求次数过多，请稍后再试。",
        retry_after_ms: rate.resetAt - Date.now(),
      },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "bad_request", message: "请求体不是合法 JSON" },
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

  const { notes, titles } = parsed.data;
  const preferences = parsed.data.preferences as UserPreferences | null | undefined;
  const prefHint = preferences ? preferencesToPromptHint(preferences as UserPreferences) : "";

  try {
    // Step 1: 抽取 items (v2.0 拼接用户偏好)
    const extract = await callLLM({
      systemPrompt: EXTRACT_SYSTEM_PROMPT + prefHint,
      userPrompt: buildExtractUserPrompt(notes),
      schema: ExtractResultSchema,
      tag: "extract",
    });

    // Step 2: 冲突 + 排期
    const conflicts = await callLLM({
      systemPrompt: CONFLICTS_SYSTEM_PROMPT,
      userPrompt: buildConflictsUserPrompt(extract.destination, extract.items),
      schema: ConflictResultSchema,
      tag: "conflicts",
    });

    const result: AnalysisResult = {
      destination: extract.destination,
      trip_style: extract.trip_style ?? [],
      items: extract.items,
      conflicts: conflicts.conflicts ?? [],
      itinerary_suggestion: conflicts.itinerary_suggestion ?? [],
      source_titles: titles ?? [],
      generated_at: new Date().toISOString(),
      is_mock: false,
    };

    return NextResponse.json({
      ok: true,
      data: result,
      rate_remaining: rate.remaining,
    });
  } catch (e) {
    const err = e instanceof LLMError ? e : new LLMError(String(e), "network");
    console.error("[analyze] LLM failed:", err.stage, err.message);
    return NextResponse.json(
      {
        ok: false,
        error: "llm_failed",
        stage: err.stage,
        message:
          "AI 分析暂时不可用，TripPick 已自动为你切换到示例分析结果。",
        debug: err.message, // 临时：暴露真错误便于诊断，上线后可刪
        should_fallback: true,
      },
      { status: 200 } // 故意 200，让前端走 fallback 而不是报错
    );
  }
}
