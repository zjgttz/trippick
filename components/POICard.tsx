"use client";

import {
  Check,
  Pause,
  X,
  AlertCircle,
  Sparkles,
  Wallet,
  Clock,
  ExternalLink,
  type LucideIcon,
} from "lucide-react";
import type { POIItem } from "@/lib/schema";
import { ConfidenceRing } from "./ConfidenceRing";
import { useTripPickStore, type DecisionStatus } from "@/lib/store";
import { buildXhsSearchUrl } from "@/lib/xhs-link";

interface Props {
  item: POIItem;
  hasConflict?: boolean;
  compact?: boolean;
}

const STATUS_BTNS: Array<{
  status: DecisionStatus;
  label: string;
  Icon: LucideIcon;
  accent: string;
  active: string;
}> = [
  {
    status: "accepted",
    label: "想去",
    Icon: Check,
    accent: "hover:bg-brand-50 hover:text-brand-600",
    active: "bg-brand-500 text-white ring-brand-500",
  },
  {
    status: "pending",
    label: "待定",
    Icon: Pause,
    accent: "hover:bg-ink-100 hover:text-ink-900",
    active: "bg-ink-200 text-ink-900 ring-ink-300",
  },
  {
    status: "rejected",
    label: "跳过",
    Icon: X,
    accent: "hover:bg-ink-100 hover:text-ink-900",
    active: "bg-ink-700 text-white ring-ink-700",
  },
];

export function POICard({ item, hasConflict, compact }: Props) {
  const status = useTripPickStore(
    (s) => s.decisions[item.name] ?? "unset"
  );
  const setDecision = useTripPickStore((s) => s.setDecision);
  const destination = useTripPickStore((s) => s.analysis?.destination);

  return (
    <div
      className={`card-hover rounded-2xl bg-white p-4 ring-1 ${
        status === "accepted"
          ? "ring-brand-300 shadow-sm"
          : status === "rejected"
            ? "opacity-60 ring-ink-100"
            : "ring-ink-100 hover:shadow-md hover:ring-ink-200"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold leading-tight">
              {item.name}
            </h3>
            <span className="rounded-full bg-ink-100 px-2 py-0.5 text-xs text-ink-700">
              {item.type}
            </span>
            {item.source_count >= 2 && (
              <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-600">
                {item.source_count} 篇笔记提到
              </span>
            )}
            {hasConflict && (
              <span className="inline-flex items-center gap-1 rounded-full bg-warn-distance/10 px-2 py-0.5 text-xs text-warn-distance">
                <AlertCircle className="h-3 w-3" strokeWidth={1.75} />
                需注意
              </span>
            )}
            {item.source === "ai_recommended" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-ink-50 px-2 py-0.5 text-xs text-ink-700 ring-1 ring-ink-200">
                <Sparkles className="h-3 w-3 text-ink-500" strokeWidth={1.75} />
                AI 补充
              </span>
            )}
          </div>

          {!compact && item.recommended_reasons.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {item.recommended_reasons.slice(0, 4).map((r) => (
                <span
                  key={r}
                  className="rounded-md bg-ink-100/70 px-2 py-0.5 text-xs text-ink-700"
                >
                  {r}
                </span>
              ))}
            </div>
          )}

          {!compact && item.warnings.length > 0 && (
            <div className="mt-2 inline-flex items-start gap-1.5 text-xs leading-relaxed text-warn-distance">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
              <span>{item.warnings.join(" · ")}</span>
            </div>
          )}

          {!compact && (
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-500">
              {item.suitable_for.length > 0 && (
                <span>适合：{item.suitable_for.join("/")}</span>
              )}
              {item.estimated_budget && (
                <span className="inline-flex items-center gap-1">
                  <Wallet className="h-3 w-3" strokeWidth={1.75} />
                  {item.estimated_budget}
                </span>
              )}
              {item.suggested_time && (
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" strokeWidth={1.75} />
                  {item.suggested_time}
                </span>
              )}
            </div>
          )}
        </div>

        <ConfidenceRing score={item.confidence_score} />
      </div>

      {/* 操作按钮 */}
      <div className="mt-3 grid grid-cols-3 gap-1.5">
        {STATUS_BTNS.map((b) => {
          const on = status === b.status;
          return (
            <button
              key={b.status}
              onClick={() =>
                setDecision(item.name, on ? "unset" : b.status)
              }
              className={`btn-press inline-flex items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-sm font-medium ring-1 ${
                on
                  ? b.active
                  : `bg-white text-ink-700 ring-ink-100 ${b.accent}`
              }`}
            >
              <b.Icon className="h-3.5 w-3.5" strokeWidth={2} />
              {b.label}
            </button>
          );
        })}
      </div>

      {/* v2.0 新增：在小红书中查看更多 */}
      {!compact && (
        <a
          href={buildXhsSearchUrl(item.name, destination)}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 hover:underline"
        >
          在小红书查看更多说明
          <ExternalLink className="h-3 w-3" strokeWidth={1.75} />
        </a>
      )}
    </div>
  );
}
