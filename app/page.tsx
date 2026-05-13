import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Sparkles, Map, AlertTriangle } from "lucide-react";

export default function Home() {
  return (
    <main className="relative min-h-screen overflow-hidden">
      {/* 背景渐变 — v2.3 去掊黄，保留柔和粉白 */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-brand-50/60 via-white to-white" />
      <div className="absolute -top-40 -right-40 -z-10 h-96 w-96 rounded-full bg-brand-100 blur-3xl opacity-50" />
      <div className="absolute -bottom-40 -left-40 -z-10 h-96 w-96 rounded-full bg-ink-100 blur-3xl opacity-60" />

      {/* 顶栏 */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2.5">
          <Image
            src="/logo.png"
            alt="选驴"
            width={44}
            height={44}
            priority
            className="h-11 w-11 object-contain"
          />
          <span className="text-xl font-bold tracking-tight text-ink-900">选驴 TripPick</span>
        </div>
        <nav className="hidden md:flex items-center gap-6 text-sm text-ink-700">
          <a href="#how" className="hover:text-ink-900">怎么用</a>
          <a href="#why" className="hover:text-ink-900">和别的产品什么区别</a>
          <a
            href="https://github.com"
            target="_blank"
            rel="noreferrer"
            className="hover:text-ink-900"
          >
            GitHub
          </a>
        </nav>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 pt-12 pb-20 md:pt-20 md:pb-28">
        <div className="grid items-center gap-12 md:grid-cols-2">
          <div>
            <h1 className="text-4xl font-bold leading-tight tracking-tight md:text-5xl">
              把你收藏的<span className="text-brand-500">小红书攻略</span>，
              <br className="hidden md:block" />
              拼成真正能出发的行程
            </h1>
            <p className="mt-5 text-base text-ink-700 md:text-lg leading-relaxed">
              不是 AI 帮你生成标准行程——而是从你已经喜欢的攻略里，帮你做决定。
              <br className="hidden md:block" />
              多篇笔记 → 自动提取 → 去重聚合 → 需注意提醒 → 一键确认。
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/input"
                className="group inline-flex items-center justify-center gap-2 rounded-xl bg-brand-500 px-6 py-3.5 text-base font-semibold text-white shadow-lg shadow-brand-500/30 transition hover:bg-brand-600 hover:shadow-brand-500/40"
              >
                开始整理我的攻略
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" strokeWidth={2} />
              </Link>
              <Link
                href="/analyze?demo=1"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-6 py-3.5 text-base font-semibold text-ink-800 ring-1 ring-ink-200 transition hover:bg-ink-50 hover:ring-ink-300"
              >
                <Sparkles className="h-4 w-4 text-ink-500" strokeWidth={1.75} />
                用示例数据试试
              </Link>
            </div>
            <p className="mt-3 text-xs text-ink-500">
              示例：杭州 5 篇真实攻略 · 10 秒内看到完整产品效果
            </p>
          </div>

          {/* 右侧示意卡片 */}
          <div className="relative">
            <div className="rounded-3xl bg-white p-6 shadow-2xl shadow-brand-500/10 ring-1 ring-ink-100">
              <div className="flex items-center justify-between text-xs text-ink-500">
                <span className="font-medium tracking-wide text-ink-700">杭州</span>
                <span className="text-ink-400">5 篇攻略 · 10 秒</span>
              </div>
              <div className="mt-5 space-y-3">
                <div className="rounded-2xl bg-brand-50/60 p-4 ring-1 ring-brand-100">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate font-semibold">法喜寺</span>
                    <span className="shrink-0 whitespace-nowrap rounded-full bg-brand-500 px-2 py-0.5 text-xs text-white">
                      推荐 86
                    </span>
                  </div>
                  <div className="mt-2 text-xs text-ink-700">被 3 篇笔记反复推荐 · 拍照好看 / 氛围安静</div>
                </div>
                <div className="rounded-2xl bg-white p-4 ring-1 ring-ink-100">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate font-semibold">良渚文化村</span>
                    <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-warn-distance/10 px-2 py-0.5 text-xs text-warn-distance">
                      <Map className="h-3 w-3" strokeWidth={1.75} />
                      距离较远
                    </span>
                  </div>
                  <div className="mt-2 text-xs text-ink-700">与法喜寺相距约 30km，不建议同一天上午</div>
                </div>
                <div className="rounded-2xl bg-white p-4 ring-1 ring-ink-100">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate font-semibold">某网红咖啡店</span>
                    <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-warn-opinion/10 px-2 py-0.5 text-xs text-warn-opinion">
                      <AlertTriangle className="h-3 w-3" strokeWidth={1.75} />
                      口碑分歧
                    </span>
                  </div>
                  <div className="mt-2 text-xs text-ink-700">3 篇推荐 / 1 篇明确避雷，性价比一般</div>
                </div>
              </div>
            </div>
            <div className="absolute -bottom-4 -right-4 -z-10 h-full w-full rounded-3xl bg-ink-100/60" />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="text-center text-2xl font-bold md:text-3xl">三步，就够了</h2>
        <p className="mt-2 text-center text-ink-500">从收藏夹到行程板，不再是黑盒</p>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {[
            {
              step: "01",
              title: "粘贴笔记",
              desc: "把你收藏的 3–5 篇小红书攻略文本贴进来，不强制要求目的地。",
            },
            {
              step: "02",
              title: "AI 提取聚合",
              desc: "自动识别景点 / 餐厅 / 住宿，去重合并，标注被几篇推荐。",
            },
            {
              step: "03",
              title: "做出决定",
              desc: "提醒标记 + 候选决策板，一键确认，自动排成 Day 1 / Day 2。",
            },
          ].map((it) => (
            <div
              key={it.step}
              className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-ink-100 transition hover:shadow-md"
            >
              <div className="text-sm font-mono text-brand-500">{it.step}</div>
              <div className="mt-2 text-lg font-semibold">{it.title}</div>
              <div className="mt-2 text-sm leading-relaxed text-ink-700">{it.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Why */}
      <section id="why" className="mx-auto max-w-6xl px-6 py-16">
        <div className="rounded-3xl bg-gradient-to-br from-ink-900 to-ink-700 p-8 text-white md:p-12">
          <div className="grid items-center gap-8 md:grid-cols-2">
            <div>
              <h2 className="text-2xl font-bold md:text-3xl">
                现有 AI 都在帮你"从零生成"
                <br />
                TripPick 帮你"从你已经认可的内容里做选择"
              </h2>
            </div>
            <div className="space-y-3 text-sm text-white/80">
              <p>用户的真实问题不是"我不知道去哪"，而是：</p>
              <p className="text-xl font-semibold text-white">
                "我已经看了很多，收藏了很多，但还是不知道怎么选。"
              </p>
              <p>
                收藏行为本身就是偏好表达。AI 的作用不是替你想，而是把你已经隐性表达的偏好整理出来。
              </p>
            </div>
          </div>
        </div>
      </section>

      <footer className="mx-auto max-w-6xl px-6 py-10 text-center text-xs text-ink-500">
        © 2026 TripPick
      </footer>
    </main>
  );
}
