"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { SAMPLE_NOTES } from "@/lib/sample-notes";
import { useTripPickStore } from "@/lib/store";
import type { AnalysisResult } from "@/lib/schema";
import { PreferencePanel } from "@/components/PreferencePanel";
import type { UserPreferences } from "@/lib/preferences";
import { parseXhsShare, looksLikeXhsShare } from "@/lib/parse-xhs-share";

const MIN_LEN = 20;
const MAX_LEN = 3500;
const PLACEHOLDER =
  "把一篇你收藏的小红书攻略正文粘在这里。\n例：「第一天上午先到法喜寺，氛围超棒…」";

export default function InputPage() {
  const router = useRouter();
  const setAnalysis = useTripPickStore((s) => s.setAnalysis);

  const [notes, setNotes] = useState<string[]>(["", "", ""]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  // v2.0 M3：每个输入框单独的「检测到小红书分享文案」提示
  const [parseHints, setParseHints] = useState<(string | null)[]>([null, null, null]);

  const filled = notes.filter((n) => n.trim().length >= MIN_LEN).length;
  const tooLong = notes.some((n) => n.length > MAX_LEN);
  const canSubmit = filled >= 2 && !tooLong && !loading;

  function updateNote(i: number, v: string) {
    setNotes((prev) => prev.map((n, idx) => (idx === i ? v : n)));
    // 检测分享文案
    if (looksLikeXhsShare(v)) {
      const r = parseXhsShare(v);
      if (r && r.cleaned !== v.trim()) {
        setParseHints((prev) =>
          prev.map((h, idx) =>
            idx === i
              ? `检测到小红书分享文案${r.shortLink ? "（含链接）" : ""}，可一键清洗为正文`
              : h,
          ),
        );
        return;
      }
    }
    setParseHints((prev) => prev.map((h, idx) => (idx === i ? null : h)));
  }

  function applyParse(i: number) {
    const r = parseXhsShare(notes[i]);
    if (!r) return;
    setNotes((prev) => prev.map((n, idx) => (idx === i ? r.cleaned : n)));
    setParseHints((prev) => prev.map((h, idx) => (idx === i ? null : h)));
  }

  function addNote() {
    if (notes.length < 8) {
      setNotes((prev) => [...prev, ""]);
      setParseHints((prev) => [...prev, null]);
    }
  }

  function removeNote(i: number) {
    if (notes.length <= 2) return;
    setNotes((prev) => prev.filter((_, idx) => idx !== i));
    setParseHints((prev) => prev.filter((_, idx) => idx !== i));
  }

  function fillSample() {
    setNotes(SAMPLE_NOTES.map((n) => n.content));
  }

  async function submit() {
    setError(null);
    const cleaned = notes
      .map((n) => n.trim())
      .filter((n) => n.length >= MIN_LEN);
    if (cleaned.length < 2) {
      setError("请至少填写 2 篇笔记，每篇不少于 20 字");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: cleaned, preferences }),
      });

      const body = await res.json();

      // 速率限制
      if (res.status === 429) {
        setError(body.message || "请求过于频繁，请稍后再试");
        setLoading(false);
        return;
      }
      // 校验失败
      if (res.status === 400) {
        setError(body.message || "参数有误");
        setLoading(false);
        return;
      }

      if (body.ok && body.data) {
        setAnalysis(body.data as AnalysisResult);
        router.push("/analyze");
        return;
      }

      // LLM 失败 → 走 mock fallback
      if (body.should_fallback) {
        const mockRes = await fetch("/mock-result.json");
        const mock = (await mockRes.json()) as AnalysisResult;
        setAnalysis({ ...mock, is_mock: true });
        router.push("/analyze?fallback=1");
        return;
      }

      setError("AI 分析失败，请稍后重试");
    } catch (e) {
      // 网络异常也走 fallback
      try {
        const mockRes = await fetch("/mock-result.json");
        const mock = (await mockRes.json()) as AnalysisResult;
        setAnalysis({ ...mock, is_mock: true });
        router.push("/analyze?fallback=1");
      } catch {
        setError("网络异常，请检查后重试");
      }
    } finally {
      setLoading(false);
    }
  }

  async function tryDemo() {
    setLoading(true);
    try {
      const mockRes = await fetch("/mock-result.json");
      const mock = (await mockRes.json()) as AnalysisResult;
      setAnalysis({ ...mock, is_mock: true });
      router.push("/analyze?demo=1");
    } catch {
      setError("示例数据加载失败");
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-10">
      {/* 顶栏 */}
      <div className="flex items-center justify-between">
        <Link href="/" className="text-sm text-ink-500 hover:text-ink-900">
          ← 返回首页
        </Link>
        <button
          onClick={tryDemo}
          disabled={loading}
          className="rounded-lg bg-accent-500 px-3 py-1.5 text-xs font-semibold text-ink-900 ring-1 ring-accent-600/30 transition hover:bg-accent-600 disabled:opacity-60"
        >
          ✨ 用示例数据
        </button>
      </div>

      <h1 className="mt-6 text-3xl font-bold tracking-tight">
        粘贴你收藏的小红书攻略
      </h1>
      <p className="mt-2 text-ink-700">
        3–5 篇即可，TripPick 会自动提取关键信息，帮你做决定。
      </p>
      <p className="mt-1 text-xs text-ink-500">
        💡 从小红书 APP「分享 → 复制链接」得到的整段文案可以直接粘贴，系统会自动识别并清洗。
      </p>

      {/* v2.0 新增：偏好面板 */}
      <div className="mt-6">
        <PreferencePanel onChange={setPreferences} />
      </div>

      {/* 示例 banner */}
      <div className="mt-6 rounded-2xl bg-accent-50 p-4 ring-1 ring-accent-500/30">
        <div className="flex items-start gap-3 text-sm text-ink-900">
          <span>💡</span>
          <div className="flex-1">
            没有现成数据？
            <button
              onClick={fillSample}
              className="ml-1 font-semibold text-brand-600 underline-offset-2 hover:underline"
            >
              一键填充 5 篇杭州示例攻略 →
            </button>
            <span className="ml-1 text-xs text-ink-500">
              （会真正调用 AI 分析，让你体验完整链路）
            </span>
          </div>
        </div>
      </div>

      {/* 输入区 */}
      <div className="mt-6 space-y-4">
        {notes.map((n, i) => {
          const overflow = n.length > MAX_LEN;
          const ok = n.trim().length >= MIN_LEN;
          return (
            <div
              key={i}
              className={`relative rounded-2xl bg-white p-4 ring-1 transition ${
                overflow
                  ? "ring-red-300"
                  : ok
                    ? "ring-brand-200"
                    : "ring-ink-100"
              }`}
            >
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-ink-700">
                  笔记 {i + 1}
                  {ok && <span className="ml-2 text-brand-500">✓</span>}
                </span>
                <div className="flex items-center gap-3 text-ink-500">
                  <span className={overflow ? "text-red-500" : ""}>
                    {n.length} / {MAX_LEN}
                  </span>
                  {notes.length > 2 && (
                    <button
                      onClick={() => removeNote(i)}
                      className="text-ink-500 hover:text-red-500"
                      aria-label="删除"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
              <textarea
                value={n}
                onChange={(e) => updateNote(i, e.target.value)}
                placeholder={PLACEHOLDER}
                rows={6}
                className="mt-2 w-full resize-y rounded-lg bg-ink-100/60 px-3 py-2 text-sm text-ink-900 placeholder:text-ink-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-200"
              />
              {parseHints[i] && (
                <div className="mt-2 flex items-center justify-between rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-600 ring-1 ring-brand-200">
                  <span>📋 {parseHints[i]}</span>
                  <button
                    onClick={() => applyParse(i)}
                    className="rounded-md bg-brand-500 px-2 py-1 font-semibold text-white transition hover:bg-brand-600"
                  >
                    一键清洗
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {notes.length < 8 && (
          <button
            onClick={addNote}
            className="w-full rounded-2xl border-2 border-dashed border-ink-300 py-3 text-sm text-ink-500 transition hover:border-brand-200 hover:text-brand-500"
          >
            ＋ 继续添加（最多 8 篇）
          </button>
        )}
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 ring-1 ring-red-100">
          {error}
        </div>
      )}

      {/* 底部 CTA */}
      <div className="mt-8 flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1 text-xs text-ink-500">
          已填写 <span className="font-semibold text-ink-900">{filled}</span> 篇
          <span className="hidden sm:inline"> · 最少 2 篇可分析</span>
        </div>
        <button
          onClick={submit}
          disabled={!canSubmit}
          className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-500/30 transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50 sm:px-6 sm:py-3 sm:text-base"
        >
          {loading ? (
            <>
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              分析中…
            </>
          ) : (
            <>
              开始分析 <span aria-hidden>→</span>
            </>
          )}
        </button>
      </div>
    </main>
  );
}
