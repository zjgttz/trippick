import Link from "next/link";

export default function InputPage() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-12">
      <Link href="/" className="text-sm text-ink-500 hover:text-ink-900">
        ← 返回首页
      </Link>
      <h1 className="mt-6 text-3xl font-bold tracking-tight">
        粘贴你收藏的小红书攻略
      </h1>
      <p className="mt-2 text-ink-700">
        3–5 篇即可，TripPick 会自动提取关键信息，帮你做决定。
      </p>

      <div className="mt-8 rounded-2xl bg-accent-50 p-5 ring-1 ring-accent-500/30">
        <div className="flex items-start gap-3">
          <span>✨</span>
          <div className="flex-1 text-sm text-ink-900">
            没有现成数据？
            <Link
              href="/analyze?demo=1"
              className="ml-1 font-semibold text-brand-600 underline-offset-2 hover:underline"
            >
              用示例数据试试 →
            </Link>
          </div>
        </div>
      </div>

      <div className="mt-8 rounded-2xl border-2 border-dashed border-ink-300 bg-white p-10 text-center text-ink-500">
        输入表单功能正在搭建中（P6 阶段交付）…
        <br />
        <span className="text-xs">当前已上线：Landing + 路由骨架 + 示例分析入口</span>
      </div>
    </main>
  );
}
