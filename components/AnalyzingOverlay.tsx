"use client";

import { useEffect, useState } from "react";

const STEPS = [
  { label: "小驴正在驮攻略", icon: "📖" },
  { label: "小驴正在挑地点和推荐理由", icon: "📍" },
  { label: "小驴正在合并重复的地点", icon: "🔗" },
  { label: "小驴正在看路线和偏好", icon: "⚠️" },
  { label: "小驴摆出决策板", icon: "✨" },
];

// 各步骤大致占多少秒（总和≈ 120s，实际 AI 耗时 1-2 分钟）
// 取地点提取是最耗时的 LLM 调用，合并和冲突检测是后续轻量步骤
const STEP_DURATIONS_MS = [8000, 60000, 18000, 18000, 16000];

export default function AnalyzingOverlay({ show }: { show: boolean }) {
  const [activeStep, setActiveStep] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!show) {
      setActiveStep(0);
      setElapsed(0);
      return;
    }

    const startTime = Date.now();
    const tickInterval = setInterval(() => {
      const ms = Date.now() - startTime;
      setElapsed(ms);

      // 根据累计时长定位当前步骤
      let acc = 0;
      let stepIdx = STEPS.length - 1; // 默认停在最后一步
      for (let i = 0; i < STEP_DURATIONS_MS.length; i++) {
        acc += STEP_DURATIONS_MS[i]!;
        if (ms < acc) {
          stepIdx = i;
          break;
        }
      }
      setActiveStep(stepIdx);
    }, 300);

    return () => clearInterval(tickInterval);
  }, [show]);

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-white/95 backdrop-blur-sm">
      <div className="mx-6 w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl ring-1 ring-ink-100 sm:p-8">
        <div className="flex items-center gap-3">
          <span className="inline-block h-8 w-8 animate-spin rounded-full border-[3px] border-brand-500/30 border-t-brand-500" />
          <div>
            <h2 className="text-lg font-bold text-ink-900">小驴正在帮你们对答案</h2>
            <p className="mt-0.5 text-xs text-ink-500">
              预计 1–2 分钟 · 已用 {formatElapsed(elapsed)}
            </p>
          </div>
        </div>

        <ol className="mt-6 space-y-3">
          {STEPS.map((step, i) => {
            const isDone = i < activeStep;
            const isActive = i === activeStep;
            const isPending = i > activeStep;
            return (
              <li
                key={i}
                className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition ${
                  isActive ? "bg-brand-50 ring-1 ring-brand-200" : ""
                }`}
              >
                <span
                  className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm ${
                    isDone
                      ? "bg-brand-500 text-white"
                      : isActive
                        ? "bg-white ring-2 ring-brand-500"
                        : "bg-ink-100 text-ink-500"
                  }`}
                >
                  {isDone ? (
                    "✓"
                  ) : isActive ? (
                    <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-brand-500" />
                  ) : (
                    step.icon
                  )}
                </span>
                <span
                  className={`flex-1 ${
                    isDone
                      ? "text-ink-500"
                      : isActive
                        ? "font-semibold text-brand-600"
                        : isPending
                          ? "text-ink-500"
                          : "text-ink-700"
                  }`}
                >
                  {step.label}
                  {isActive && <span className="ml-1 animate-pulse">…</span>}
                </span>
              </li>
            );
          })}
        </ol>

        {elapsed >= 120000 && (
          <p className="mt-4 rounded-xl bg-accent-50 px-3 py-2 text-xs text-ink-700 ring-1 ring-accent-200">
小驴有点累了，这批攻略量有点大，再等一下下。
          </p>
        )}
      </div>
    </div>
  );
}

// 将毫秒格式化为“X 分 Y 秒” 或 “Ys”
function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min === 0) return `${sec}s`;
  return `${min}分 ${sec}s`;
}
