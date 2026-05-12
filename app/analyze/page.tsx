"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useTripPickStore, getAcceptedItems } from "@/lib/store";
import type { AnalysisResult, POIItem, POIType } from "@/lib/schema";
import { POICard } from "@/components/POICard";
import { ConflictBanner } from "@/components/ConflictBanner";
import { useRealtimeSync } from "@/lib/use-realtime-sync";

const TYPE_ORDER: POIType[] = ["景点", "餐厅", "住宿", "交通", "其他"];

const TYPE_META: Record<POIType, { label: string; icon: string }> = {
  景点: { label: "景点", icon: "🏛️" },
  餐厅: { label: "餐厅", icon: "🍜" },
  住宿: { label: "住宿", icon: "🏨" },
  交通: { label: "交通", icon: "🚇" },
  其他: { label: "其他 / 避雷", icon: "💡" },
};

export default function AnalyzePage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <AnalyzeInner />
    </Suspense>
  );
}

function LoadingScreen() {
  return (
    <main className="grid min-h-screen place-items-center">
      <div className="flex items-center gap-3 text-ink-700">
        <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-brand-500/30 border-t-brand-500" />
        加载中…
      </div>
    </main>
  );
}

function AnalyzeInner() {
  const router = useRouter();
  const search = useSearchParams();
  const isDemo = search.get("demo") === "1";
  const isFallback = search.get("fallback") === "1";

  const analysis = useTripPickStore((s) => s.analysis);
  const setAnalysis = useTripPickStore((s) => s.setAnalysis);
  const decisions = useTripPickStore((s) => s.decisions);

  const [loadingDemo, setLoadingDemo] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [enrichedItems, setEnrichedItems] = useState<POIItem[]>([]);
  // v2.0: 默认不启用多人同步。仅当 URL 中明确是分享链接进来时启用。
  const fromShare = search.get("from") === "share";
  const { peerCount } = useRealtimeSync(!!analysis && fromShare);

  // v2.0: POI 数量偶少时异步调用 enrich 接口补充
  useEffect(() => {
    if (
      !analysis ||
      analysis.is_mock ||
      analysis.items.length >= 6 ||
      enrichedItems.length > 0 ||
      enriching
    )
      return;
    setEnriching(true);
    const existing = analysis.items.map((i) => i.name);
    fetch("/api/enrich", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        destination: analysis.destination,
        existing_names: existing,
        trip_style: analysis.trip_style,
      }),
    })
      .then((r) => r.json())
      .then((data: { ok?: boolean; items?: POIItem[] }) => {
        if (data.ok && data.items && data.items.length > 0) {
          setEnrichedItems(data.items);
        }
      })
      .catch(() => {
        /* 静默失败 */
      })
      .finally(() => setEnriching(false));
  }, [analysis, enrichedItems.length, enriching]);

  // 如果没数据但是 ?demo=1，自动加载 mock
  useEffect(() => {
    if (!analysis && isDemo) {
      setLoadingDemo(true);
      fetch("/mock-result.json")
        .then((r) => r.json())
        .then((m: AnalysisResult) => {
          setAnalysis({ ...m, is_mock: true });
        })
        .finally(() => setLoadingDemo(false));
    }
  }, [analysis, isDemo, setAnalysis]);

  // 合并原始 items + AI 补充的
  const allItems = useMemo<POIItem[]>(() => {
    if (!analysis) return [];
    return [...analysis.items, ...enrichedItems];
  }, [analysis, enrichedItems]);

  const grouped = useMemo(() => {
    if (!analysis) return null;
    const g = new Map<POIType, POIItem[]>();
    for (const it of allItems) {
      const arr = g.get(it.type) ?? [];
      arr.push(it);
      g.set(it.type, arr);
    }
    for (const [, arr] of g) {
      arr.sort((a, b) => b.confidence_score - a.confidence_score);
    }
    return g;
  }, [analysis, allItems]);

  const conflictItems = useMemo(() => {
    if (!analysis) return new Set<string>();
    const s = new Set<string>();
    for (const c of analysis.conflicts) {
      for (const n of c.items) s.add(n);
    }
    return s;
  }, [analysis]);

  const acceptedCount = useMemo(
    () => getAcceptedItems(decisions).length,
    [decisions]
  );

  if (loadingDemo || (!analysis && isDemo)) {
    return (
      <main className="grid min-h-screen place-items-center">
        <div className="flex items-center gap-3 text-ink-700">
          <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-brand-500/30 border-t-brand-500" />
          正在加载示例分析…
        </div>
      </main>
    );
  }

  if (!analysis) {
    return (
      <main className="mx-auto min-h-screen max-w-2xl px-6 py-16 text-center">
        <h1 className="text-2xl font-bold">还没有分析数据</h1>
        <p className="mt-2 text-ink-700">先去输入页粘贴几篇攻略，或一键用示例数据。</p>
        <div className="mt-6 flex justify-center gap-3">
          <Link
            href="/input"
            className="rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-600"
          >
            去输入页
          </Link>
          <Link
            href="/analyze?demo=1"
            className="rounded-xl bg-accent-500 px-5 py-2.5 text-sm font-semibold text-ink-900 hover:bg-accent-600"
          >
            用示例数据
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="relative mx-auto min-h-screen max-w-6xl px-6 py-8 pb-32">
      {/* 顶栏 */}
      <div className="flex items-center justify-between text-sm">
        <Link href="/" className="text-ink-500 hover:text-ink-900">
          ← 首页
        </Link>
        <div className="flex items-center gap-2">
          {(analysis.is_mock || isFallback) && (
            <span className="rounded-full bg-accent-50 px-2.5 py-1 text-xs font-medium text-accent-600 ring-1 ring-accent-500/30">
              {isFallback ? "API 暂不可用，已切换示例" : "示例数据"}
            </span>
          )}
          <Link
            href="/input"
            className="rounded-lg bg-white px-3 py-1.5 text-xs ring-1 ring-ink-100 hover:bg-ink-100"
          >
            ↻ 重新输入
          </Link>
        </div>
      </div>

      {/* 标题区 */}
      <header className="mt-6">
        <div className="flex flex-wrap items-end gap-3">
          <h1 className="text-3xl font-bold tracking-tight">
            <span className="text-brand-500">{analysis.destination}</span> · 候选 {allItems.length} 项
          </h1>
          {enriching && (
            <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-3 py-1 text-xs text-purple-700 ring-1 ring-purple-200">
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-purple-300 border-t-purple-600" />
              AI 正在为你补充热门推荐
            </span>
          )}
          {!enriching && enrichedItems.length > 0 && (
            <span className="rounded-full bg-purple-50 px-3 py-1 text-xs text-purple-700 ring-1 ring-purple-200">
              ✨ 含 {enrichedItems.length} 个 AI 补充
            </span>
          )}
          {peerCount > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 text-xs font-semibold text-green-700 ring-1 ring-green-200">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
              </span>
              同行人 {peerCount} 人在线
            </span>
          )}
        </div>
        {analysis.trip_style.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {analysis.trip_style.map((t) => (
              <span
                key={t}
                className="rounded-full bg-white px-3 py-1 text-xs font-medium text-ink-700 ring-1 ring-ink-100"
              >
                #{t}
              </span>
            ))}
          </div>
        )}
      </header>

      {/* v2.2 P1: 决策板顶部 Summary 卡 — 先给结果再给细节 */}
      {!isFallback && (
        <section className="mt-6 rounded-2xl bg-white p-4 ring-1 ring-ink-100 sm:p-5">
          <div className="flex items-start gap-3">
            <span className="text-2xl" aria-hidden>📋</span>
            <div className="flex-1 text-sm leading-relaxed text-ink-700">
              <p>
                共整理出 <span className="font-bold text-brand-500">{allItems.length}</span> 个候选地点
                {(() => {
                  const high = allItems.filter((it) => it.confidence_score >= 70).length;
                  return high > 0 ? <>，其中 <span className="font-bold text-brand-500">{high}</span> 个被多次推荐</> : null;
                })()}
                {analysis.conflicts.length > 0 && (
                  <>，发现 <span className="font-bold text-accent-600">{analysis.conflicts.length}</span> 处需要注意的地方</>
                )}
                。
              </p>
              <p className="mt-1.5 text-xs text-ink-500">
                点 ✅ 把想去的加进行程，点 ❌ 跳过；推荐度低的已自动折叠。
              </p>
            </div>
          </div>
        </section>
      )}

      {/* v2.0 修复: Fallback 显眼警告 — 用户必须知道这不是真的 AI 分析 */}
      {isFallback && (
        <section className="mt-6 rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <span className="text-2xl" aria-hidden>⚠️</span>
            <div className="flex-1">
              <h3 className="text-base font-bold text-amber-900">
                AI 没能成功分析你的笔记
              </h3>
              <p className="mt-1 text-sm text-amber-800">
                下面展示的是<span className="font-semibold">演示样本数据</span>，不是基于你刚才粘贴的内容生成的。可能原因：AI 调用超时、配额暂时不可用、或网络波动。
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href="/input"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-700"
                >
                  ↻ 回到输入页重试
                </Link>
                <span className="text-xs text-amber-700 self-center">
                  （或继续浏览下方示例，体验完整功能）
                </span>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* 冲突 Banner */}
      <section className="mt-6">
        <ConflictBanner conflicts={analysis.conflicts} />
      </section>

      {/* 推荐地点分组卡片：推荐度 <70 的默认收起 */}
      <section className="mt-8 space-y-8">
        {TYPE_ORDER.map((t) => {
          const arr = grouped?.get(t);
          if (!arr || arr.length === 0) return null;
          const meta = TYPE_META[t];
          return (
            <POIGroupSection
              key={t}
              type={t}
              icon={meta.icon}
              label={meta.label}
              items={arr}
              conflictItems={conflictItems}
            />
          );
        })}
      </section>

      {/* 浮动行动条 */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-ink-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:gap-4 sm:px-6 sm:py-4">
          <div className="min-w-0 flex-1 text-sm">
            已选 <span className="text-lg font-bold text-brand-500">{acceptedCount}</span> 项
            {acceptedCount === 0 && (
              <span className="ml-2 hidden text-xs text-ink-500 sm:inline">点 ✅ 把想去的地方加进行程</span>
            )}
          </div>
          <button
            onClick={() => router.push("/itinerary")}
            disabled={acceptedCount === 0}
            className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-500/30 transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50 sm:px-6 sm:py-3"
          >
            生成行程 <span aria-hidden>→</span>
          </button>
        </div>
      </div>
    </main>
  );
}

