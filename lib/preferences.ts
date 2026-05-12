/**
 * v2.0 用户偏好记忆 (#5)
 *
 * 用 localStorage 持久化用户的旅行偏好，下次访问时自动应用。
 * 不需要登录、不上传服务器、完全本地。
 */

/** v2.0 行程时长（穿到 LLM，决定 itinerary_suggestion 天数） */
export type DurationKey =
  | "any"
  | "day1"
  | "day2"
  | "day3"
  | "day4"
  | "week1"
  | "week_plus";

export interface UserPreferences {
  /** 旅行预算等级 */
  budget: "budget" | "mid" | "premium" | "any";
  /** 同行人数 */
  party_size: "solo" | "couple" | "family" | "group" | "any";
  /** 时长（v2.0） */
  duration: DurationKey;
  /** 偏好风格标签 */
  styles: string[];
  /** 最近用过的目的地 */
  recent_destinations: string[];
  /** 更新时间 */
  updated_at: string;
}

const STORAGE_KEY = "trippick:preferences:v1";

const DEFAULT_PREFS: UserPreferences = {
  budget: "any",
  party_size: "any",
  duration: "any",
  styles: [],
  recent_destinations: [],
  updated_at: new Date().toISOString(),
};

/** 安全读取偏好（SSR 阶段返回默认值） */
export function loadPreferences(): UserPreferences {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<UserPreferences>;
    return { ...DEFAULT_PREFS, ...parsed };
  } catch {
    return DEFAULT_PREFS;
  }
}

/** 写入偏好 */
export function savePreferences(prefs: Partial<UserPreferences>): void {
  if (typeof window === "undefined") return;
  try {
    const current = loadPreferences();
    const next: UserPreferences = {
      ...current,
      ...prefs,
      updated_at: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // 静默失败，偏好丢失也无关紧要
  }
}

/** 添加最近目的地（最多保留 5 个，去重） */
export function pushRecentDestination(dest: string): void {
  if (!dest) return;
  const current = loadPreferences();
  const next = [
    dest,
    ...current.recent_destinations.filter((d) => d !== dest),
  ].slice(0, 5);
  savePreferences({ recent_destinations: next });
}

/** 时长 -> 天数的映射（给 LLM 用） */
export const DURATION_DAYS: Record<DurationKey, number | null> = {
  any: null,
  day1: 1,
  day2: 2,
  day3: 3,
  day4: 4,
  week1: 7,
  week_plus: 8, // 8天作为上限代表
};

/** 时长 -> 人话描述 */
export const DURATION_LABEL: Record<DurationKey, string> = {
  any: "随意",
  day1: "一日游",
  day2: "两日一夜",
  day3: "三日两夜",
  day4: "四日三夜",
  week1: "一周游",
  week_plus: "一周以上",
};

/** 把偏好渲染成 prompt 片段，给 LLM 用 */
export function preferencesToPromptHint(prefs: UserPreferences): string {
  const lines: string[] = [];

  // 时长放最前面，并明确提示天数要求
  if (prefs.duration && prefs.duration !== "any") {
    const days = DURATION_DAYS[prefs.duration];
    const label = DURATION_LABEL[prefs.duration];
    if (prefs.duration === "week_plus") {
      lines.push(`- 行程时长: ${label}（itinerary_suggestion 请排 8 天，严格出 8 个 day）`);
    } else if (days) {
      lines.push(`- 行程时长: ${label}（itinerary_suggestion 必须刚好排 ${days} 天，严格出 ${days} 个 day）`);
    }
  }

  const budgetMap: Record<string, string> = {
    budget: "学生党 / 低预算（人均日 200 元内）",
    mid: "中等预算（人均日 200-500 元）",
    premium: "高品质 / 预算充足（人均日 500+ 元）",
  };
  if (prefs.budget !== "any" && budgetMap[prefs.budget]) {
    lines.push(`- 预算偏好: ${budgetMap[prefs.budget]}`);
  }

  const partyMap: Record<string, string> = {
    solo: "独自旅行",
    couple: "情侣 / 二人",
    family: "亲子家庭",
    group: "多人朋友团",
  };
  if (prefs.party_size !== "any" && partyMap[prefs.party_size]) {
    lines.push(`- 同行人: ${partyMap[prefs.party_size]}`);
  }

  if (prefs.styles.length > 0) {
    lines.push(`- 偏好风格: ${prefs.styles.join(" / ")}`);
  }

  if (lines.length === 0) return "";

  return `\n\n用户旅行偏好（请优先推荐符合这些偏好的地点，调高它们的 confidence_score）：\n${lines.join("\n")}`;
}

export const STYLE_OPTIONS = [
  "美食",
  "拍照",
  "文化",
  "自然",
  "购物",
  "夜生活",
  "小众",
  "Citywalk",
  "亲子",
  "户外",
];
