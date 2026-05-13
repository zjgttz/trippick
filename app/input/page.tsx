"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ArrowLeft,
  Sparkles,
  Lightbulb,
  Check,
  X,
  FileText,
  Link2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { SAMPLE_NOTES } from "@/lib/sample-notes";
import { useTripPickStore } from "@/lib/store";
import type { AnalysisResult } from "@/lib/schema";
import { PreferencePanel } from "@/components/PreferencePanel";
import {
  savePreferences,
  type UserPreferences,
} from "@/lib/preferences";
import { parseXhsShare, looksLikeXhsShare } from "@/lib/parse-xhs-share";
import AnalyzingOverlay from "@/components/AnalyzingOverlay";

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
  // 示例偏好填充后用 key 强制 PreferencePanel 重 mount（重新 loadPreferences）
  const [prefPanelKey, setPrefPanelKey] = useState(0);
  // v2.0 M3：每个输入框单独的「检测到小红书分享文案」提示
  const [parseHints, setParseHints] = useState<(string | null)[]>([null, null, null]);
  // v2.0 修复：每个输入框独立的「试试自动抓取」状态
  const [fetchingIdx, setFetchingIdx] = useState<number | null>(null);
  const [fetchHints, setFetchHints] = useState<(string | null)[]>([null, null, null]);

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

  // v2.0 修复：试试后端自动抓小红书正文
  async function tryFetchXhs(i: number) {
    const text = notes[i];
    if (!text) return;
    setFetchingIdx(i);
    setFetchHints((prev) => prev.map((h, idx) => (idx === i ? null : h)));
    try {
      const res = await fetch("/api/fetch-xhs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: text }),
      });
      const data = await res.json();
      if (data.ok && data.body) {
        const combined = data.title
          ? `${data.title}\n${data.body}`
          : data.body;
        setNotes((prev) =>
          prev.map((n, idx) => (idx === i ? combined : n)),
        );
        setParseHints((prev) => prev.map((h, idx) => (idx === i ? null : h)));
        setFetchHints((prev) =>
          prev.map((h, idx) => (idx === i ? "✅ 成功抓取正文" : h)),
        );
      } else {
        let msg = data.message || "抓取失败";
        if (data.reason === "blocked") {
          msg =
            "小红书拦截了抓取（反爬触发）。请在小红书 APP 里打开帖子 → 长按文字 → 复制 → 粘到这里。";
        } else if (data.reason === "no_content") {
          msg =
            "这篇帖子看起来是图片/视频为主，文字很少。请手动复制 APP 里的文字到输入框。";
        } else if (data.reason === "timeout") {
          msg = "抓取超时，请重试，或手动复制正文。";
        }
        setFetchHints((prev) =>
          prev.map((h, idx) => (idx === i ? `⚠️ ${msg}` : h)),
        );
      }
    } catch (e) {
      setFetchHints((prev) =>
        prev.map((h, idx) =>
          idx === i
            ? `⚠️ 网络异常：${e instanceof Error ? e.message : String(e)}`
            : h,
        ),
      );
    } finally {
      setFetchingIdx(null);
    }
  }

  function addNote() {
    if (notes.length < 8) {
      setNotes((prev) => [...prev, ""]);
      setParseHints((prev) => [...prev, null]);
      setFetchHints((prev) => [...prev, null]);
    }
  }

  function removeNote(i: number) {
    if (notes.length <= 2) return;
    setNotes((prev) => prev.filter((_, idx) => idx !== i));
    setParseHints((prev) => prev.filter((_, idx) => idx !== i));
    setFetchHints((prev) => prev.filter((_, idx) => idx !== i));
  }

  function fillSample() {
    // 1. 填示例笔记
    setNotes(SAMPLE_NOTES.map((n) => n.content));
    // 2. 同时填示例偏好（杭州 2 日游 · 情侣 · 中等 · 美食/文化/自然）
    //    写入 localStorage 再用 key 强制 PreferencePanel 重 mount，让面板内的 chip 选中状态同步更新
    savePreferences({
      duration: "day2",
      budget: "mid",
      party_size: "couple",
      styles: ["美食", "文化", "自然"],
    });
    setPrefPanelKey((k) => k + 1);
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

      // 先拿文本，再尝试 JSON。这样 Vercel Edge 返回纯文本错误页时不会炸出 Unexpected token。
      const rawText = await res.text();
      let body: any = null;
      try {
        body = rawText ? JSON.parse(rawText) : null;
      } catch {
        // 服务端返了非 JSON（常见于 504 函数超时、Vercel Edge 拦截、Cold-start 抛错）
        if (res.status === 504 || /timeout/i.test(rawText)) {
          setError("AI 分析超时了（超过 60 秒），请减少笔记数量后重试。");
        } else if (res.status >= 500) {
          setError(`服务临时不可用（HTTP ${res.status}），请稍候重试。如果刚刚连续点过多次，等 1-2 分钟再试。`);
        } else {
          setError(`请求异常（HTTP ${res.status}），请重试。`);
        }
        setLoading(false);
        return;
      }

      // 速率限制
      if (res.status === 429) {
        setError(body?.message || "请求过于频繁，请稍后再试");
        setLoading(false);
        return;
      }
      // 校验失败
      if (res.status === 400) {
        setError(body?.message || "参数有误");
        setLoading(false);
        return;
      }

      if (body?.ok && body?.data) {
        setAnalysis(body.data as AnalysisResult);
        router.push("/analyze");
        return;
      }

      // LLM 失败 → 走 mock fallback
      if (body?.should_fallback) {
        const mockRes = await fetch("/mock-result.json");
        const mock = (await mockRes.json()) as AnalysisResult;
        setAnalysis({ ...mock, is_mock: true });
        router.push("/analyze?fallback=1");
        return;
      }

      setError("AI 分析失败，请稍后重试");
    } catch (e) {
      // v2.0 修复：网络异常直接报错，不静默填示例数据让用户误以为是 AI 结果
      setError(
        e instanceof Error
          ? `网络异常：${e.message}。请检查网络后重试。`
          : "网络异常，请检查后重试",
      );
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
      <AnalyzingOverlay show={loading} />
      {/* 顶栏 */}
      <div className="flex items-center justify-between">
        <Link href="/" className="inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-900">
          <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
          返回首页
        </Link>
        <button
          onClick={tryDemo}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-ink-700 ring-1 ring-ink-200 transition hover:ring-ink-300 disabled:opacity-60"
        >
          <Sparkles className="h-3.5 w-3.5 text-ink-500" strokeWidth={1.75} />
          用示例数据
        </button>
      </div>

      <h1 className="mt-6 text-3xl font-bold tracking-tight">
        粘贴你收藏的小红书攻略
      </h1>
      <p className="mt-2 text-ink-700">
        3–5 篇即可，TripPick 会自动提取关键信息，帮你做决定。
      </p>
      <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-ink-500">
        <Lightbulb className="h-3.5 w-3.5 text-ink-400" strokeWidth={1.75} />
        从小红书 APP「分享 → 复制链接」得到的整段文案可以直接粘贴，系统会自动识别并清洗。
      </p>

      {/* v2.0 新增：偏好面板 */}
      <div className="mt-6">
        <PreferencePanel key={prefPanelKey} onChange={setPreferences} />
      </div>

      {/* 示例 banner —— 实心按钮 + 醒目说明 */}
      <div className="mt-6 rounded-2xl bg-white p-4 ring-1 ring-ink-100">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2.5 text-sm text-ink-900">
            <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-ink-500" strokeWidth={1.75} />
            <div>
              <div className="font-semibold">没有现成数据？</div>
              <div className="text-xs text-ink-600">
                一键填充 5 篇杭州攻略 + 示例偏好（2 日游 · 情侣 · 中等预算），体验完整链路
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={fillSample}
            className="btn-press inline-flex shrink-0 items-center gap-1.5 cursor-pointer rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-white shadow-sm ring-1 ring-brand-600 hover:bg-brand-600"
          >
            <Sparkles className="h-4 w-4" strokeWidth={1.75} />
            一键填充示例
          </button>
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
                <span className="inline-flex items-center gap-1 font-semibold text-ink-700">
                  笔记 {i + 1}
                  {ok && <Check className="ml-1 h-3.5 w-3.5 text-brand-500" strokeWidth={2.25} />}
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
                      <X className="h-4 w-4" strokeWidth={1.75} />
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
                <div className="mt-2 flex flex-col gap-2 rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-600 ring-1 ring-brand-200 sm:flex-row sm:items-center sm:justify-between">
                  <span className="min-w-0 inline-flex items-start gap-1.5 sm:flex-1 sm:items-center">
                    <FileText className="h-3.5 w-3.5 shrink-0 mt-0.5 sm:mt-0" strokeWidth={1.75} />
                    <span className="leading-relaxed">{parseHints[i]}</span>
                  </span>
                  <div className="flex shrink-0 gap-2">
                    <button
                      onClick={() => applyParse(i)}
                      className="btn-press flex-1 rounded-md bg-brand-500 px-2 py-1.5 font-semibold text-white hover:bg-brand-600 sm:flex-none sm:py-1"
                    >
                      清洗文案
                    </button>
                    <button
                      onClick={() => tryFetchXhs(i)}
                      disabled={fetchingIdx === i}
                      className="btn-press flex-1 inline-flex items-center justify-center gap-1 rounded-md bg-ink-900 px-2 py-1.5 font-semibold text-white hover:bg-ink-700 disabled:opacity-60 sm:flex-none sm:py-1"
                    >
                      <Link2 className="h-3 w-3" strokeWidth={2} />
                      {fetchingIdx === i ? "抓取中…" : "抓取笔记"}
                    </button>
                  </div>
                </div>
              )}
              {fetchHints[i] && (
                <div
                  className={`mt-2 rounded-lg px-3 py-2 text-xs ring-1 ${
                    fetchHints[i]?.startsWith("✅")
                      ? "bg-green-50 text-green-700 ring-green-200"
                      : "bg-amber-50 text-amber-800 ring-amber-200"
                  }`}
                >
                  {fetchHints[i]}
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
          className="btn-press inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-500/25 hover:bg-brand-600 hover:shadow-xl hover:shadow-brand-500/35 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:shadow-lg sm:px-6 sm:py-3 sm:text-base"
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
