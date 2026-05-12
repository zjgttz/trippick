/**
 * 按地理位置重排行程 slots（贪心最近邻）
 *
 * 目的：LLM 生成的行程经常出现"断桥 → 西溪湿地 → 苏堤"这种两头跑的动线，
 * 因为 LLM 不知道地理距离。这个函数在 LLM 输出之上做后处理重排，让同一天
 * 内的地点按地理距离顺路串联。
 *
 * 策略：
 * 1. 每一天独立处理（不跨天优化）。
 * 2. 收集该天**景点 + 餐厅**类的有坐标地点 → 用贪心最近邻排序。
 *    起点 = 该天 morning 第一个有坐标的地点（保持 LLM 给的"从哪开始"语义）；
 *    若 morning 没坐标，取该天第一个有坐标的。
 * 3. 重新切回时段：按 LLM 原本的"每个时段地点数"分配（如 morning 2 个 / afternoon 3 个 / evening 1 个）。
 * 4. **住宿（type=住宿）**：锚定在 evening 末尾，不参与重排。
 * 5. **交通（type=交通）**：不参与重排，保留原 slot 原位置（通常是 morning 第一个）。
 * 6. **无坐标的自定义条目**（用户手动加的字符串）：放在所属 slot 最前，不参与排序。
 * 7. 失败回退：若有效坐标 < 2 个，原样返回，不动。
 *
 * 注意：这个函数只读 `analysis.items` 拿 type 信息；坐标来自 /api/geocode 的结果。
 */

import type { ItineraryDay, ItinerarySlot, POIItem, TimeSlot } from "./schema";

type Coord = { lat: number; lng: number };
type CoordMap = Record<string, Coord | null>;

const SLOTS: TimeSlot[] = ["morning", "afternoon", "evening"];

/** 每个时段的硬容量上限（景点+餐厅计）。上午/下午 3、晚上 2，避免 LLM 塑上午塑 5 个走不完的情况。 */
const SLOT_CAPACITY_MAX: Record<TimeSlot, number> = {
  morning: 3,
  afternoon: 3,
  evening: 2,
};

/** 离群点阈值：距离主群重心 > 8km 的点会被拿出来单独占一个 slot。 */
const OUTLIER_DISTANCE_KM = 8;

/** 计算一组点的几何中心（均值）。 */
function centerOf(coords: Coord[]): Coord {
  let lat = 0;
  let lng = 0;
  for (const c of coords) {
    lat += c.lat;
    lng += c.lng;
  }
  return { lat: lat / coords.length, lng: lng / coords.length };
}

/** Haversine 距离（公里）。同城几公里量级，精度够用。 */
function distanceKm(a: Coord, b: Coord): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sa =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(sa));
}

/** 贪心最近邻：从 start 开始，每次挑离当前最近的下一个点。O(n²) 对 n≤20 完全够用。 */
function nearestNeighborOrder(
  names: string[],
  coords: CoordMap,
  startName: string,
): string[] {
  const remaining = new Set(names);
  if (!remaining.has(startName)) {
    // start 不在候选里（理论上不会发生），任选一个
    const first = names[0];
    if (!first) return [];
    return nearestNeighborOrder(names, coords, first);
  }
  const order: string[] = [startName];
  remaining.delete(startName);
  let cur = coords[startName];
  while (remaining.size > 0 && cur) {
    let bestName: string | null = null;
    let bestDist = Infinity;
    for (const n of remaining) {
      const c = coords[n];
      if (!c) continue;
      const d = distanceKm(cur, c);
      if (d < bestDist) {
        bestDist = d;
        bestName = n;
      }
    }
    if (!bestName) break;
    order.push(bestName);
    remaining.delete(bestName);
    cur = coords[bestName];
  }
  // 没坐标的剩余项目追到末尾，保持原顺序
  for (const n of names) if (remaining.has(n)) order.push(n);
  return order;
}

/** 给地点名称查 type（如果在 items 名册里）。 */
function getType(name: string, items: POIItem[]): POIItem["type"] | null {
  const hit = items.find((i) => i.name === name);
  return hit ? hit.type : null;
}

/**
 * 重排一天的 slots：
 * - 景点+餐厅：按贪心最近邻全局排序，再按原 slot 容量切回时段
 * - 住宿：保留在 evening 末尾
 * - 交通：保留在原 slot 头部
 * - 无坐标自定义条目：保留在原 slot 头部（交通之后）
 */
