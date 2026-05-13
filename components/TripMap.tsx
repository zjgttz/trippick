"use client";

import { useEffect, useRef, useState } from "react";
import { wgs84ToGcj02 } from "@/lib/gcj02";

const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";

export interface MapPOI {
  name: string;
  lat: number;
  lng: number;
  type?: string;
  source?: "user_note" | "ai_recommended";
  recommended_reasons?: string[];
  /** 该 POI 所属的 Day（1/2/3）。未排进行程则为 undefined。 */
  day?: number;
  /** 同 Day 内的顺序（1 起），用于序号和连线。 */
  order?: number;
}

interface TripMapProps {
  /** 全部 POI（包含定位失败的）。lat/lng 为 NaN 时视为定位失败，在地图下方列出。 */
  pois: MapPOI[];
  /** 城市名，用于地图初始中心 fallback */
  city: string;
}

declare global {
  interface Window {
    L?: any;
    __leafletLoading?: Promise<any>;
  }
}

// Day 配色：Day1 蓝 / Day2 绿 / Day3 紫 / 其他/AI 橙
const DAY_COLORS: Record<number, string> = {
  1: "#3b82f6", // blue-500
  2: "#10b981", // emerald-500
  3: "#8b5cf6", // violet-500
};
const AI_COLOR = "#f97316"; // orange-500
const FALLBACK_COLOR = "#64748b"; // slate-500

function colorOf(p: MapPOI): string {
  if (p.source === "ai_recommended") return AI_COLOR;
  if (p.day && DAY_COLORS[p.day]) return DAY_COLORS[p.day]!;
  return FALLBACK_COLOR;
}

