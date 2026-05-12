"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  useTripPickStore,
  getAcceptedItems,
  type DecisionStatus,
} from "@/lib/store";
import { TIME_SLOT_LABEL, type ItineraryDay, type TimeSlot } from "@/lib/schema";
import { buildShareURL, readPartnerFromURL } from "@/lib/share";
import { TripMap, type MapPOI } from "@/components/TripMap";
import { useRealtimeSync } from "@/lib/use-realtime-sync";
import { buildTripURL } from "@/lib/realtime-sync";

const SLOTS: TimeSlot[] = ["morning", "afternoon", "evening"];

export default function ItineraryPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <ItineraryInner />
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

function ItineraryInner() {
  const search = useSearchParams();
  const fromShare = search.get("from") === "share";

  const analysis = useTripPickStore((s) => s.analysis);
  const decisions = useTripPickStore((s) => s.decisions);
  const setDecision = useTripPickStore((s) => s.setDecision);
  const partnerDecisions = useTripPickStore((s) => s.partnerDecisions);
  const setPartnerDecisions = useTripPickStore((s) => s.setPartnerDecisions);
  const setAnalysis = useTripPickStore((s) => s.setAnalysis);

  const [shareURL, setShareURL] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // v2.0 M5: 实时同步 hook
  const { tripId, peerCount, lastPeerUpdate } = useRealtimeSync(true);
  // v2.0 M4: tab 切换 + 地图坐标
  const [activeTab, setActiveTab] = useState<"timeline" | "map">("timeline");
  const [coords, setCoords] = useState<Record<string, { lat: number; lng: number } | null>>({});
  const [geocodeStatus, setGeocodeStatus] = useState<"idle" | "loading" | "done" | "error">("idle");

  // 协同：如果有 ?s=... 参数，把它当作"伙伴的选择"读入
  useEffect(() => {
    const partner = readPartnerFromURL();
    if (partner) setPartnerDecisions(partner);

    // 如果是分享链接打开且本地没数据，自动加载 mock 让 demo 可见
    if (fromShare && !analysis) {
      fetch("/mock-result.json")
        .then((r) => r.json())
        .then((m) => setAnalysis({ ...m, is_mock: true }));
    }
  }, [fromShare, analysis, setPartnerDecisions, setAnalysis]);

  const accepted = useMemo(() => getAcceptedItems(decisions), [decisions]);
  const acceptedSet = useMemo(() => new Set(accepted), [accepted]);

  // 首次切到「地图」时才拉坐标，节省流量和时间
  useEffect(() => {
    if (activeTab !== "map") return;
    if (!analysis || accepted.length === 0) return;
    if (geocodeStatus !== "idle") return;
    setGeocodeStatus("loading");
    fetch("/api/geocode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: accepted, city: analysis.destination }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.ok && d.coords) {
          setCoords(d.coords);
          setGeocodeStatus("done");
        } else {
          setGeocodeStatus("error");
        }
      })
      .catch(() => setGeocodeStatus("error"));
  }, [activeTab, analysis, accepted, geocodeStatus]);

  // mapPOIs 依赖 finalItinerary 拿 day/order，定义移到 finalItinerary 之后

  // 基于已选项构建最终行程：以 AI 推荐排期为基础，剔除未选项
  const finalItinerary: ItineraryDay[] = useMemo(() => {
    if (!analysis) return [];
    const days = analysis.itinerary_suggestion
      .map((d) => ({
        day: d.day,
        slots: d.slots.map((sl) => ({
          time_slot: sl.time_slot,
          items: sl.items.filter((n) => acceptedSet.has(n)),
          note: sl.note,
        })),
      }))
      // 收集已经被排进 itinerary 的 name
      .filter((d) => d.slots.some((s) => s.items.length > 0));

    // 还有 accepted 但未被 AI 排到的，按建议时段补到 Day1
    const planned = new Set<string>();
    for (const d of days) for (const sl of d.slots) for (const n of sl.items) planned.add(n);
    const leftover = accepted.filter((n) => !planned.has(n));

    if (leftover.length > 0) {
      // 找到第一天，把 leftover 按建议时间塞进去
      const day1 =
        days.find((d) => d.day === 1) ??
        (days.push({ day: 1, slots: SLOTS.map((s) => ({ time_slot: s, items: [], note: "" })) }),
        days[days.length - 1]);

      for (const name of leftover) {
        const it = analysis.items.find((i) => i.name === name);
        let target: TimeSlot = "afternoon";
        const t = (it?.suggested_time || "").toLowerCase();
        if (t.includes("早") || t.includes("上午") || t.includes("morning")) target = "morning";
        else if (t.includes("傍晚") || t.includes("晚") || t.includes("夜")) target = "evening";
        const slot = day1.slots.find((s) => s.time_slot === target);
        if (slot) slot.items.push(name);
      }
    }

    return days;
  }, [analysis, accepted, acceptedSet]);

  // 拼装地图 POI：按 finalItinerary 顺序填 day/order；未定位的以 NaN 坐标传出让 TripMap 列出
  const mapPOIs: MapPOI[] = useMemo(() => {
    if (!analysis) return [];
    // 先从 finalItinerary 里反向查询 “name → {day, order}”
    const dayOrder = new Map<string, { day: number; order: number }>();
    for (const d of finalItinerary) {
      let cursor = 1;
      for (const sl of d.slots) {
        for (const n of sl.items) {
          if (!dayOrder.has(n)) dayOrder.set(n, { day: d.day, order: cursor++ });
        }
      }
    }
    const list: MapPOI[] = [];
    for (const name of accepted) {
      const c = coords[name];
      const it = analysis.items.find((i) => i.name === name);
      const meta = dayOrder.get(name);
      list.push({
        name,
        lat: c?.lat ?? NaN,
        lng: c?.lng ?? NaN,
        type: it?.type,
        source: it?.source,
        recommended_reasons: it?.recommended_reasons,
        day: meta?.day,
        order: meta?.order,
      });
    }
    return list;
  }, [analysis, accepted, coords, finalItinerary]);

  // 预算汇总（粗略：把 estimated_budget 里第一个数字累加）
  const budget = useMemo(() => {
    if (!analysis) return { total: 0, hasUnknown: false };
    let total = 0;
    let hasUnknown = false;
    for (const name of accepted) {
      const it = analysis.items.find((i) => i.name === name);
      if (!it || !it.estimated_budget) {
        hasUnknown = true;
        continue;
      }
      const m = it.estimated_budget.match(/(\d+)/);
      if (m) total += parseInt(m[1]!, 10);
      else hasUnknown = true;
    }
    return { total, hasUnknown };
  }, [analysis, accepted]);

  function handleShare() {
    // v2.0：优先用 tripId 短链（同源多标签能实时同步），并保留 base64 fallback
    const url = tripId
      ? buildTripURL(tripId)
      : buildShareURL(decisions);
    setShareURL(url);
    navigator.clipboard.writeText(url).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2200);
      },
      () => {}
    );
  }

  if (!analysis) {
    return (
      <main className="mx-auto min-h-screen max-w-2xl px-6 py-16 text-center">
        <h1 className="text-2xl font-bold">还没有行程数据</h1>
        <div className="mt-6 flex justify-center gap-3">
          <Link
            href="/input"
            className="rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white"
          >
            去输入页
          </Link>
          <Link
            href="/analyze?demo=1"
            className="rounded-xl bg-accent-500 px-5 py-2.5 text-sm font-semibold text-ink-900"
          >
            用示例数据
          </Link>
        </div>
      </main>
    );
  }

  // 协同分析：交集 & 分歧
  const intersection: string[] = [];
  const disagree: string[] = [];
  if (partnerDecisions) {
    const me = new Set(accepted);
    const partnerAccepted = new Set(
      Object.entries(partnerDecisions)
        .filter(([, v]) => v === "accepted")
        .map(([k]) => k)
    );
    for (const n of me) {
      if (partnerAccepted.has(n)) intersection.push(n);
      else disagree.push(n);
    }
    for (const n of partnerAccepted) {
      if (!me.has(n)) disagree.push(n);
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-6 py-8">
      {/* 顶栏 */}
      <div className="flex items-center justify-between text-sm">
        <Link href="/analyze" className="text-ink-500 hover:text-ink-900">
          ← 返回决策板
        </Link>
        <div className="flex items-center gap-2">
          {analysis.is_mock && (
            <span className="rounded-full bg-accent-50 px-2.5 py-1 text-xs text-accent-600 ring-1 ring-accent-500/30">
              示例数据
            </span>
          )}
          {peerCount > 0 && (
            <span className="flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700 ring-1 ring-green-200">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
              </span>
              {peerCount} 名同行人在线
            </span>
          )}
          <button
            onClick={handleShare}
            className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-600"
          >
            👥 邀请同行人一起选
          </button>
        </div>
      </div>

      {/* 标题 */}
      <header className="mt-6">
        <h1 className="text-3xl font-bold tracking-tight">
          {analysis.destination} · 我的行程
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          基于你 {accepted.length} 个已确认项，TripPick 自动排好了时间线
        </p>
      </header>

      {/* 分享气泡 */}
      {shareURL && (
        <div className="mt-4 rounded-2xl bg-brand-50 px-4 py-3 text-sm ring-1 ring-brand-100">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-brand-600">
                {copied ? "✓ 链接已复制" : "复制下方链接发给同行人"}
              </div>
              <div className="mt-1 truncate text-xs text-ink-700">{shareURL}</div>
            </div>
            <button
              onClick={() => navigator.clipboard.writeText(shareURL)}
              className="rounded-lg bg-white px-3 py-1.5 text-xs ring-1 ring-brand-200 hover:bg-brand-50"
            >
              复制
            </button>
          </div>
        </div>
      )}

      {/* v2.0 M5: 伴粘状态提示 */}
      {lastPeerUpdate && (
        <div className="mt-3 rounded-xl bg-green-50 px-4 py-2 text-xs text-green-700 ring-1 ring-green-200">
          ✨ 同行人刚刚更新了选择 · {formatRelativeTime(lastPeerUpdate)}
        </div>
      )}

      {/* 协同结果 */}
      {partnerDecisions && (
        <section className="mt-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-ink-100">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-brand-50 text-brand-600">
              👥
            </span>
            <div className="font-semibold">协同视图</div>
            <span className="text-xs text-ink-500">
              你 vs 同行人的选择对比
            </span>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-green-50 p-3 ring-1 ring-green-100">
              <div className="text-xs font-semibold text-green-700">
                ✓ 你们都想去（{intersection.length}）
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {intersection.length === 0 ? (
                  <span className="text-xs text-ink-500">暂无重合</span>
                ) : (
                  intersection.map((n) => (
                    <span
                      key={n}
                      className="rounded-md bg-white px-2 py-1 text-xs font-medium text-green-700 ring-1 ring-green-200"
                    >
                      {n}
                    </span>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-xl bg-accent-50 p-3 ring-1 ring-accent-200">
              <div className="text-xs font-semibold text-accent-600">
                ⚡ 有分歧（{disagree.length}）
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {disagree.length === 0 ? (
                  <span className="text-xs text-ink-500">所有选择一致</span>
                ) : (
                  disagree.map((n) => (
                    <span
                      key={n}
                      className="rounded-md bg-white px-2 py-1 text-xs text-ink-900 ring-1 ring-accent-300"
                    >
                      {n}
                    </span>
                  ))
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* v2.0 新增：Tab 切换 */}
      {accepted.length > 0 && (
        <div className="mt-6 flex gap-2 border-b border-ink-100">
          <button
            onClick={() => setActiveTab("timeline")}
            className={`relative px-4 py-2 text-sm font-semibold transition ${
              activeTab === "timeline"
                ? "text-brand-600"
                : "text-ink-500 hover:text-ink-900"
            }`}
          >
            📅 行程视图
            {activeTab === "timeline" && (
              <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-t-full bg-brand-500" />
            )}
          </button>
          <button
            onClick={() => setActiveTab("map")}
            className={`relative px-4 py-2 text-sm font-semibold transition ${
              activeTab === "map"
                ? "text-brand-600"
                : "text-ink-500 hover:text-ink-900"
            }`}
          >
            🗺️ 地图视图
            {activeTab === "map" && (
              <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-t-full bg-brand-500" />
            )}
          </button>
        </div>
      )}

      {/* v2.0 M4: 地图视图 */}
      {activeTab === "map" && accepted.length > 0 && (
        <section className="mt-6">
          {geocodeStatus === "loading" && (
            <div className="flex h-[480px] items-center justify-center rounded-2xl bg-white text-sm text-ink-500 ring-1 ring-ink-100">
              <span className="inline-flex items-center gap-2">
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-brand-500/30 border-t-brand-500" />
                正在查询 {accepted.length} 个地点的坐标，需 ~{accepted.length}s…
              </span>
            </div>
          )}
          {geocodeStatus === "error" && (
            <div className="rounded-2xl bg-red-50 p-10 text-center text-sm text-red-600 ring-1 ring-red-100">
              坐标查询失败，请检查网络后重试
            </div>
          )}
          {geocodeStatus === "done" && (
            <TripMap pois={mapPOIs} city={analysis.destination} />
          )}
        </section>
      )}

      {/* 行程时间轴 */}
      {activeTab === "timeline" && (
      <section className="mt-8 space-y-6">
        {finalItinerary.length === 0 && (
          <div className="rounded-2xl bg-white p-10 text-center text-ink-500 ring-1 ring-ink-100">
            还没有任何已确认的地点，先回去选几个 ✅
          </div>
        )}
        {activeTab === "timeline" && finalItinerary.map((day) => (
          <div key={day.day} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-ink-100">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-500 text-white font-bold">
                D{day.day}
              </span>
              <h2 className="text-lg font-semibold">Day {day.day}</h2>
            </div>
            <div className="mt-4 space-y-4">
              {day.slots.map((slot) => {
                if (slot.items.length === 0) return null;
                return (
                  <div key={slot.time_slot} className="flex gap-4">
                    <div className="w-16 shrink-0 text-xs font-semibold text-ink-500">
                      {TIME_SLOT_LABEL[slot.time_slot]}
                    </div>
                    <div className="flex-1 space-y-2">
                      {slot.items.map((n) => {
                        const it = analysis.items.find((i) => i.name === n);
                        const partnerWants =
                          partnerDecisions?.[n] === "accepted";
                        return (
                          <div
                            key={n}
                            className="rounded-xl bg-ink-100/40 p-3 ring-1 ring-ink-100"
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-semibold">{n}</span>
                              {it && (
                                <span className="rounded-full bg-white px-2 py-0.5 text-xs text-ink-700 ring-1 ring-ink-100">
                                  {it.type}
                                </span>
                              )}
                              {partnerWants && (
                                <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs text-green-700">
                                  ✓ 同行人也想去
                                </span>
                              )}
                            </div>
                            {it && it.recommended_reasons.length > 0 && (
                              <div className="mt-1 text-xs text-ink-500">
                                {it.recommended_reasons.slice(0, 3).join(" · ")}
                              </div>
                            )}
                            {it && it.warnings.length > 0 && (
                              <div className="mt-1 text-xs text-warn-distance">
                                ⚠️ {it.warnings.join(" · ")}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {slot.note && (
                        <div className="rounded-lg bg-accent-50/60 px-3 py-1.5 text-xs leading-relaxed text-ink-700 ring-1 ring-accent-100">
                          💡 {slot.note}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </section>
      )}

      {/* 预算汇总 */}
      {accepted.length > 0 && (
        <section className="mt-6 rounded-2xl bg-gradient-to-br from-brand-50 to-accent-50 p-5 ring-1 ring-brand-100">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-ink-700">预算粗估（不含交通到达）</div>
              <div className="mt-1 text-3xl font-bold text-brand-600">
                约 ¥{budget.total}
                {budget.hasUnknown && (
                  <span className="ml-2 align-middle text-xs font-normal text-ink-500">
                    部分项目未标注价格
                  </span>
                )}
              </div>
            </div>
            <div className="text-right text-xs text-ink-500">
              已选 {accepted.length} 项
              <br />
              共 {finalItinerary.length} 天
            </div>
          </div>
        </section>
      )}

      {/* 来源笔记 */}
      {analysis.source_titles.length > 0 && (
        <section className="mt-6 rounded-2xl bg-white p-5 ring-1 ring-ink-100">
          <h3 className="text-sm font-semibold text-ink-700">📌 来源笔记</h3>
          <ul className="mt-2 space-y-1.5 text-xs text-ink-500">
            {analysis.source_titles.map((t, i) => (
              <li key={i}>· {t}</li>
            ))}
          </ul>
          <div className="mt-3 text-xs text-ink-300">
            v1.0 来源链接为模拟；v2.0 将直接跳转原始小红书帖子
          </div>
        </section>
      )}

      <div className="mt-10 text-center text-xs text-ink-500">
        TripPick · 把你收藏的小红书攻略，拼成真正能出发的行程
      </div>
    </main>
  );
}

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 5_000) return "刚刚";
  if (diff < 60_000) return `${Math.floor(diff / 1000)} 秒前`;
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  return new Date(ts).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}
