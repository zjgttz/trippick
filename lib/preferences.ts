/**
 * v2.0 用户偏好记忆 (#5)
 *
 * 用 localStorage 持久化用户的旅行偏好，下次访问时自动应用。
 * 不需要登录、不上传服务器、完全本地。
 */

export interface UserPreferences {
  /** 旅行预算等级 */
  budget: "budget" | "mid" | "premium" | "any";
  /** 同行人数 */
  party_size: "solo" | "couple" | "family" | "group" | "any";
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

/** 把偏好渲染成 prompt 片段，给 LLM 用 */
export function preferencesToPromptHint(prefs: UserPreferences): string {
  const lines: string[] = [];

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

  return `\n\n用户旅行偏好（请优先推荐符合这些偏好的 POI，调高它们的 confidence_score）：\n${lines.join("\n")}`;
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
