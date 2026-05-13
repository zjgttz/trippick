"use client";

import { useState } from "react";
import {
  CheckCircle2,
  AlertCircle,
  Map,
  AlertTriangle,
  Clock3,
  ClipboardList,
  Lightbulb,
  ChevronDown,
  ChevronUp,
  type LucideIcon,
} from "lucide-react";
import { type Conflict, type ConflictType } from "@/lib/schema";

interface Props {
  conflicts: Conflict[];
}

// v2.3: 本地重定义，不用 schema 里的 emoji icon
const CONFLICT_DISPLAY: Record<
  ConflictType,
  { label: string; Icon: LucideIcon; lineColor: string; iconColor: string }
> = {
  distance: {
    label: "距离较远",
    Icon: Map,
    lineColor: "bg-warn-distance/40",
    iconColor: "text-warn-distance",
  },
  opinion: {
    label: "口碑分歧",
    Icon: AlertTriangle,
    lineColor: "bg-warn-opinion/40",
    iconColor: "text-warn-opinion",
  },
  time_overload: {
    label: "同时段太多",
    Icon: Clock3,
    lineColor: "bg-warn-overload/40",
    iconColor: "text-warn-overload",
  },
  prerequisite: {
    label: "需要提前准备",
    Icon: ClipboardList,
    lineColor: "bg-warn-prereq/40",
    iconColor: "text-warn-prereq",
  },
};

export function ConflictBanner({ conflicts }: Props) {
  const [open, setOpen] = useState(true);

  if (!conflicts || conflicts.length === 0) {
    return (
      <div className="inline-flex items-center gap-1.5 rounded-2xl bg-green-50 px-4 py-3 text-sm text-green-700 ring-1 ring-green-100">
        <CheckCircle2 className="h-4 w-4" strokeWidth={1.75} />
        没有发现明显问题，你的攻略组合很顺畅。
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white shadow-sm ring-1 ring-ink-100">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-ink-100 text-ink-700">
            <AlertCircle className="h-4 w-4" strokeWidth={1.75} />
          </span>
          <div>
            <div className="font-semibold">
              发现 <span className="text-ink-900">{conflicts.length}</span> 个需要注意的地方
            </div>
            <div className="text-xs text-ink-500">
              点开查看 AI 给出的建议，决策时可作参考
            </div>
          </div>
        </div>
        {open ? (
          <ChevronUp className="h-4 w-4 text-ink-500" strokeWidth={1.75} />
        ) : (
          <ChevronDown className="h-4 w-4 text-ink-500" strokeWidth={1.75} />
        )}
      </button>

      {open && (
        <div className="space-y-2 border-t border-ink-100 px-5 py-4">
          {conflicts.map((c, i) => {
            const meta = CONFLICT_DISPLAY[c.conflict_type];
            return (
              <div
                key={i}
                className="relative overflow-hidden rounded-xl bg-white px-3 py-2.5 ring-1 ring-ink-100"
              >
                {/* 左侧细竖线，柔和的分类提示 */}
                <span
                  aria-hidden
                  className={`absolute left-0 top-0 h-full w-1 ${meta.lineColor}`}
                />
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold text-ink-900">
                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                    <meta.Icon
                      className={`h-4 w-4 ${meta.iconColor}`}
                      strokeWidth={1.75}
                    />
                    <span>{meta.label}</span>
                  </span>
                  <span className="min-w-0 max-w-full truncate rounded-full bg-ink-100 px-2 py-0.5 text-xs font-normal text-ink-700">
                    {c.items.slice(0, 3).join(" / ")}
                    {c.items.length > 3 ? "…" : ""}
                  </span>
                </div>
                <div className="mt-1.5 text-sm leading-relaxed text-ink-900">
                  {c.reason}
                </div>
                <div className="mt-1 inline-flex items-start gap-1.5 text-xs leading-relaxed text-ink-600">
                  <Lightbulb
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-400"
                    strokeWidth={1.75}
                  />
                  <span>建议：{c.suggestion}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
