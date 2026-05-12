"use client";

import { useState } from "react";
import { CONFLICT_META, type Conflict } from "@/lib/schema";

interface Props {
  conflicts: Conflict[];
}

export function ConflictBanner({ conflicts }: Props) {
  const [open, setOpen] = useState(true);

  if (!conflicts || conflicts.length === 0) {
    return (
      <div className="rounded-2xl bg-green-50 px-4 py-3 text-sm text-green-700 ring-1 ring-green-100">
        ✓ 没有发现明显问题，你的攻略组合很顺畅。
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
          <span className="grid h-9 w-9 place-items-center rounded-full bg-warn-distance/10 text-warn-distance">
            ⚠️
          </span>
          <div>
            <div className="font-semibold">
              发现 <span className="text-warn-distance">{conflicts.length}</span> 个需要注意的地方
            </div>
            <div className="text-xs text-ink-500">
              点开查看 AI 给出的建议，决策时可作参考
            </div>
          </div>
        </div>
        <span className="text-ink-500">{open ? "收起 ↑" : "展开 ↓"}</span>
      </button>

      {open && (
        <div className="space-y-2 border-t border-ink-100 px-5 py-4">
          {conflicts.map((c, i) => {
            const meta = CONFLICT_META[c.conflict_type];
            return (
              <div
                key={i}
                className={`rounded-xl px-3 py-2.5 ring-1 ${meta.bg} ${meta.ring}`}
              >
                <div className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold ${meta.color}`}>
                  <span className="inline-flex items-center gap-1 whitespace-nowrap">
                    <span>{meta.icon}</span>
                    <span>{meta.label}</span>
                  </span>
                  <span className="min-w-0 max-w-full truncate rounded-full bg-white/70 px-2 py-0.5 text-xs font-normal text-ink-700">
                    {c.items.slice(0, 3).join(" / ")}
                    {c.items.length > 3 ? "…" : ""}
                  </span>
                </div>
                <div className="mt-1.5 text-sm leading-relaxed text-ink-900">
                  {c.reason}
                </div>
                <div className="mt-1 text-xs leading-relaxed text-ink-700">
                  💡 建议：{c.suggestion}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