// 一个分组区域：推荐度≥0 默认展示，<70 默认收起
const LOW_THRESHOLD = 70;

function POIGroupSection({
  type: _type,
  icon,
  label,
  items,
  conflictItems,
}: {
  type: POIType;
  icon: string;
  label: string;
  items: POIItem[];
  conflictItems: Set<string>;
}) {
  const [showLow, setShowLow] = useState(false);
  const highItems = items.filter((it) => it.confidence_score >= LOW_THRESHOLD);
  const lowItems = items.filter((it) => it.confidence_score < LOW_THRESHOLD);
  // 如果所有地点都是低推荐度，首屏至少要有东西：那就默认全展
  const allLow = highItems.length === 0 && lowItems.length > 0;
  const visibleItems = allLow || showLow ? items : highItems;
  const hiddenCount = allLow ? 0 : lowItems.length;

  return (
    <div>
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <span>{icon}</span>
        <span>{label}</span>
        <span className="text-sm font-normal text-ink-500">
          · {items.length} 个
        </span>
      </h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visibleItems.map((it) => (
          <POICard
            key={it.name}
            item={it}
            hasConflict={conflictItems.has(it.name)}
          />
        ))}
      </div>
      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setShowLow((v) => !v)}
          className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-xs text-ink-700 ring-1 ring-ink-200 transition hover:ring-brand-300 hover:text-brand-600"
        >
          {showLow
            ? `收起低热度备选 ↑`
            : `显示其他 ${hiddenCount} 个低热度备选 ↓`}
        </button>
      )}
    </div>
  );
}