function loadLeaflet(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject("ssr");
  if (window.L) return Promise.resolve(window.L);
  if (window.__leafletLoading) return window.__leafletLoading;

  window.__leafletLoading = new Promise((resolve, reject) => {
    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = LEAFLET_CSS;
      document.head.appendChild(link);
    }
    const existing = document.querySelector(`script[src="${LEAFLET_JS}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(window.L));
      existing.addEventListener("error", () => reject("script_error"));
      return;
    }
    const script = document.createElement("script");
    script.src = LEAFLET_JS;
    script.async = true;
    script.onload = () => resolve(window.L);
    script.onerror = () => reject("script_error");
    document.head.appendChild(script);
  });
  return window.__leafletLoading;
}

export function TripMap({ pois, city: _city }: TripMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  const valid = pois.filter(
    (p) => Number.isFinite(p.lat) && Number.isFinite(p.lng),
  );
  const failed = pois.filter(
    (p) => !Number.isFinite(p.lat) || !Number.isFinite(p.lng),
  );

  useEffect(() => {
    let cancelled = false;
    loadLeaflet()
      .then((L) => {
        if (cancelled || !containerRef.current) return;
        if (mapRef.current) return;

        // Nominatim 返回 WGS-84，高德底图用 GCJ-02，所有坐标先做一次转换
        const validGcj = valid.map((p) => {
          const [lat, lng] = wgs84ToGcj02(p.lat, p.lng);
          return { ...p, lat, lng };
        });

        const center =
          validGcj.length > 0 ? [validGcj[0]!.lat, validGcj[0]!.lng] : [35.0, 105.0];

        const isMobile =
          typeof window !== "undefined" &&
          window.matchMedia("(max-width: 640px)").matches;
        const map = L.map(containerRef.current, {
          scrollWheelZoom: !isMobile,
          touchZoom: true,
          tap: true,
          dragging: !isMobile,
        }).setView(center, valid.length > 0 ? 12 : 4);
        mapRef.current = map;

        if (isMobile) {
          const enableDragging = () => {
            map.dragging.enable();
            containerRef.current?.removeEventListener("click", enableDragging);
          };
          containerRef.current.addEventListener("click", enableDragging);
        }

        // 使用高德 WMTS（中文标签 + 国内 POI 覆盖好 + 免 key）。
        // 高德底图坐标系是 GCJ-02，所以 marker 坐标已在上方转换。
        // 注意：subdomains 01-04，需要在 URL 模板里用 {s} 引用。
        // Fallback 注释保留：CartoDB Voyager / OSM 原站。
        L.tileLayer(
          "https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}",
          {
            maxZoom: 18,
            subdomains: "1234",
            attribution: '&copy; <a href="https://amap.com">高德地图</a>',
          },
        ).addTo(map);

        // Fallback ①：CartoDB Voyager（国际，英文标签）
        // L.tileLayer(
        //   "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
        //   { maxZoom: 19, subdomains: "abcd", attribution: "..." },
        // ).addTo(map);
        // Fallback ②：OSM 原站
        // L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        //   maxZoom: 19, attribution: "...",
        // }).addTo(map);

        // 1) 画 Day 连线（同一 Day 按 order 排序）
        const byDay = new Map<number, MapPOI[]>();
        for (const p of validGcj) {
          if (!p.day || p.source === "ai_recommended") continue;
          if (!byDay.has(p.day)) byDay.set(p.day, []);
          byDay.get(p.day)!.push(p);
        }
        for (const [day, list] of byDay.entries()) {
          if (list.length < 2) continue;
          list.sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
          const latlngs = list.map((p) => [p.lat, p.lng]);
          L.polyline(latlngs, {
            color: DAY_COLORS[day] ?? FALLBACK_COLOR,
            weight: 3,
            opacity: 0.55,
            dashArray: "6 8",
          }).addTo(map);
        }

        // 2) 画 Marker（带序号 / Day 颜色）
        const markers: any[] = [];
        for (const p of validGcj) {
          const color = colorOf(p);
          const isAI = p.source === "ai_recommended";
          const displayName =
            p.name.length > 10 ? p.name.slice(0, 9) + "…" : p.name;
          // 序号：用户笔记的 POI 显示 order；AI 推荐显示 ✨
          const badge = isAI
            ? "✨"
            : p.order
              ? String(p.order)
              : "•";
          const icon = L.divIcon({
            className: "trippick-marker",
            html: `
              <div style="
                display:inline-flex;
                align-items:center;
                gap:4px;
                background:${color};
                color:white;
                border:2px solid white;
                box-shadow:0 2px 8px rgba(0,0,0,0.25);
                border-radius:999px;
                padding:3px 9px 3px 4px;
                font-size:11px;
                font-weight:600;
                white-space:nowrap;
                font-family:system-ui,sans-serif;
                max-width:160px;
                overflow:hidden;
                text-overflow:ellipsis;
              ">
                <span style="
                  display:inline-flex;
                  align-items:center;
                  justify-content:center;
                  background:rgba(255,255,255,0.25);
                  border-radius:999px;
                  min-width:18px;
                  height:18px;
                  padding:0 4px;
                  font-size:10px;
                  font-weight:700;
                ">${escapeHtml(badge)}</span>
                <span>${escapeHtml(displayName)}</span>
              </div>
            `,
            iconSize: [0, 0],
            iconAnchor: [0, 0],
          });
          const marker = L.marker([p.lat, p.lng], { icon }).addTo(map);
          const reasonsHtml =
            p.recommended_reasons && p.recommended_reasons.length > 0
              ? `<div style="margin-top:6px;font-size:12px;color:#555;">${escapeHtml(
                  p.recommended_reasons.slice(0, 2).join(" · "),
                )}</div>`
              : "";
          const dayBadge = p.day
            ? `<span style="display:inline-block;background:${color};color:white;font-size:10px;font-weight:600;padding:1px 6px;border-radius:999px;margin-left:4px;">Day ${p.day}</span>`
            : isAI
              ? `<span style="display:inline-block;background:${AI_COLOR};color:white;font-size:10px;font-weight:600;padding:1px 6px;border-radius:999px;margin-left:4px;">AI 补充</span>`
              : "";
          marker.bindPopup(`
            <div style="font-family:system-ui;min-width:160px">
              <div style="font-weight:600;font-size:14px;">${escapeHtml(p.name)}${dayBadge}</div>
              ${p.type ? `<div style="font-size:11px;color:#888;margin-top:2px;">${escapeHtml(p.type)}</div>` : ""}
              ${reasonsHtml}
            </div>
          `);
          markers.push(marker);
        }

        if (validGcj.length > 1) {
          const group = L.featureGroup(markers);
          map.fitBounds(group.getBounds().pad(0.2));
        }

        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
    // 重建依据：POI 名字 + day + order 三元组组合（任意变化都重建）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pois.map((p) => `${p.name}-${p.day ?? 0}-${p.order ?? 0}`).join("|")]);

  if (status === "error") {
    return (
      <div className="rounded-2xl bg-white p-10 text-center text-ink-500 ring-1 ring-ink-100">
        地图加载失败，请检查网络或稍后重试
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div
        ref={containerRef}
        className="h-[320px] w-full overflow-hidden rounded-2xl ring-1 ring-ink-100 sm:h-[480px]"
        style={{ background: "#f8fafc" }}
      />
      <p className="text-center text-xs text-ink-400 sm:hidden">
        👆 点击地图后可拖动、双指缩放
      </p>

      {/* 图例 */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-500">
        <div>
          地图基于高德地图，标注了 {valid.length} 个地点
          {failed.length > 0 && (
            <span className="ml-2 text-amber-600">
              · {failed.length} 个未能定位
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {Array.from(new Set(valid.map((p) => p.day).filter((d): d is number => typeof d === "number")))
            .sort((a, b) => a - b)
            .map((d) => (
              <LegendDot
                key={d}
                color={DAY_COLORS[d] ?? DAY_COLORS[1]!}
                label={`Day ${d}`}
              />
            ))}
          {valid.some((p) => p.source === "ai_recommended") && (
            <LegendDot color={AI_COLOR} label="AI 补充" />
          )}
        </div>
      </div>

      {/* 未定位列表 */}
      {failed.length > 0 && (
        <div className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-100">
          <div className="font-medium">以下地点未能在地图上定位：</div>
          <div className="mt-1">
            {failed.map((p) => p.name).join("、")}
          </div>
          <div className="mt-1 text-amber-600/80">
            可能是地名不规范或暂无收录，行程视图仍可正常查看
          </div>
        </div>
      )}

      {status === "loading" && (
        <div className="text-center text-xs text-ink-500">加载地图组件中…</div>
      )}
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span
        style={{ background: color }}
        className="inline-block h-2.5 w-2.5 rounded-full"
      />
      {label}
    </span>
  );
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
