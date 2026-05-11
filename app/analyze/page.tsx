import Link from "next/link";

export default function AnalyzePage({
  searchParams,
}: {
  searchParams: { demo?: string };
}) {
  const isDemo = searchParams?.demo === "1";

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-12">
      <Link href="/" className="text-sm text-ink-500 hover:text-ink-900">
        ← 返回首页
      </Link>
      <div className="mt-6 flex items-center gap-3">
        <h1 className="text-3xl font-bold tracking-tight">分析结果</h1>
        {isDemo && (
          <span className="rounded-full bg-accent-500 px-3 py-1 text-xs font-semibold text-ink-900">
            示例数据
          </span>
        )}
      </div>

      <div className="mt-10 rounded-2xl border-2 border-dashed border-ink-300 bg-white p-10 text-center text-ink-500">
        分析结果页正在搭建中（P9 阶段交付）…
        <br />
        <span className="text-xs">将显示：目的地标签 / 冲突 Banner / POI 卡片 / 决策板入口</span>
      </div>
    </main>
  );
}
