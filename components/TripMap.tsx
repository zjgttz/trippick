"use client";

import { useEffect, useRef, useState } from "react";

const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";

export interface MapPOI {
  name: string;
  lat: number;
  lng: number;
  type?: string;
  source?: "user_note" | "ai_recommended";
  recommended_reasons?: string[];
}

interface TripMapProps {
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

function loadLeaflet(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject("ssr");
  if (window.L) return Promise.resolve(window.L);
  if (window.__leafletLoading) return window.__leafletLoading;

  window.__leafletLoading = new Promise((resolve, reject) => {
    // CSS
    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = LEAFLET_CSS;
      document.head.appendChild(link);
    }
    // JS
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

export function TripMap({ pois, city }: TripMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    loadLeaflet()
      .then((L) => {
        if (cancelled || !containerRef.current) return;
        if (mapRef.current) return; // already initialized

        // 初始中心：第一个有坐标的 POI，否则 fallback 到中国大致中心
        const valid = pois.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
        const center =
          valid.length > 0
            ? [valid[0]!.lat, valid[0]!.lng]
            : [35.0, 105.0]; // 中国大致中心

        // v2.0 修复：移动端体验优化 — 默认禁用滚轮/两指手势避免误触，点击地图后启用
        const isMobile = typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches;
        const map = L.map(containerRef.current, {
          scrollWheelZoom: !isMobile,
          touchZoom: true,
          tap: true,
          // 手机上默认不拖拽，点击启用（避免页面滚动被拦截）
          dragging: !isMobile,
        }).setView(center, valid.length > 0 ? 12 : 4);
        mapRef.current = map;

        // 手机点击地图后才启用拖拽
        if (isMobile) {
          const enableDragging = () => {
            map.dragging.enable();
            containerRef.current?.removeEventListener("click", enableDragging);
          };
          containerRef.current.addEventListener("click", enableDragging);
        }

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        }).addTo(map);

        const markers: any[] = [];
        for (const p of valid) {
          // 自定义 icon: ai_recommended 用紫色，其他用品牌色橙
          const isAI = p.source === "ai_recommended";
          const color = isAI ? "#9333ea" : "#f97316";
          // v2.0 修复：手机上名称太长会重叠，限制最大宽度 + 省10 字截断
          const displayName = p.name.length > 10 ? p.name.slice(0, 9) + "…" : p.name;
          const icon = L.divIcon({
            className: "trippick-marker",
            html: `
              <div style="
                background:${color};
                color:white;
                border:2px solid white;
                box-shadow:0 2px 8px rgba(0,0,0,0.2);
                border-radius:999px;
                padding:3px 8px;
                font-size:11px;
                font-weight:600;
                white-space:nowrap;
                font-family:system-ui,sans-serif;
                max-width:140px;
                overflow:hidden;
                text-overflow:ellipsis;
              ">
                ${isAI ? "✨ " : ""}${escapeHtml(displayName)}
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
          marker.bindPopup(`
            <div style="font-family:system-ui;min-width:160px">
              <div style="font-weight:600;font-size:14px;">${escapeHtml(p.name)}</div>
              ${p.type ? `<div style="font-size:11px;color:#888;margin-top:2px;">${escapeHtml(p.type)}</div>` : ""}
              ${reasonsHtml}
            </div>
          `);
          markers.push(marker);
        }

        if (valid.length > 1) {
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
    // 只在 pois 列表变化（按 name 拼接）时重建地图
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pois.map((p) => p.name).join("|")]);

  if (status === "error") {
    return (
      <div className="rounded-2xl bg-white p-10 text-center text-ink-500 ring-1 ring-ink-100">
        地图加载失败，请检查网络或稍后重试
      </div>
    );
  }

  const validCount = pois.filter(
    (p) => Number.isFinite(p.lat) && Number.isFinite(p.lng),
  ).length;

  return (
    <div className="space-y-2">
      {/* v2.0 修复：手机高度 320px 避免占满屏，桌面 480px */}
      <div
        ref={containerRef}
        className="h-[320px] w-full overflow-hidden rounded-2xl ring-1 ring-ink-100 sm:h-[480px]"
        style={{ background: "#f8fafc" }}
      />
      <p className="text-center text-xs text-ink-400 sm:hidden">
        👆 点击地图后可拖动、双指缩放
      </p>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-500">
        <div>
          地图基于 OpenStreetMap，标注了 {validCount} 个地点
          {validCount < pois.length && (
            <span className="ml-2 text-amber-600">
              · {pois.length - validCount} 个未能定位
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1">
            <span
              style={{ background: "#f97316" }}
              className="inline-block h-2.5 w-2.5 rounded-full"
            />
            笔记提取
          </span>
          <span className="inline-flex items-center gap-1">
            <span
              style={{ background: "#9333ea" }}
              className="inline-block h-2.5 w-2.5 rounded-full"
            />
            AI 补充
          </span>
        </div>
      </div>
      {status === "loading" && (
        <div className="text-center text-xs text-ink-500">加载地图组件中…</div>
      )}
    </div>
  );
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
