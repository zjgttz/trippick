import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * 地理编码代理：POI 名称 + 城市 → 经纬度
 *
 * 策略（v2.0 修复定位错位）：
 * 1) 先 query 城市，拿到 bbox（boundingbox）
 * 2) 后续每个 POI 加 viewbox + bounded=1，强制结果落在城市范围内
 * 3) 失败的返回 null，前端不展示，比错位到外地好
 *
 * Nominatim 政策：< 1 req/s + User-Agent；内存缓存避免重查。
 */

// 缓存城市 bbox（"city" → bbox 字符串），独立于 POI 缓存
const cityBboxCache = new Map<string, string | null>();
// 缓存 POI 查询（"city|name" → coord | null）
const poiCache = new Map<string, { lat: number; lng: number } | null>();

interface NominatimHit {
  lat: string;
  lon: string;
  display_name: string;
  boundingbox?: [string, string, string, string];
}

const UA = "TripPick/2.0 (https://trippick.win)";
const NOMINATIM = "https://nominatim.openstreetmap.org/search";

async function fetchNominatim(params: URLSearchParams): Promise<NominatimHit[] | null> {
  try {
    const res = await fetch(`${NOMINATIM}?${params}`, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return (await res.json()) as NominatimHit[];
  } catch {
    return null;
  }
}

/** 查询城市 bbox。返回 Nominatim viewbox 格式："west,south,east,north"。 */
async function getCityBbox(city: string): Promise<string | null> {
  const key = city.toLowerCase();
  if (cityBboxCache.has(key)) return cityBboxCache.get(key)!;

  const params = new URLSearchParams({
    q: city,
    format: "json",
    limit: "1",
    "accept-language": "zh-CN",
  });
  const hits = await fetchNominatim(params);
  if (!hits || hits.length === 0 || !hits[0]!.boundingbox) {
    cityBboxCache.set(key, null);
    return null;
  }
  // Nominatim boundingbox 顺序：[south, north, west, east]
  const [south, north, west, east] = hits[0]!.boundingbox;
  // viewbox 顺序：west,south,east,north
  const viewbox = `${west},${south},${east},${north}`;
  cityBboxCache.set(key, viewbox);
  return viewbox;
}

/** 在 city bbox 内查 POI。命中返回坐标；查不到返回 null。 */
async function geocodePOI(
  name: string,
  city: string,
  viewbox: string | null,
): Promise<{ lat: number; lng: number } | null> {
  const params = new URLSearchParams({
    q: `${name} ${city}`,
    format: "json",
    limit: "1",
    "accept-language": "zh-CN",
  });
  if (viewbox) {
    params.set("viewbox", viewbox);
    params.set("bounded", "1");
  }
  const hits = await fetchNominatim(params);
  if (!hits || hits.length === 0) {
    // bounded 模式查不到，尝试一次去掉 bounded 但保留 viewbox 的"偏好"
    if (viewbox) {
      const fallback = new URLSearchParams({
        q: `${name} ${city}`,
        format: "json",
        limit: "1",
        "accept-language": "zh-CN",
        viewbox,
      });
      const hits2 = await fetchNominatim(fallback);
      if (!hits2 || hits2.length === 0) return null;
      // 校验返回坐标是否在 bbox 内（不在就丢掉，避免错位）
      const [w, s, e, n] = viewbox.split(",").map(parseFloat);
      const lat = parseFloat(hits2[0]!.lat);
      const lng = parseFloat(hits2[0]!.lon);
      if (lat < s! || lat > n! || lng < w! || lng > e!) return null;
      return { lat, lng };
    }
    return null;
  }
  return {
    lat: parseFloat(hits[0]!.lat),
    lng: parseFloat(hits[0]!.lon),
  };
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

  // 先获取城市 bbox（缓存命中则无网络请求）
  const viewbox = await getCityBbox(city);

  const results: Record<string, { lat: number; lng: number } | null> = {};
  let queriesIssued = viewbox && !cityBboxCache.has(city.toLowerCase()) ? 1 : 0;

  for (const name of items) {
    const key = `${city}|${name}`.toLowerCase();
    if (poiCache.has(key)) {
      results[name] = poiCache.get(key)!;
      continue;
    }
    if (queriesIssued > 0) await sleep(1100);
    const coord = await geocodePOI(name, city, viewbox);
    poiCache.set(key, coord);
    results[name] = coord;
    queriesIssued++;
  }

  return NextResponse.json({ ok: true, coords: results, city_viewbox: viewbox });
}
