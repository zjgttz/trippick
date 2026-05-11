import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * 反向地理编码代理：把 POI 名称 + 城市 → 经纬度
 *
 * 用 OpenStreetMap Nominatim 公共服务（免费、无需 Key）。
 * Nominatim 政策要求 < 1 req/s，且必须带 User-Agent。
 * 我们在内存里缓存查询结果（实例生命周期）。
 */

// 简单内存缓存（每个 Vercel 实例独立）。命中即立即返回，无需限流。
const cache = new Map<string, { lat: number; lng: number } | null>();

interface NominatimHit {
  lat: string;
  lon: string;
  display_name: string;
}

async function nominatimQuery(
  name: string,
  city: string,
): Promise<{ lat: number; lng: number } | null> {
  const params = new URLSearchParams({
    q: `${name} ${city}`,
    format: "json",
    limit: "1",
    "accept-language": "zh-CN",
  });
  const url = `https://nominatim.openstreetmap.org/search?${params}`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "TripPick/2.0 (https://trippick-inky.vercel.app)",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as NominatimHit[];
    if (!data || data.length === 0) return null;
    const hit = data[0]!;
    return { lat: parseFloat(hit.lat), lng: parseFloat(hit.lon) };
  } catch {
    return null;
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function POST(req: NextRequest) {
  let body: { items?: string[]; city?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }

  const items = Array.isArray(body.items)
    ? body.items.filter((x): x is string => typeof x === "string" && !!x.trim()).slice(0, 20)
    : [];
  const city = (body.city || "").trim();

  if (items.length === 0 || !city) {
    return NextResponse.json({ ok: false, error: "missing_input" }, { status: 400 });
  }

  const results: Record<string, { lat: number; lng: number } | null> = {};
  let queriesIssued = 0;
  for (const name of items) {
    const key = `${city}|${name}`.toLowerCase();
    if (cache.has(key)) {
      results[name] = cache.get(key)!;
      continue;
    }
    // 未缓存：限流，第二次起前先 sleep 1.1s（Nominatim 1 req/s 政策）
    if (queriesIssued > 0) await sleep(1100);
    const coord = await nominatimQuery(name, city);
    cache.set(key, coord);
    results[name] = coord;
    queriesIssued++;
  }

  return NextResponse.json({ ok: true, coords: results });
}
