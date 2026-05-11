# TripPick

> 把你收藏的小红书旅行攻略，拼成真正能出发的行程。
>
> 不是 AI 帮你从零生成行程——而是从你已经喜欢的攻略里，帮你做决定。

---

## 🚀 Demo

- 在线访问：待 Vercel 部署后填入
- 一键示例：首页"用示例数据试试"按钮，10 秒看到完整效果

## ✨ 产品亮点

| 现有 AI 旅行规划 | TripPick |
|---|---|
| 从零生成标准行程 | 从用户已收藏的小红书内容做整合 |
| 替用户想 | 帮用户做决策 |
| 通用旅游知识 | 真实种草内容 |

五步核心流程：
1. **多篇输入** —— 粘贴 3–5 篇小红书笔记
2. **结构化提取** —— LLM 抽取 POI / 餐厅 / 住宿 / 预算 / 避雷
3. **去重聚合** —— 同类合并，标注"被 N 篇推荐"
4. **冲突检测** —— 距离 / 评价 / 时间过载 / 前置条件
5. **候选决策** —— ✅ / ⏸ / ❌ 一键选择，自动排 Day 1 / Day 2

## 🛠 技术栈

- Next.js 14 (App Router) + TypeScript
- Tailwind CSS
- OpenRouter（默认 `google/gemini-2.5-pro`，可切 `deepseek/deepseek-chat`）
- Zustand + sessionStorage
- Vercel Serverless API Routes
- Vercel 部署

## 🧑‍💻 本地开发

```bash
npm install
cp .env.example .env.local   # 填入 OPENROUTER_API_KEY
npm run dev                  # http://localhost:3000
```

## 🌐 部署到 Vercel

1. Fork / 推送本仓库到你的 GitHub
2. 在 [vercel.com](https://vercel.com) 点击 "Import Project"
3. 选择本仓库
4. 在 Environment Variables 里填：
   - `OPENROUTER_API_KEY` —— 你的 OpenRouter API Key
   - `OPENROUTER_MODEL` —— 默认 `google/gemini-2.5-pro`
5. 点击 Deploy

约 2 分钟后即可获得 `https://trippick-xxx.vercel.app` 公开链接。

---

## 📁 项目结构

```
app/
  page.tsx              # 首页 Landing
  input/page.tsx        # 输入页
  analyze/page.tsx      # 分析结果页
  decide/page.tsx       # 决策板（待实现）
  itinerary/page.tsx    # 最终行程（待实现）
  api/
    extract/route.ts    # LLM 第 1 次调用（待实现）
    conflicts/route.ts  # LLM 第 2 次调用（待实现）
lib/
  utils.ts              # 工具函数
public/
  mock-result.json      # Mock fallback 数据（待生成）
```

---

*48h Demo Build · v1.1*
