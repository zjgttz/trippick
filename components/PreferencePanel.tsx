"use client";

import { useEffect, useState } from "react";
import {
  loadPreferences,
  savePreferences,
  STYLE_OPTIONS,
  type UserPreferences,
  type DurationKey,
} from "@/lib/preferences";

const DURATION_OPTIONS: Array<{ value: DurationKey; label: string }> = [
  { value: "any", label: "随意" },
  { value: "day1", label: "🌅 一日游" },
  { value: "day2", label: "🌙 两日一夜" },
  { value: "day3", label: "🌙 三日两夜" },
  { value: "day4", label: "🌙 四日三夜" },
  { value: "week1", label: "🗓️ 一周游" },
  { value: "week_plus", label: "🌍 一周以上" },
];

const BUDGET_OPTIONS: Array<{ value: UserPreferences["budget"]; label: string }> = [
  { value: "any", label: "随意" },
  { value: "budget", label: "💸 学生党" },
  { value: "mid", label: "🍱 中等" },
  { value: "premium", label: "✨ 高品质" },
];

const PARTY_OPTIONS: Array<{ value: UserPreferences["party_size"]; label: string }> = [
  { value: "any", label: "随意" },
  { value: "solo", label: "🚶 一人" },
  { value: "couple", label: "💑 情侣" },
  { value: "family", label: "👨‍👩‍👧 亲子" },
  { value: "group", label: "👥 朋友团" },
];

interface Props {
  /** 偏好变化时回调（父组件用于在分析时拼 prompt） */
  onChange?: (prefs: UserPreferences) => void;
  /** 折叠状态 */
  defaultOpen?: boolean;
}

export function PreferencePanel({ onChange, defaultOpen = false }: Props) {
  const [prefs, setPrefs] = useState<UserPreferences | null>(null);
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    const p = loadPreferences();
    setPrefs(p);
    onChange?.(p);
    // 检测是否之前存过偏好,有则自动展开
    if (
      p.budget !== "any" ||
      p.party_size !== "any" ||
      (p.duration && p.duration !== "any") ||
      p.styles.length > 0
    ) {
      setOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!prefs) return null;

  const update = (patch: Partial<UserPreferences>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    savePreferences(patch);
    onChange?.(next);
  };

  const toggleStyle = (style: string) => {
    const exists = prefs.styles.includes(style);
    const next = exists
      ? prefs.styles.filter((s) => s !== style)
      : [...prefs.styles, style];
    update({ styles: next });
  };

  const hasAny =
    prefs.budget !== "any" ||
    prefs.party_size !== "any" ||
    (prefs.duration && prefs.duration !== "any") ||
    prefs.styles.length > 0;

  return (
    <div className="rounded-2xl bg-white ring-1 ring-ink-100">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
        type="button"
      >
        <span className="flex items-center gap-2 text-sm font-medium text-ink-900">
          <span>🎯</span>
          我的旅行偏好
          {hasAny && (
            <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs text-brand-600">
              已设置
            </span>
          )}
        </span>
        <span className="text-ink-400">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className="border-t border-ink-100 px-4 py-3 space-y-3">
          <div>
            <div className="mb-1.5 text-xs text-ink-500">行程时长</div>
            <div className="flex flex-wrap gap-1.5">
              {DURATION_OPTIONS.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => update({ duration: d.value })}
                  className={`rounded-full px-3 py-1 text-xs ring-1 transition ${
                    (prefs.duration ?? "any") === d.value
                      ? "bg-brand-500 text-white ring-brand-500"
                      : "bg-white text-ink-700 ring-ink-200 hover:ring-brand-200"
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1.5 text-xs text-ink-500">预算</div>
            <div className="flex flex-wrap gap-1.5">
              {BUDGET_OPTIONS.map((b) => (
                <button
                  key={b.value}
                  type="button"
                  onClick={() => update({ budget: b.value })}
                  className={`rounded-full px-3 py-1 text-xs ring-1 transition ${
                    prefs.budget === b.value
                      ? "bg-brand-500 text-white ring-brand-500"
                      : "bg-white text-ink-700 ring-ink-200 hover:ring-brand-200"
                  }`}
                >
                  {b.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1.5 text-xs text-ink-500">同行人</div>
            <div className="flex flex-wrap gap-1.5">
              {PARTY_OPTIONS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => update({ party_size: p.value })}
                  className={`rounded-full px-3 py-1 text-xs ring-1 transition ${
                    prefs.party_size === p.value
                      ? "bg-brand-500 text-white ring-brand-500"
                      : "bg-white text-ink-700 ring-ink-200 hover:ring-brand-200"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1.5 text-xs text-ink-500">
              偏好风格（多选）
            </div>
            <div className="flex flex-wrap gap-1.5">
              {STYLE_OPTIONS.map((s) => {
                const on = prefs.styles.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleStyle(s)}
                    className={`rounded-full px-3 py-1 text-xs ring-1 transition ${
                      on
                        ? "bg-accent-500 text-ink-900 ring-accent-500"
                        : "bg-white text-ink-700 ring-ink-200 hover:ring-accent-300"
                    }`}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          </div>

          {hasAny && (
            <p className="text-xs text-ink-500">
              ✨ AI 会根据这些偏好优先推荐你可能喜欢的地点。
            </p>
          )}
        </div>
      )}
    </div>
  );
}
