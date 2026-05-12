/**
 * v2.0 M5：本机多标签实时同步（BroadcastChannel）
 *
 * 真正的 WebSocket 多人协同需要服务端长连接 + 共享存储（Vercel KV / Supabase），
 * 等用户起床后授权 KV 再扩展。
 *
 * 在此之前，BroadcastChannel 提供了一个真实的"准协同"体验：
 *   同一浏览器多标签页打开同一份 trip 时，决策实时同步。
 *   适合 demo / 现场演示 / 自己开两个标签页测试协同。
 *
 * 工作流程：
 *   1. 拿 tripId（来自 URL / 本地存储 / 新生成）作为 channel name
 *   2. 自己每次 setDecision 时 broadcast 出去
 *   3. 收到他人 broadcast 时 patch 自己的 partnerDecisions
 */

import type { DecisionStatus } from "./store";

const CHANNEL_PREFIX = "trippick:trip:";
const TRIP_ID_KEY = "trippick.trip_id";

export interface SyncEvent {
  type: "decision" | "hello" | "presence";
  tripId: string;
  clientId: string;
  ts: number;
  payload?: any;
}

export type SyncHandler = (e: SyncEvent) => void;

let channel: BroadcastChannel | null = null;
let currentTripId = "";
const handlers = new Set<SyncHandler>();
let clientId = "";

function ensureClientId(): string {
  if (clientId) return clientId;
  if (typeof window === "undefined") return "ssr";
  let id = sessionStorage.getItem("trippick.client_id");
  if (!id) {
    id = `c_${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem("trippick.client_id", id);
  }
  clientId = id;
  return id;
}

/** 生成短 trip_id */
export function newTripId(): string {
  return `t_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** 从 URL ?trip=... 或本地存储获取 trip_id，没有就新建 */
export function getOrCreateTripId(): string {
  if (typeof window === "undefined") return "";
  const sp = new URLSearchParams(window.location.search);
  const fromURL = sp.get("trip");
  if (fromURL) {
    localStorage.setItem(TRIP_ID_KEY, fromURL);
    return fromURL;
  }
  const stored = localStorage.getItem(TRIP_ID_KEY);
  if (stored) return stored;
  const fresh = newTripId();
  localStorage.setItem(TRIP_ID_KEY, fresh);
  return fresh;
}

/** 连接到 trip 频道 */
export function connectTrip(tripId: string): void {
  if (typeof window === "undefined") return;
  if (typeof BroadcastChannel === "undefined") return;
  if (channel && currentTripId === tripId) return;
  if (channel) channel.close();
  currentTripId = tripId;
  channel = new BroadcastChannel(CHANNEL_PREFIX + tripId);
  channel.onmessage = (ev) => {
    const data = ev.data as SyncEvent;
    if (!data || data.tripId !== tripId) return;
    if (data.clientId === ensureClientId()) return; // ignore self
    for (const h of handlers) h(data);
  };
  // hello（让其他标签页通知它们当前的 decisions）
  broadcast({ type: "hello" });
}

export function disconnect(): void {
  if (channel) {
    channel.close();
    channel = null;
  }
  currentTripId = "";
  handlers.clear();
}

export function onSync(h: SyncHandler): () => void {
  handlers.add(h);
  return () => handlers.delete(h);
}

export function broadcast(p: { type: SyncEvent["type"]; payload?: any }): void {
  if (!channel || !currentTripId) return;
  const ev: SyncEvent = {
    type: p.type,
    tripId: currentTripId,
    clientId: ensureClientId(),
    ts: Date.now(),
    payload: p.payload,
  };
  channel.postMessage(ev);
}

/** 同步一条 decision 改动 */
export function broadcastDecision(
  name: string,
  status: DecisionStatus,
  allDecisions: Record<string, DecisionStatus>,
): void {
  broadcast({
    type: "decision",
    payload: { name, status, snapshot: allDecisions },
  });
}

/** 生成带 trip_id 的协同链接（短链友好） */
export function buildTripURL(tripId: string): string {
  if (typeof window === "undefined") return "";
  const url = new URL(window.location.origin + "/itinerary");
  url.searchParams.set("trip", tripId);
  url.searchParams.set("from", "share");
  return url.toString();
}
