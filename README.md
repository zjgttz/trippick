<div align="center">

# 选驴 · TripPick

把你收藏的小红书旅行攻略，拼成真正能出发的行程。

不是 AI 帮你从零生成行程——而是从你已经喜欢的内容里，帮你做决定。

**[🌐 在线访问 trippick.win](https://trippick.win)**

</div>

---

## 一句话产品定位

> 现有 AI 旅行规划是"凭空生成 → 用户挑"。
> 选驴反过来：**"用户挑 → AI 组织"**。
>
> 你已经刷了 5-10 篇小红书收藏，粘进来，小驴帮你整成一份能出发的行程。

## 产品亮点

| 别的 AI 旅行规划 | 选驴 TripPick |
|---|---|
| 从零生成标准化行程 | 只从你给的笔记里组织 |
| AI 替你决定去哪 | AI 只组织，决定权在你 |
| 通用旅游知识 | 真实种草内容 |
| 一个人闭环 | 一条链接异步协作 |

## 核心功能

- 📝 **多源粘贴** — 小红书文案 / 分享链接，一键清洗或抓取
- 🤖 **AI 结构化** — 自动抽取 POI / 餐厅 / 住宿 / 预算 / 避雷
- ✅ **用户主导决策** — 想去 / 再看看 / 不去，一键勾选
- 🗺️ **国内地图原生** — 高德地图 + 中文标注 + GCJ-02 坐标修正
- 👥 **轻量协作** — 一条分享链接，"驴友意见不合"自动标出
- 🎯 **克制的行程密度** — 每半天 2 个地点，宁缺勿滥
- 🆘 **Mock Fallback** — API 挂了也能演示，评委体验保险

## 五步核心流程

1. **多篇输入** — 粘贴小红书笔记或链接
2. **结构化提取** — LLM 抽取 POI / 餐厅 / 住宿
3. **去重聚合** — 同类合并，标注"被 N 篇推荐"
4. **冲突检测** — 距离 / 评价 / 时间过载 / 前置条件
5. **候选决策 + 排程** — ✅/⏸/❌ 一键选择，自动按地理排 Day 1 / Day 2

## 技术栈

- **Next.js 14** (App Router) + TypeScript
- **Tailwind CSS** + Lucide Icons
- **OpenRouter**（`google/gemini-2.5-pro` / `deepseek/deepseek-chat`）
- **高德地图** + GCJ-02 坐标系
- **Zustand** + sessionStorage（无账号、URL 即凭证）
- **Vercel** Serverless + 一键部署
- **三层降级**：实时 LLM → 缓存结果 → Mock Fallback

## 本地开发

```bash
git clone https://github.com/zjgttz/trippick.git
cd trippick
npm install
cp .env.example .env.local   # 填入 OPENROUTER_API_KEY
npm run dev                  # http://localhost:3000
```

### 环境变量

| 变量 | 必填 | 说明 |
|---|---|---|
| `OPENROUTER_API_KEY` | ✅ | OpenRouter API Key |
| `OPENROUTER_MODEL` | | 默认 `google/gemini-2.5-pro` |
| `AMAP_KEY` | | 高德地图 Web Key（前端）|
| `AMAP_SECRET` | | 高德地图 Web 安全密钥 |

## 部署到 Vercel

1. Fork 本仓库
2. 在 [vercel.com](https://vercel.com) 导入项目
3. 配置环境变量（见上）
4. Deploy

约 2 分钟拿到 `https://your-trip.vercel.app`。

## 项目结构

```
app/
  page.tsx              # 首页（Why 选驴 · 示例数据）
  input/page.tsx        # 粘贴输入 + 清洗 / 抓取
  analyze/page.tsx      # 结构化提取 + 冲突检测
  itinerary/page.tsx    # 行程 + 地图 + 协作
  api/
    analyze/            # LLM 抽取
    enrich/             # 行程组织 + 排程
    fetch-xhs/          # 小红书链接抓取
    geocode/            # 高德地理编码
    trip/               # 分享链接 / 协作状态
components/
  POICard.tsx           # 候选地点卡
  ConflictBanner.tsx    # 冲突提示
  TripMap.tsx           # 高德地图 + 点位
  PreferencePanel.tsx   # 偏好面板
lib/
  prompts.ts            # LLM 提示词（红线约束）
  gcj02.ts              # WGS-84 → GCJ-02 坐标转换
  reorder-by-geo.ts     # 按地理就近排程
public/
  mock-result.json      # Mock fallback 数据
```

## 产品红线

构建过程中坚持的几条原则：

1. **AI 不替用户做决定** — 只组织，不创造
2. **不推荐用户没勾选的地点** — 加 prompt 约束
3. **宁缺勿滥** — 每半天 2 个，除非素材多到值得 3 个
4. **不做账号系统** — URL 即凭证，轻量分享优先
5. **桌面 ≠ 手机** — 移动端必须真机测一遍

## Roadmap

近期：行程持久化 · 拖拽再编辑 · 多城市示例
中期：异步投票 · 角色化偏好 · 时间条可视化 · 行程 fork
长期：多内容源（大众点评/马蜂窝）· 海外地图 i18n · 创作者侧数据回流

---

<div align="center">

**Built with 🫏 in 48h.**

[trippick.win](https://trippick.win) · [Issues](https://github.com/zjgttz/trippick/issues)

</div>
