"use client";

import { useEffect, useRef, useState } from "react";
import {
  connectTrip,
  disconnect,
  onSync,
  broadcast,
  getOrCreateTripId,
  type SyncEvent,
} from "./realtime-sync";
import { useTripPickStore, type DecisionStatus } from "./store";
import type { AnalysisResult } from "./schema";

/**
 * v2.0 跨设备实时协同 Hook
 *
 * 两层同步：
 *   1. BroadcastChannel（同源标签页，~10ms 延迟）—— 浏览器内多 tab 演示
 *   2. KV polling（跨设备，2s 间隔）—— 真正的多设备/多手机协同
 *
 * 数据流：
 *   本地改 decisions → debounce → PUT /api/trip/[id] → 远端 polling 命中新版本 → 更新 partnerDecisions
 */

const POLL_INTERVAL_MS = 2500;
const PUSH_DEBOUNCE_MS = 600;

export function useRealtimeSync(enabled: boolean = true): {
  tripId: string;
  peerCount: number;
  lastPeerUpdate: number | null;
  kvConnected: boolean;
} {
  const decisions = useTripPickStore((s) => s.decisions);
  const setPartnerDecisions = useTripPickStore((s) => s.setPartnerDecisions);
  const analysis = useTripPickStore((s) => s.analysis);
  const setAnalysis = useTripPickStore((s) => s.setAnalysis);

  const [tripId, setTripId] = useState("");
  const [peers, setPeers] = useState<Map<string, number>>(new Map());
  const [lastPeerUpdate, setLastPeerUpdate] = useState<number | null>(null);
  const [kvConnected, setKvConnected] = useState(false);

  // 避免回环：远端 patch 后短暂不广播 / 不推送
  const skipBroadcastRef = useRef(false);
  // 客户端 ID（仅在浏览器存在）
  const clientIdRef = useRef("");
  // 远端最新版本号
  const lastVersionRef = useRef(-1);
  // pending 推送（debounce）
  const pushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ---------- 初始化 trip_id 和 BroadcastChannel ---------- */
  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;
    const id = getOrCreateTripId();
    setTripId(id);
    // BroadcastChannel 同源同步（即时）
    connectTrip(id);
    // 生成 clientId
    if (!clientIdRef.current) {
      clientIdRef.current = `c_${Math.random().toString(36).slice(2, 10)}`;
    }
    return () => {
      disconnect();
      if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
    };
  }, [enabled]);

  /* ---------- BroadcastChannel 监听（同源标签页） ---------- */
  useEffect(() => {
    if (!enabled) return;
    const off = onSync((e: SyncEvent) => {
      setPeers((prev) => {
        const next = new Map(prev);
        next.set(e.clientId, Date.now());
        return next;
      });

      if (e.type === "decision" && e.payload?.snapshot) {
        skipBroadcastRef.current = true;
        setPartnerDecisions(e.payload.snapshot as Record<string, DecisionStatus>);
        setLastPeerUpdate(Date.now());
        queueMicrotask(() => {
          skipBroadcastRef.current = false;
        });
      } else if (e.type === "hello") {
        const my = useTripPickStore.getState().decisions;
        if (Object.keys(my).length > 0) {
          broadcast({
            type: "decision",
            payload: { name: "__init__", status: "unset", snapshot: my },
          });
        }
      }
    });
    return off;
  }, [enabled, setPartnerDecisions]);

  /* ---------- KV polling（跨设备） ---------- */
  useEffect(() => {
    if (!enabled) return;
    if (!tripId) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      try {
        const sinceParam =
          lastVersionRef.current >= 0 ? `?since=${lastVersionRef.current}` : "";
        const res = await fetch(`/api/trip/${tripId}${sinceParam}`, {
          cache: "no-store",
        });
        if (!res.ok) {
          setKvConnected(false);
          return;
        }
        setKvConnected(true);
        const data = await res.json();
        if (cancelled) return;
        if (data.ok && data.changed && data.state) {
          const state = data.state as {
            version: number;
            decisions: Record<string, string>;
            analysis?: unknown;
            last_client_id?: string;
          };
          lastVersionRef.current = state.version;
          // 忽略自己刚推上去的版本
          if (state.last_client_id !== clientIdRef.current) {
            skipBroadcastRef.current = true;
            setPartnerDecisions(state.decisions as Record<string, DecisionStatus>);
            setLastPeerUpdate(Date.now());
            // 如果伙伴推了分析结果且本地还没有 → 同步过来
            if (state.analysis && !useTripPickStore.getState().analysis) {
              setAnalysis(state.analysis as AnalysisResult);
            }
            queueMicrotask(() => {
              skipBroadcastRef.current = false;
            });
            // 标记一个虚拟 peer（跨设备协同显示）
            setPeers((prev) => {
              const next = new Map(prev);
              next.set(state.last_client_id || "kv_peer", Date.now());
              return next;
            });
          }
        }
      } catch {
        setKvConnected(false);
      } finally {
        if (!cancelled) {
          timer = setTimeout(poll, POLL_INTERVAL_MS);
        }
      }
    }

    // 第一次立即拉一次
    poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [enabled, tripId, setPartnerDecisions, setAnalysis]);

  /* ---------- 本地 decisions / analysis 变化 → 推 KV + BC ---------- */
  useEffect(() => {
    if (!enabled) return;
    if (skipBroadcastRef.current) return;
    if (!tripId) return;
    if (Object.keys(decisions).length === 0 && !analysis) return;

    // BroadcastChannel：即时广播（同源标签页）
    if (Object.keys(decisions).length > 0) {
      broadcast({
        type: "decision",
        payload: { name: "__sync__", status: "unset", snapshot: decisions },
      });
    }

    // KV 推送 debounce
    if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
    pushTimerRef.current = setTimeout(() => {
      fetch(`/api/trip/${tripId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decisions,
          analysis,
          client_id: clientIdRef.current,
        }),
      })
        .then((r) => r.json())
        .then((d) => {
          if (d.ok && typeof d.version === "number") {
            lastVersionRef.current = d.version;
            setKvConnected(true);
          }
        })
        .catch(() => setKvConnected(false));
    }, PUSH_DEBOUNCE_MS);
  }, [decisions, analysis, enabled, tripId]);

  /* ---------- 清理 60s 内不活跃的 peer ---------- */
  useEffect(() => {
    const interval = setInterval(() => {
      setPeers((prev) => {
        const now = Date.now();
        const next = new Map(prev);
        for (const [k, ts] of next) {
          if (now - ts > 60_000) next.delete(k);
        }
        return next;
      });
    }, 15_000);
    return () => clearInterval(interval);
  }, []);

  return {
    tripId,
    peerCount: peers.size,
    lastPeerUpdate,
    kvConnected,
  };
}
