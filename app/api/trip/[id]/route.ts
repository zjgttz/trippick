import { NextRequest, NextResponse } from "next/server";
import { getRedis, tripKey, TRIP_TTL_SECONDS } from "@/lib/kv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Trip state 读写 API
 *
 * GET  /api/trip/[id]?since=<version>   读取（含版本号，支持轮询）
 * PUT  /api/trip/[id]                    写入（合并 decisions）
 *
 * 数据结构（存在 Redis 里）：
 *   {
 *     version: number,                    // 单调递增，每次写 +1
 *     decisions: Record<string, status>,  // POI 名 -> accepted/rejected/maybe
 *     analysis?: AnalysisResult | null,   // 可选：协同时让伙伴看到同一份分析结果
 *     updated_at: number,                 // unix ms
 *     last_client_id?: string,            // 最后写入的客户端，避免回环
 *   }
 */

interface TripState {
  version: number;
  decisions: Record<string, string>;
  analysis?: unknown;
  updated_at: number;
  last_client_id?: string;
}

const EMPTY: TripState = {
  version: 0,
  decisions: {},
  analysis: null,
  updated_at: 0,
};

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  if (!id || id.length > 64) {
    return NextResponse.json({ ok: false, error: "bad_id" }, { status: 400 });
  }

  const redis = getRedis();
  if (!redis) {
    return NextResponse.json({ ok: false, error: "kv_unavailable" }, { status: 503 });
  }

  const sinceParam = req.nextUrl.searchParams.get("since");
  const since = sinceParam ? parseInt(sinceParam, 10) : -1;

  const data = (await redis.get<TripState>(tripKey(id))) || EMPTY;

  // 客户端版本已经是最新 → 返回 304-like 空响应
  if (since >= 0 && data.version <= since) {
    return NextResponse.json({ ok: true, changed: false, version: data.version });
  }

  return NextResponse.json({
    ok: true,
    changed: true,
    state: data,
  });
}

export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  if (!id || id.length > 64) {
    return NextResponse.json({ ok: false, error: "bad_id" }, { status: 400 });
  }

  let body: {
    decisions?: Record<string, string>;
    analysis?: unknown;
    client_id?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }

  const redis = getRedis();
  if (!redis) {
    return NextResponse.json({ ok: false, error: "kv_unavailable" }, { status: 503 });
  }

  const prev = (await redis.get<TripState>(tripKey(id))) || EMPTY;

  // 合并 decisions：以最新写入为准
  const mergedDecisions: Record<string, string> = {
    ...prev.decisions,
    ...(body.decisions || {}),
  };

  const next: TripState = {
    version: prev.version + 1,
    decisions: mergedDecisions,
    analysis: body.analysis ?? prev.analysis,
    updated_at: Date.now(),
    last_client_id: body.client_id,
  };

  await redis.set(tripKey(id), next, { ex: TRIP_TTL_SECONDS });

  return NextResponse.json({ ok: true, version: next.version });
}
