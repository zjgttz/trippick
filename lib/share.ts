/**
 * 协同分享：把当前用户的决策状态编码到 URL 参数。
 * 第二个用户打开链接后，可以看到伙伴选择并自己投票，
 * 最终交集高亮、分歧标注 ⚡。
 */

import type { DecisionStatus } from "./store";

const PARAM = "s";

/** decisions 简化压缩：只保留 accepted/pending 项 */
function encodeDecisions(d: Record<string, DecisionStatus>): string {
  const compact: Record<string, "a" | "p"> = {};
  for (const [k, v] of Object.entries(d)) {
    if (v === "accepted") compact[k] = "a";
    else if (v === "pending") compact[k] = "p";
  }
  const json = JSON.stringify(compact);
  if (typeof window === "undefined") return Buffer.from(json).toString("base64url");
  // browser: btoa 处理 unicode
  return btoaUtf8(json);
}

function decodeDecisions(s: string): Record<string, DecisionStatus> | null {
  try {
    const json =
      typeof window === "undefined"
        ? Buffer.from(s, "base64url").toString()
        : atobUtf8(s);
    const c = JSON.parse(json) as Record<string, "a" | "p">;
    const r: Record<string, DecisionStatus> = {};
    for (const [k, v] of Object.entries(c)) {
      r[k] = v === "a" ? "accepted" : "pending";
    }
    return r;
  } catch {
    return null;
  }
}

function btoaUtf8(s: string): string {
  // 把 UTF-8 字符串安全 base64url
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function atobUtf8(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function buildShareURL(decisions: Record<string, DecisionStatus>): string {
  if (typeof window === "undefined") return "";
  const url = new URL(window.location.origin + "/itinerary");
  url.searchParams.set(PARAM, encodeDecisions(decisions));
  url.searchParams.set("from", "share");
  return url.toString();
}

export function readPartnerFromURL(): Record<string, DecisionStatus> | null {
  if (typeof window === "undefined") return null;
  const sp = new URLSearchParams(window.location.search);
  const s = sp.get(PARAM);
  if (!s) return null;
  return decodeDecisions(s);
}