function reorderDay(
  day: ItineraryDay,
  items: POIItem[],
  coords: CoordMap,
): ItineraryDay {
  // 1. 拆分原 slots 的每个条目
  type Bucket = {
    transport: string[]; // 交通，保留原 slot
    customNoCoord: string[]; // 无坐标的自定义条目，保留原 slot
    poolMembers: string[]; // 景点 + 餐厅，参与全局重排（带坐标）
    poolNoCoord: string[]; // 景点 + 餐厅 但没坐标，保留原 slot 头部
    lodging: string[]; // 住宿，锚定 evening 末尾
  };
  const buckets: Record<TimeSlot, Bucket> = {
    morning: { transport: [], customNoCoord: [], poolMembers: [], poolNoCoord: [], lodging: [] },
    afternoon: { transport: [], customNoCoord: [], poolMembers: [], poolNoCoord: [], lodging: [] },
    evening: { transport: [], customNoCoord: [], poolMembers: [], poolNoCoord: [], lodging: [] },
  };
  for (const slot of day.slots) {
    const t = slot.time_slot;
    for (const name of slot.items) {
      const type = getType(name, items);
      const hasCoord = !!coords[name];
      if (type === "住宿") {
        buckets[t].lodging.push(name);
      } else if (type === "交通") {
        buckets[t].transport.push(name);
      } else if (type === null) {
        // 不在名册里 = 用户自定义条目
        buckets[t].customNoCoord.push(name);
      } else if (hasCoord) {
        // 景点 / 餐厅 / 其他 + 有坐标
        buckets[t].poolMembers.push(name);
      } else {
        buckets[t].poolNoCoord.push(name);
      }
    }
  }

  // 2. 收集全天参与重排的池子
  const allPool: string[] = [
    ...buckets.morning.poolMembers,
    ...buckets.afternoon.poolMembers,
    ...buckets.evening.poolMembers,
  ];

  // 有效坐标 < 2 → 不够算距离，原样返回
  if (allPool.length < 2) return day;

  // 3. 【v2.1 增强】离群点检测：用中位数距离判别哪些点距离主群 > 8km，单独路由到下午/晚上
  const allCoords = allPool.map((n) => coords[n]!).filter(Boolean);
  const center = centerOf(allCoords);
  const distances = allPool.map((n) => ({ name: n, dist: distanceKm(coords[n]!, center) }));
  // 如果所有点都距离中心 > 8km，说明是均勺分布（不是“一主点 + outlier”），不拆
  const mainPool = distances.filter((d) => d.dist <= OUTLIER_DISTANCE_KM).map((d) => d.name);
  const outliers = distances.filter((d) => d.dist > OUTLIER_DISTANCE_KM).map((d) => d.name);
  // 安全阈值：主群 ≥ 2 才认为拆出 outlier 是可靠的。否则全体当主池。
  const finalMain = mainPool.length >= 2 ? mainPool : allPool;
  const finalOutliers = mainPool.length >= 2 ? outliers : [];

  // 4. 主池贪心最近邻
  // 起点：主池里原本在 morning 的第一个点（保留 LLM “从哪开始”的语义）；没有就主池第一个
  const startName =
    buckets.morning.poolMembers.find((n) => finalMain.includes(n)) ??
    buckets.afternoon.poolMembers.find((n) => finalMain.includes(n)) ??
    buckets.evening.poolMembers.find((n) => finalMain.includes(n)) ??
    finalMain[0]!;
  const orderedMain = nearestNeighborOrder(finalMain, coords, startName);

  // 5. 【v2.1 增强】按硬容量上限填时段 + outlier 单独占半天
  const newPool: Record<TimeSlot, string[]> = { morning: [], afternoon: [], evening: [] };
  let cursor = 0;
  // 先填主池到 morning（上限 3）
  for (const t of SLOTS) {
    const cap = SLOT_CAPACITY_MAX[t];
    // outlier 会独占 1 个位置，预留：下午优先留给 outlier
    let availableCap = cap;
    if (t === "afternoon" && finalOutliers.length > 0) {
      availableCap = Math.max(1, cap - finalOutliers.length); // 给 outlier 留位
    }
    newPool[t] = orderedMain.slice(cursor, cursor + availableCap);
    cursor += availableCap;
  }
  // 主池还没填完？追加到 afternoon 末尾（超出容量）
  if (cursor < orderedMain.length) {
    newPool.afternoon.push(...orderedMain.slice(cursor));
  }
  // outliers 填入 afternoon（首选）；若 afternoon 已满则 evening
  for (const o of finalOutliers) {
    if (newPool.afternoon.length < SLOT_CAPACITY_MAX.afternoon) {
      newPool.afternoon.push(o);
    } else {
      newPool.evening.push(o);
    }
  }

  // 6. 组装回 slots：交通 → 自定义无坐标 → 景点/餐厅(重排后) → 景点/餐厅(无坐标) → 住宿(仅 evening)
  const newSlots: ItinerarySlot[] = SLOTS.map((t) => {
    const b = buckets[t];
    const isEvening = t === "evening";
    const items = [
      ...b.transport,
      ...b.customNoCoord,
      ...newPool[t],
      ...b.poolNoCoord,
      ...(isEvening ? buckets.morning.lodging.concat(buckets.afternoon.lodging, b.lodging) : []),
    ];
    // 找回原 slot 的 note
    const origSlot = day.slots.find((s) => s.time_slot === t);
    return {
      time_slot: t,
      items,
      note: origSlot?.note ?? "",
    };
  });

  return { day: day.day, slots: newSlots };
}

/**
 * 入口：把整个 itinerary 按天重排。
 *
 * @param itinerary  原行程（一般来自 finalItinerary）
 * @param items      POI 名册（analysis.items）
 * @param coords     /api/geocode 返回的坐标表（name → {lat,lng} | null）
 * @returns          重排后的 itinerary。若 coords 为空 / 都失败，原样返回。
 */
export function reorderItineraryByGeo(
  itinerary: ItineraryDay[],
  items: POIItem[],
  coords: CoordMap,
): ItineraryDay[] {
  if (!coords || Object.keys(coords).length === 0) return itinerary;
  // 有效坐标数（非 null）
  const validCount = Object.values(coords).filter(Boolean).length;
  if (validCount < 2) return itinerary;

  return itinerary.map((day) => reorderDay(day, items, coords));
}
