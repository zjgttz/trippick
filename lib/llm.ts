/**
 * LLM 调用封装
 * 支持两个后端，按以下优先级自动选择：
 *   1. GEMINI_API_KEY -> 原生 Google Gemini API（快、免费额度大）
 *   2. OPENROUTER_API_KEY -> OpenRouter（备用，可调多家模型）
 *
 * 公共特性：
 * - 强制 JSON 输出
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
const OPENROUTER_DEFAULT_MODEL = "google/gemini-2.5-pro";
const GEMINI_DEFAULT_MODEL = "gemini-2.5-flash";
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

/** 调用原生 Google Gemini API（generateContent 接口） */
async function callGemini(
  systemPrompt: string,
  userPrompt: string,
  temperature: number
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY!;
  const model = process.env.GEMINI_MODEL || GEMINI_DEFAULT_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: {
        temperature,
        responseMimeType: "application/json",
        // 关闭 thinking 提速 50%+（POI 抽取/冒突判断不需要推理）
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new LLMError(
      `Gemini HTTP ${res.status}: ${text.slice(0, 300)}`,
      "network"
    );
  }

  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new LLMError("Gemini 返回空内容", "empty");
  return text;
}

/** 调用 OpenRouter（OpenAI 兼容接口） */
async function callOpenRouter(
  systemPrompt: string,
  userPrompt: string,
  temperature: number
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY!;
  const model = process.env.OPENROUTER_MODEL || OPENROUTER_DEFAULT_MODEL;

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
      temperature,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new LLMError(
      `OpenRouter HTTP ${res.status}: ${text.slice(0, 300)}`,
      "network"
    );
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = data?.choices?.[0]?.message?.content;
  if (!raw) throw new LLMError("OpenRouter 返回空内容", "empty");
  return raw;
}

export async function callLLM<S extends ZodType>(
  options: CallOptions<S>
): Promise<z.output<S>> {
  const hasGemini = !!process.env.GEMINI_API_KEY;
  const hasOpenRouter = !!process.env.OPENROUTER_API_KEY;

  if (!hasGemini && !hasOpenRouter) {
    throw new LLMError(
      "未配置 LLM Key（需要 GEMINI_API_KEY 或 OPENROUTER_API_KEY）",
      "network"
    );
  }

  const temperature = options.temperature ?? 0.2;
  let lastErr: unknown = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      // 优先用 Gemini，限流/失败时下一次重试自动切到 OpenRouter
      const useGemini = hasGemini && (attempt === 1 || !hasOpenRouter);
      const raw = useGemini
        ? await callGemini(options.systemPrompt, options.userPrompt, temperature)
        : await callOpenRouter(
            options.systemPrompt,
            options.userPrompt,
            temperature
          );

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
      console.error(
        `[llm:${options.tag || "?"}] attempt ${attempt} failed:`,
        (e as Error).message?.slice(0, 200)
      );
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 600 * attempt));
        continue;
      }
    }
  }

  throw lastErr instanceof LLMError
    ? lastErr
    : new LLMError("LLM 调用全部重试失败", "network", lastErr);
}
