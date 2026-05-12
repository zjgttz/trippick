/**
 * 临时诊断：单独测 Gemini / OpenRouter 一次最小调用的耗时与返回
 */
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

async function testGemini() {
  const t0 = Date.now();
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { provider: "gemini", error: "no_key" };
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: 'Reply with just: {"ok":true}' }] }],
        generationConfig: {
          responseMimeType: "application/json",
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    const text = await res.text();
    return {
      provider: "gemini",
      model,
      status: res.status,
      elapsed_ms: Date.now() - t0,
      body: text.slice(0, 500),
    };
  } catch (e) {
    clearTimeout(timer);
    return {
      provider: "gemini",
      elapsed_ms: Date.now() - t0,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

async function testOpenRouter() {
  const t0 = Date.now();
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return { provider: "openrouter", error: "no_key" };
  const model = process.env.OPENROUTER_MODEL || "google/gemini-2.5-pro";
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: 'Reply with just: {"ok":true}' }],
      }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    const text = await res.text();
    return {
      provider: "openrouter",
      model,
      status: res.status,
      elapsed_ms: Date.now() - t0,
      body: text.slice(0, 500),
    };
  } catch (e) {
    clearTimeout(timer);
    return {
      provider: "openrouter",
      elapsed_ms: Date.now() - t0,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function GET() {
  const gemini = await testGemini();
  const openrouter = await testOpenRouter();
  return NextResponse.json({
    env: {
      GEMINI_API_KEY: !!process.env.GEMINI_API_KEY,
      OPENROUTER_API_KEY: !!process.env.OPENROUTER_API_KEY,
      GEMINI_MODEL: process.env.GEMINI_MODEL || null,
      OPENROUTER_MODEL: process.env.OPENROUTER_MODEL || null,
    },
    gemini,
    openrouter,
  });
}
