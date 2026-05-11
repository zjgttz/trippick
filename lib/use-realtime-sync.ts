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

/**
 * 在页面挂载时启用本机多标签实时协同。
 *
 * 功能：
 *  1. 自动 connect 到 tripId 频道
 *  2. 监听到伙伴的 decision 改动 → 更新 partnerDecisions
 *  3. 自己 decisions 变化（不是来自远端的）→ broadcast 全量快照
 *  4. 暴露 "在线人数"（其他标签页发过 hello 的 clientId 计数）
 */
export function useRealtimeSync(enabled: boolean = true): {
  tripId: string;
  peerCount: number;
  lastPeerUpdate: number | null;
} {
  const decisions = useTripPickStore((s) => s.decisions);
  const setPartnerDecisions = useTripPickStore((s) => s.setPartnerDecisions);
  const partnerDecisions = useTripPickStore((s) => s.partnerDecisions);

  const [tripId, setTripId] = useState("");
  const [peers, setPeers] = useState<Map<string, number>>(new Map());
  const [lastPeerUpdate, setLastPeerUpdate] = useState<number | null>(null);

  // 标记本次 decisions 变化是不是收到远端事件触发的（避免广播回环）
  const skipBroadcastRef = useRef(false);

  // 初始化：connect
  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;
    const id = getOrCreateTripId();
    setTripId(id);
    connectTrip(id);
    return () => {
      disconnect();
    };
  }, [enabled]);

  // 订阅远端事件
  useEffect(() => {
    if (!enabled) return;
    const off = onSync((e: SyncEvent) => {
      // 维护 peer 列表
      setPeers((prev) => {
        const next = new Map(prev);
        next.set(e.clientId, Date.now());
        return next;
      });

      if (e.type === "decision" && e.payload?.snapshot) {
        skipBroadcastRef.current = true;
        // 把远端整张 decisions 表合并到 partnerDecisions
        setPartnerDecisions(e.payload.snapshot as Record<string, DecisionStatus>);
        setLastPeerUpdate(Date.now());
        // 微任务后释放，避免下一次本地变化被吞
        queueMicrotask(() => {
          skipBroadcastRef.current = false;
        });
      } else if (e.type === "hello") {
        // 新加入的标签页向它回复当前 decisions
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

  // 自己 decisions 变化 → 广播
  useEffect(() => {
    if (!enabled) return;
    if (skipBroadcastRef.current) return;
    if (!tripId) return;
    // 只在有内容时广播，避免初始空对象触发
    if (Object.keys(decisions).length === 0) return;
    broadcast({
      type: "decision",
      payload: { name: "__sync__", status: "unset", snapshot: decisions },
    });
  }, [decisions, enabled, tripId]);

  // 清理超过 60s 没活跃的 peer
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
  };
}
