/**
 * 小红书分享文案解析器（纯前端正则版）
 *
 * 背景：小红书 H5 页面反爬严，xhslink.com 短链 fetch 直接 302/被拦截，
 *      Vercel Serverless 上 puppeteer 体积超限，无法稳定服务端解析。
 *
 * 策略：用户从小红书 APP 点击「分享 → 复制链接」得到的文案，
 *      格式形如:
 *        "32 杭州必去！这家法喜寺氛围真的太棒了！我和闺蜜...
 *         http://xhslink.com/a/AbCdEf 复制本条信息..."
 *      我们用正则把【标题 + 正文】抽出来，并附上短链作为来源回链。
 */
export interface XhsShareParseResult {
  /** 提取的标题（可能为空） */
  title: string;
  /** 提取的正文（去掉首部分享前缀、尾部短链段、复制提示） */
  body: string;
  /** 短链（xhslink.com/...），若没有则为空 */
  shortLink: string;
  /** 拼回给输入框的最终文本 = title + body（含短链作为可选注解） */
  cleaned: string;
}

const XHSLINK_RE = /https?:\/\/(?:www\.)?xhslink\.com\/[A-Za-z0-9/_-]+/i;
const XHS_FULL_RE =
  /https?:\/\/(?:www\.)?xiaohongshu\.com\/(?:explore|discovery\/item|user\/profile)\/[A-Za-z0-9?=&_-]+/i;

/**
 * 解析小红书分享文案。
 *
 * 输入示例（来自小红书 APP）：
 *   "98 杭州法喜寺Citywalk一日游 🌸 路线/拍照点全攻略
 *    第一天从灵隐寺过去...
 *    http://xhslink.com/a/AbCdEf
 *    复制本条信息，打开【小红书】App 查看精彩内容"
 */
export function parseXhsShare(raw: string): XhsShareParseResult | null {
  if (!raw || typeof raw !== "string") return null;
  let text = raw.trim();
  if (text.length < 10) return null;

  // 1) 抽短链
  let shortLink = "";
  const linkMatch = text.match(XHSLINK_RE) || text.match(XHS_FULL_RE);
  if (linkMatch) shortLink = linkMatch[0];

  // 2) 去掉分享脚注（"复制本条信息..."一直到末尾）
  text = text.replace(/复制本条信息[\s\S]*$/, "");
  text = text.replace(/打开[\s\S]*?小红书[\s\S]*?查看[\s\S]*$/, "");
  text = text.replace(/【小红书】[\s\S]*$/, "");

  // 3) 去掉所有 URL
  text = text.replace(XHSLINK_RE, "");
  text = text.replace(XHS_FULL_RE, "");
  text = text.replace(/https?:\/\/\S+/g, "");

  // 4) 去掉开头的纯数字编号（小红书分享有时以「32 」「98 」开头）
  text = text.replace(/^\s*\d{1,4}\s+/, "");

  text = text.trim();
  if (!text) return null;

  // 5) 拆标题/正文：第一行（或第一段，最多 40 字）当标题
  const firstNewline = text.indexOf("\n");
  let title = "";
  let body = "";
  if (firstNewline > 0 && firstNewline <= 80) {
    title = text.slice(0, firstNewline).trim();
    body = text.slice(firstNewline + 1).trim();
  } else if (text.length <= 80) {
    title = text;
    body = "";
  } else {
    // 找不到合适换行，取前 40 字当标题
    const split = text.search(/[。！？!?]/);
    if (split > 0 && split <= 60) {
      title = text.slice(0, split + 1).trim();
      body = text.slice(split + 1).trim();
    } else {
      title = text.slice(0, 30).trim();
      body = text.slice(30).trim();
    }
  }

  // 6) 拼回 cleaned —— 用于直接塞回笔记输入框
  const parts: string[] = [];
  if (title) parts.push(title);
  if (body) parts.push(body);
  const cleaned = parts.join("\n").trim();

  if (cleaned.length < 10) return null;

  return { title, body, shortLink, cleaned };
}

/**
 * 判断一段文本"看起来像"小红书分享文案。
 * 用于在 UI 上自动提示用户：检测到分享文案，是否一键解析？
 */
export function looksLikeXhsShare(raw: string): boolean {
  if (!raw) return false;
  if (XHSLINK_RE.test(raw)) return true;
  if (XHS_FULL_RE.test(raw)) return true;
  if (/复制本条信息|【小红书】/.test(raw)) return true;
  return false;
}
