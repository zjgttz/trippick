"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Users,
  Calendar,
  Map as MapIcon,
  Check,
  X,
  Zap,
  Wallet,
  AlertCircle,
  Lightbulb,
  Pin,
  Download,
  RotateCcw,
  GripVertical,
  CheckCheck,
  Sparkles,
} from "lucide-react";
import {
  useTripPickStore,
  getAcceptedItems,
  type DecisionStatus,
} from "@/lib/store";
import { TIME_SLOT_LABEL, type ItineraryDay, type TimeSlot } from "@/lib/schema";
import { reorderItineraryByGeo } from "@/lib/reorder-by-geo";
import { readPartnerFromURL } from "@/lib/share";
import { TripMap, type MapPOI } from "@/components/TripMap";
import { useRealtimeSync } from "@/lib/use-realtime-sync";
import { buildTripURL, getOrCreateTripId } from "@/lib/realtime-sync";

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
  const customItinerary = useTripPickStore((s) => s.customItinerary);
  const setCustomItinerary = useTripPickStore((s) => s.setCustomItinerary);

  const [shareURL, setShareURL] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // v2.0: 编辑行程相关
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const [exporting, setExporting] = useState(false);
  const [addModal, setAddModal] = useState<
    { day: number; time_slot: TimeSlot } | null
  >(null);
  const [addName, setAddName] = useState("");
  // v2.0: 拖动状态
  type DragSrc = { day: number; time_slot: TimeSlot; name: string };
  type DropTarget =
    | { kind: "item"; day: number; time_slot: TimeSlot; name: string; pos: "before" | "after" }
    | { kind: "slot-end"; day: number; time_slot: TimeSlot };
  const [dragSrc, setDragSrc] = useState<DragSrc | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  // v2.0: 默认不启动多人同步。点「邀请同行人」或从分享链接进入时才启动。
  const [coopEnabled, setCoopEnabled] = useState(false);
  const { tripId, peerCount, lastPeerUpdate } = useRealtimeSync(coopEnabled);
  // v2.0 M4: tab 切换 + 地图坐标
  const [activeTab, setActiveTab] = useState<"timeline" | "map">("timeline");
  const [coords, setCoords] = useState<Record<string, { lat: number; lng: number } | null>>({});
  const [geocodeStatus, setGeocodeStatus] = useState<"idle" | "loading" | "done" | "error">("idle");

  // 协同：如果有 ?s=... 参数，把它当作"伙伴的选择"读入
  useEffect(() => {
    const partner = readPartnerFromURL();
    if (partner) {
      setPartnerDecisions(partner);
      setCoopEnabled(true); // 从分享链接进来 → 自动启用同步
    } else if (!fromShare) {
      // 单人模式：清掉上次会话残留的 partnerDecisions，避免误报「同行人」
      setPartnerDecisions(null);
    }
    // 从URL看是否带 trip_id（分享者发来的同步链接）
    if (fromShare) setCoopEnabled(true);

    // 如果是分享链接打开且本地没数据，自动加载 mock 让 demo 可见
    if (fromShare && !analysis) {
      fetch("/mock-result.json")
        .then((r) => r.json())
        .then((m) => setAnalysis({ ...m, is_mock: true }));
    }
  }, [fromShare, analysis, setPartnerDecisions, setAnalysis]);

  const accepted = useMemo(() => getAcceptedItems(decisions), [decisions]);
  const acceptedSet = useMemo(() => new Set(accepted), [accepted]);

  // v2.0 路线优化：进页就拉坐标（不再懒加载）。坐标同时服务于地图视图和地理重排。
  useEffect(() => {
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
  }, [analysis, accepted, geocodeStatus]);

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

  // v2.0 路线优化：在 finalItinerary 之上叠加地理重排。
  // - 坐标未到位 / 只有1个 / 重排函数识则有问题 → 原样返回。
  // - 用户手动调整过 (customItinerary) → 不重排，尊重用户意愿。
  const geoReorderedFinal: ItineraryDay[] = useMemo(() => {
    if (!analysis) return finalItinerary;
    if (geocodeStatus !== "done") return finalItinerary;
    return reorderItineraryByGeo(finalItinerary, analysis.items, coords);
  }, [analysis, finalItinerary, geocodeStatus, coords]);

  // v2.0: 优先用用户手动调整后的行程，未调整则用地理重排后的 finalItinerary
  const itineraryToShow: ItineraryDay[] = useMemo(() => {
    return customItinerary ?? geoReorderedFinal;
  }, [customItinerary, geoReorderedFinal]);

  // 编辑操作：拿到当前快照 → deep clone → mutate → setCustomItinerary
  function cloneItinerary(src: ItineraryDay[]): ItineraryDay[] {
    return src.map((d) => ({
      day: d.day,
      slots: d.slots.map((s) => ({
        time_slot: s.time_slot,
        items: [...s.items],
        note: s.note,
      })),
    }));
  }

  function handleDeleteItem(day: number, time_slot: TimeSlot, name: string) {
    const next = cloneItinerary(itineraryToShow);
    const d = next.find((x) => x.day === day);
    if (!d) return;
    const sl = d.slots.find((x) => x.time_slot === time_slot);
    if (!sl) return;
    sl.items = sl.items.filter((n) => n !== name);
    setCustomItinerary(next);
  }

  function handleAddItem() {
    if (!addModal) return;
    const name = addName.trim();
    if (!name) return;
    const next = cloneItinerary(itineraryToShow);
    let d = next.find((x) => x.day === addModal.day);
    if (!d) {
      d = {
        day: addModal.day,
        slots: SLOTS.map((s) => ({ time_slot: s, items: [], note: "" })),
      };
      next.push(d);
      next.sort((a, b) => a.day - b.day);
    }
    let sl = d.slots.find((x) => x.time_slot === addModal.time_slot);
    if (!sl) {
      sl = { time_slot: addModal.time_slot, items: [], note: "" };
      d.slots.push(sl);
    }
    if (!sl.items.includes(name)) sl.items.push(name);
    setCustomItinerary(next);
    setAddModal(null);
    setAddName("");
  }

  function handleResetCustom() {
    setCustomItinerary(null);
  }

  function handleDrop() {
    if (!dragSrc || !dropTarget) {
      setDragSrc(null);
      setDropTarget(null);
      return;
    }
    // 拖到自己头上：什么都不做
    if (
      dropTarget.kind === "item" &&
      dropTarget.day === dragSrc.day &&
      dropTarget.time_slot === dragSrc.time_slot &&
      dropTarget.name === dragSrc.name
    ) {
      setDragSrc(null);
      setDropTarget(null);
      return;
    }

    const next = cloneItinerary(itineraryToShow);

    // 1) 从源位置移除
    const srcDay = next.find((d) => d.day === dragSrc.day);
    const srcSlot = srcDay?.slots.find((s) => s.time_slot === dragSrc.time_slot);
    if (!srcSlot) {
      setDragSrc(null);
      setDropTarget(null);
      return;
    }
    srcSlot.items = srcSlot.items.filter((n) => n !== dragSrc.name);

    // 2) 定位目标 day/slot（拖跨天时可能需要创建 Day）
    let dstDay = next.find((d) => d.day === dropTarget.day);
    if (!dstDay) {
      dstDay = {
        day: dropTarget.day,
        slots: SLOTS.map((s) => ({ time_slot: s, items: [], note: "" })),
      };
      next.push(dstDay);
      next.sort((a, b) => a.day - b.day);
    }
    let dstSlot = dstDay.slots.find((s) => s.time_slot === dropTarget.time_slot);
    if (!dstSlot) {
      dstSlot = { time_slot: dropTarget.time_slot, items: [], note: "" };
      dstDay.slots.push(dstSlot);
    }

    // 3) 插入到目标位置
    if (dropTarget.kind === "slot-end") {
      dstSlot.items.push(dragSrc.name);
    } else {
      const idx = dstSlot.items.indexOf(dropTarget.name);
      if (idx === -1) {
        dstSlot.items.push(dragSrc.name);
      } else {
        const insertAt = dropTarget.pos === "before" ? idx : idx + 1;
        dstSlot.items.splice(insertAt, 0, dragSrc.name);
      }
    }

    setCustomItinerary(next);
    setDragSrc(null);
    setDropTarget(null);
  }

  async function handleExportImage() {
    if (!timelineRef.current) return;
    setExporting(true);
    try {
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(timelineRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: "#ffffff",
      });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `trippick-${analysis?.destination || "trip"}.png`;
      a.click();
    } catch (e) {
      console.error("生成长图失败", e);
      alert("生成长图失败，请重试");
    } finally {
      setExporting(false);
    }
  }

  // 拼装地图 POI：按 itineraryToShow 顺序填 day/order；未定位的以 NaN 坐标传出让 TripMap 列出
  const mapPOIs: MapPOI[] = useMemo(() => {
    if (!analysis) return [];
    // 先从 itineraryToShow 里反向查询 “name → {day, order}”
    const dayOrder = new Map<string, { day: number; order: number }>();
    for (const d of itineraryToShow) {
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
  }, [analysis, accepted, coords, itineraryToShow]);

  function handleShare() {
    // 点击邀请按钮 → 启动同步。直接同步拿 tripId，避免 hook useEffect 异步延迟。
    if (!coopEnabled) setCoopEnabled(true);
    // 同步获取（读 URL ?trip= / localStorage / 新建），保证第一次点击就出 ?trip= 链接
    const id = getOrCreateTripId();
    const url = buildTripURL(id);
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
        <h1 className="text-2xl font-bold">还没有行程</h1>
        <p className="mt-2 text-ink-700">先去决策板选几个想去的地方，或者一键用示例看看效果。</p>
        <div className="mt-6 flex justify-center gap-3">
          <Link
            href="/input"
            className="btn-press rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-600"
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
            className="btn-press inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-600"
          >
            <Users className="h-3.5 w-3.5" strokeWidth={2} />
            邀请同行人一起选
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
              <div className="inline-flex items-center gap-1 font-semibold text-brand-600">
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5" strokeWidth={2.25} />
                    链接已复制
                  </>
                ) : (
                  "复制下方链接发给同行人"
                )}
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
        <div className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-green-50 px-4 py-2 text-xs text-green-700 ring-1 ring-green-200">
          <Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} />
          同行人刚刚更新了选择 · {formatRelativeTime(lastPeerUpdate)}
        </div>
      )}

      {/* 协同结果 */}
      {partnerDecisions && (
        <section className="mt-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-ink-100">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-brand-50 text-brand-600">
              <Users className="h-4 w-4" strokeWidth={1.75} />
            </span>
            <div className="font-semibold">协同视图</div>
            <span className="text-xs text-ink-500">
              你 vs 同行人的选择对比
            </span>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-green-50 p-3 ring-1 ring-green-100">
              <div className="inline-flex items-center gap-1 text-xs font-semibold text-green-700">
                <CheckCheck className="h-3.5 w-3.5" strokeWidth={2} />
                你们都想去（{intersection.length}）
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

            <div className="rounded-xl bg-white p-3 ring-1 ring-ink-200">
              <div className="inline-flex items-center gap-1 text-xs font-semibold text-ink-800">
                <Zap className="h-3.5 w-3.5 text-amber-500" strokeWidth={2} />
                驴友意见不合（{disagree.length}）
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {disagree.length === 0 ? (
                  <span className="text-xs text-ink-500">所有选择一致</span>
                ) : (
                  disagree.map((n) => (
                    <span
                      key={n}
                      className="rounded-md bg-ink-50 px-2 py-1 text-xs text-ink-900 ring-1 ring-ink-200"
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
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="h-4 w-4" strokeWidth={1.75} />
              行程视图
            </span>
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
            <span className="inline-flex items-center gap-1.5">
              <MapIcon className="h-4 w-4" strokeWidth={1.75} />
              地图视图
            </span>
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
      <section className="mt-8">
        {/* 编辑工具栏 */}
        {itineraryToShow.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-ink-500">
              {customItinerary ? (
                <span className="rounded-full bg-accent-50 px-2 py-1 text-accent-600 ring-1 ring-accent-200">
                  已手动调整
                </span>
              ) : (
<span className="inline-flex items-center gap-1"><GripVertical className="h-3.5 w-3.5 text-ink-400" strokeWidth={1.75} />拖拽条目可重排顺序 · 右上角点“×”删除 · 点“+ 添加”插入自定义条目（如高铁、机场大巴）</span>
              )}
            </div>
            <div className="flex gap-2">
              {customItinerary && (
                <button
                  onClick={handleResetCustom}
                  className="inline-flex items-center gap-1 rounded-lg bg-white px-3 py-1.5 text-xs ring-1 ring-ink-200 hover:bg-ink-100/40"
                >
                  <RotateCcw className="h-3 w-3" strokeWidth={1.75} />
                  恢复 AI 默认排期
                </button>
              )}
              <button
                onClick={handleExportImage}
                disabled={exporting}
                className="btn-press inline-flex items-center gap-1 rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
              >
                <Download className="h-3 w-3" strokeWidth={2} />
                {exporting ? "生成中…" : "生成长图保存"}
              </button>
            </div>
          </div>
        )}

        <div ref={timelineRef} className="space-y-6 bg-white/0">
        {itineraryToShow.length === 0 && (
          <div className="rounded-2xl bg-white p-10 text-center text-ink-500 ring-1 ring-ink-100">
            还没选地方？回上一页勾选把想去的加进来
          </div>
        )}
        {activeTab === "timeline" && itineraryToShow.map((day) => (
          <div key={day.day} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-ink-100">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-500 text-white font-bold">
                D{day.day}
              </span>
              <h2 className="text-lg font-semibold">Day {day.day}</h2>
            </div>
            <div className="mt-4 space-y-4">
              {SLOTS.map((slotKey) => {
                const slot =
                  day.slots.find((s) => s.time_slot === slotKey) ?? {
                    time_slot: slotKey,
                    items: [] as string[],
                    note: "",
                  };
                const hasItems = slot.items.length > 0;
                const isDropSlotEnd =
                  dropTarget?.kind === "slot-end" &&
                  dropTarget.day === day.day &&
                  dropTarget.time_slot === slot.time_slot;
                return (
                  <div key={slot.time_slot} className="flex gap-4">
                    <div className="w-16 shrink-0 text-xs font-semibold text-ink-500">
                      {TIME_SLOT_LABEL[slot.time_slot]}
                    </div>
                    <div
                      className={`flex-1 space-y-2 rounded-lg p-1 transition ${
                        isDropSlotEnd ? "bg-brand-50 ring-2 ring-brand-300" : ""
                      }`}
                      onDragOver={(e) => {
                        // 只有拖到空 slot 或 slot 底部（不是某个 item）才走这里
                        if (!dragSrc) return;
                        // 仅在未有更精确的 item 目标时才用 slot-end
                        if (slot.items.length === 0) {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = "move";
                          setDropTarget({
                            kind: "slot-end",
                            day: day.day,
                            time_slot: slot.time_slot,
                          });
                        }
                      }}
                      onDrop={(e) => {
                        if (!dragSrc) return;
                        e.preventDefault();
                        // 如果子元素已接管，这里只处理空 slot drop
                        if (slot.items.length === 0) {
                          setDropTarget({
                            kind: "slot-end",
                            day: day.day,
                            time_slot: slot.time_slot,
                          });
                          handleDrop();
                        }
                      }}
                    >
                      {slot.items.map((n) => {
                        const it = analysis.items.find((i) => i.name === n);
                        const partnerWants =
                          partnerDecisions?.[n] === "accepted";
                        const isDragging =
                          dragSrc?.day === day.day &&
                          dragSrc?.time_slot === slot.time_slot &&
                          dragSrc?.name === n;
                        const isDropBefore =
                          dropTarget?.kind === "item" &&
                          dropTarget.day === day.day &&
                          dropTarget.time_slot === slot.time_slot &&
                          dropTarget.name === n &&
                          dropTarget.pos === "before";
                        const isDropAfter =
                          dropTarget?.kind === "item" &&
                          dropTarget.day === day.day &&
                          dropTarget.time_slot === slot.time_slot &&
                          dropTarget.name === n &&
                          dropTarget.pos === "after";
                        return (
                          <div key={n} className="relative">
                            {isDropBefore && (
                              <div className="absolute -top-1 left-0 right-0 z-10 h-0.5 rounded-full bg-brand-500" />
                            )}
                            {isDropAfter && (
                              <div className="absolute -bottom-1 left-0 right-0 z-10 h-0.5 rounded-full bg-brand-500" />
                            )}
                          <div
                            draggable={!exporting}
                            onDragStart={(e) => {
                              e.dataTransfer.effectAllowed = "move";
                              setDragSrc({
                                day: day.day,
                                time_slot: slot.time_slot,
                                name: n,
                              });
                            }}
                            onDragOver={(e) => {
                              if (!dragSrc) return;
                              e.preventDefault();
                              e.dataTransfer.dropEffect = "move";
                              const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                              const pos =
                                e.clientY < r.top + r.height / 2
                                  ? "before"
                                  : "after";
                              setDropTarget({
                                kind: "item",
                                day: day.day,
                                time_slot: slot.time_slot,
                                name: n,
                                pos,
                              });
                            }}
                            onDrop={(e) => {
                              e.preventDefault();
                              handleDrop();
                            }}
                            onDragEnd={() => {
                              setDragSrc(null);
                              setDropTarget(null);
                            }}
                            className={`group relative rounded-xl bg-ink-100/40 p-3 pr-9 ring-1 ring-ink-100 ${
                              exporting ? "" : "cursor-grab active:cursor-grabbing"
                            } ${isDragging ? "opacity-40" : ""}`}
                          >
                            {!exporting && (
                              <button
                                onClick={() =>
                                  handleDeleteItem(day.day, slot.time_slot, n)
                                }
                                title="删除该条目"
                                className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-white text-ink-500 ring-1 ring-ink-200 opacity-0 transition group-hover:opacity-100 hover:bg-red-50 hover:text-red-600 hover:ring-red-200"
                              >
                                <X className="h-3.5 w-3.5" strokeWidth={2} />
                              </button>
                            )}
                            {!exporting && (
                              <span
                                aria-hidden
                                className="absolute left-1 top-1/2 -translate-y-1/2 select-none text-ink-300 opacity-0 transition group-hover:opacity-100"
                                title="拖动重排"
                              >
                                <GripVertical className="h-4 w-4" strokeWidth={1.5} />
                              </span>
                            )}
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-semibold">{n}</span>
                              {it ? (
                                <span className="rounded-full bg-white px-2 py-0.5 text-xs text-ink-700 ring-1 ring-ink-100">
                                  {it.type}
                                </span>
                              ) : (
                                <span className="rounded-full bg-accent-50 px-2 py-0.5 text-xs text-accent-600 ring-1 ring-accent-200">
                                  手动添加
                                </span>
                              )}
                              {partnerWants && (
                                <span className="inline-flex items-center gap-0.5 rounded-full bg-green-50 px-2 py-0.5 text-xs text-green-700">
                                  <Check className="h-3 w-3" strokeWidth={2.25} />
                                  同行人也想去
                                </span>
                              )}
                            </div>
                            {it && it.recommended_reasons.length > 0 && (
                              <div className="mt-1 text-xs text-ink-500">
                                {it.recommended_reasons.slice(0, 3).join(" · ")}
                              </div>
                            )}
                            {it && it.estimated_budget && (
                              <div className="mt-1 inline-flex items-center gap-1 text-xs text-ink-700">
                                <Wallet className="h-3 w-3" strokeWidth={1.75} />
                                {it.estimated_budget}
                              </div>
                            )}
                            {it && it.warnings.length > 0 && (
                              <div className="mt-1 inline-flex items-start gap-1 text-xs text-warn-distance">
                                <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" strokeWidth={1.75} />
                                <span>{it.warnings.join(" · ")}</span>
                              </div>
                            )}
                          </div>
                          </div>
                        );
                      })}
                      {/* 只在 slot 有实际条目时才显示 note，避免 LLM 在空 slot 里编造「隐形推荐」 */}
                      {slot.note && slot.items.length > 0 && (
                        <div className="inline-flex items-start gap-1.5 rounded-lg bg-ink-50 px-3 py-1.5 text-xs leading-relaxed text-ink-700 ring-1 ring-ink-100">
                          <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-400" strokeWidth={1.75} />
                          <span>{slot.note}</span>
                        </div>
                      )}
                      {!exporting && (
                        <button
                          onClick={() =>
                            setAddModal({ day: day.day, time_slot: slot.time_slot })
                          }
                          className={`w-full rounded-lg border border-dashed border-ink-200 px-3 py-1.5 text-xs text-ink-500 hover:border-brand-300 hover:bg-brand-50/40 hover:text-brand-600 ${
                            hasItems ? "" : "opacity-70"
                          }`}
                        >
                          + 添加条目到 {TIME_SLOT_LABEL[slot.time_slot]}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {/* 新增一天 */}
        {!exporting && itineraryToShow.length > 0 && (
          <button
            onClick={() => {
              const maxDay = itineraryToShow.reduce(
                (m, d) => Math.max(m, d.day),
                0
              );
              setAddModal({ day: maxDay + 1, time_slot: "morning" });
            }}
            className="w-full rounded-2xl border-2 border-dashed border-ink-200 bg-white/40 px-4 py-3 text-sm text-ink-500 hover:border-brand-300 hover:bg-brand-50/40 hover:text-brand-600"
          >
            + 新增一天
          </button>
        )}
        </div>
      </section>
      )}

      {/* 添加条目 Modal */}
      {addModal && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-ink-900/40 p-4"
          onClick={() => {
            setAddModal(null);
            setAddName("");
          }}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-base font-semibold">添加条目</div>
            <div className="mt-1 text-xs text-ink-500">
              例如：“高铁从上海到杭州”、“机场大巴”、“酒店 check-in”
            </div>

            <label className="mt-4 block text-xs font-semibold text-ink-700">
              名称
            </label>
            <input
              autoFocus
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddItem();
              }}
              placeholder="输入条目名称…"
              className="mt-1 w-full rounded-lg bg-ink-100/40 px-3 py-2 text-sm ring-1 ring-ink-100 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-400"
            />

            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-ink-700">
                  第几天
                </label>
                <select
                  value={addModal.day}
                  onChange={(e) =>
                    setAddModal({ ...addModal, day: parseInt(e.target.value, 10) })
                  }
                  className="mt-1 w-full rounded-lg bg-ink-100/40 px-3 py-2 text-sm ring-1 ring-ink-100"
                >
                  {Array.from(
                    {
                      length: Math.max(
                        addModal.day,
                        itineraryToShow.reduce((m, d) => Math.max(m, d.day), 0) + 1
                      ),
                    },
                    (_, i) => i + 1
                  ).map((d) => (
                    <option key={d} value={d}>
                      Day {d}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-ink-700">
                  时段
                </label>
                <select
                  value={addModal.time_slot}
                  onChange={(e) =>
                    setAddModal({
                      ...addModal,
                      time_slot: e.target.value as TimeSlot,
                    })
                  }
                  className="mt-1 w-full rounded-lg bg-ink-100/40 px-3 py-2 text-sm ring-1 ring-ink-100"
                >
                  {SLOTS.map((s) => (
                    <option key={s} value={s}>
                      {TIME_SLOT_LABEL[s]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => {
                  setAddModal(null);
                  setAddName("");
                }}
                className="rounded-lg bg-white px-4 py-2 text-sm ring-1 ring-ink-200 hover:bg-ink-100/40"
              >
                取消
              </button>
              <button
                onClick={handleAddItem}
                disabled={!addName.trim()}
                className="btn-press rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
              >
                添加
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 行程概要（已选 N 项 / 共 N 天） */}
      {accepted.length > 0 && (
        <section className="mt-6 rounded-2xl bg-white px-5 py-3 text-xs text-ink-700 ring-1 ring-ink-100">
          已选 <span className="font-semibold text-brand-600">{accepted.length}</span> 项 · 共 <span className="font-semibold text-brand-600">{itineraryToShow.length}</span> 天
        </section>
      )}

      {/* 来源笔记 */}
      {analysis.source_titles.length > 0 && (
        <section className="mt-6 rounded-2xl bg-white p-5 ring-1 ring-ink-100">
          <h3 className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-700">
            <Pin className="h-3.5 w-3.5 text-ink-500" strokeWidth={1.75} />
            来源笔记
          </h3>
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
