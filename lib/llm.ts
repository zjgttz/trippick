/**
 * OpenRouter LLM 调用封装
 * - JSON mode 强制
 * - 最多 3 次重试
 * - 自动剥离 markdown 包裹
 * - 失败抛出 LLMError 供上层兜底
 */

import { z, ZodType } from "zod";

export class LLMError extends Error {
  constructor(
    message: string,
    public stage: "network" | "parse" | "validate" | "empty",
    public cause?: unknown
  ) {
    super(message);
    this.name = "LLMError";
  }
}

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "google/gemini-2.5-pro";
const MAX_RETRIES = 3;

interface CallOptions<S extends ZodType> {
  systemPrompt: string;
  userPrompt: string;
  schema: S;
  temperature?: number;
  /** 标签，用于日志 */
  tag?: string;
}

/** 剥离 LLM 偶尔加上的 markdown ```json 包裹 */
function stripFences(s: string): string {
  let t = s.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  }
  // 截取从第一个 { 到最后一个 } 的内容，防止前后有解释文字
  const first = t.indexOf("{");
  const last = t.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) {
    t = t.slice(first, last + 1);
  }
  return t.trim();
}

export async function callLLM<S extends ZodType>(
  options: CallOptions<S>
): Promise<z.output<S>> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new LLMError("OPENROUTER_API_KEY 未配置", "network");
  }
  const model = process.env.OPENROUTER_MODEL || DEFAULT_MODEL;

  let lastErr: unknown = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "HTTP-Referer":
            process.env.OPENROUTER_SITE_URL || "https://trippick.vercel.app",
          "X-Title": process.env.OPENROUTER_SITE_NAME || "TripPick",
        },
        body: JSON.stringify({
          model,
          temperature: options.temperature ?? 0.2,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: options.systemPrompt },
            { role: "user", content: options.userPrompt },
          ],
        }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new LLMError(
          `OpenRouter HTTP ${res.status}: ${text.slice(0, 200)}`,
          "network"
        );
      }

      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const raw = data?.choices?.[0]?.message?.content;
      if (!raw) {
        throw new LLMError("LLM 返回空内容", "empty");
      }

      const cleaned = stripFences(raw);
      let parsed: unknown;
      try {
        parsed = JSON.parse(cleaned);
      } catch (e) {
        throw new LLMError(
          `JSON 解析失败 (attempt ${attempt}): ${(e as Error).message}`,
          "parse",
          e
        );
      }

      const validated = options.schema.safeParse(parsed);
      if (!validated.success) {
        throw new LLMError(
          `Schema 校验失败 (attempt ${attempt}): ${validated.error.message.slice(0, 300)}`,
          "validate",
          validated.error
        );
      }

      return validated.data as z.output<S>;
    } catch (e) {
      lastErr = e;
      if (attempt < MAX_RETRIES) {
        // 简单线性 backoff
        await new Promise((r) => setTimeout(r, 600 * attempt));
        continue;
      }
    }
  }

  throw lastErr instanceof LLMError
    ? lastErr
    : new LLMError("LLM 调用全部重试失败", "network", lastErr);
}
