/**
 * v2.0 修复：尝试自动抓取小红书帖子正文
 *
 * 输入：分享文案 / xhslink.com 短链 / xiaohongshu.com 长链（带 xsec_token）
 * 输出：
 *   - 成功：{ ok: true, title, body, url, via: "feed_api" | "html" }
 *   - 失败：{ ok: false, reason: "blocked" | "no_content" | "timeout" | "bad_input", message }
 *
 * 三层策略（按成功率从高到低）：
 * 1. feed_api: 调小红书 web feed JSON API（如果 URL 带 xsec_token，最稳）
 * 2. html: 直接抓 xiaohongshu.com 页面 HTML（提取 og:description / __INITIAL_STATE__）
 * 3. 都失败 → 返回 blocked，前端引导用户手动复制
 *
 * 不做：签名破解（x-s/x-t/x-s-common），不维护 Cookie 池，不依赖代理
 */

import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 30;

const RequestSchema = z.object({
  url: z.string().min(10).max(2000),
});

// 移动端 Safari UA（小红书更宽容）
const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1";

const PC_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

// === 链接解析 ===
const XHSLINK_RE = /https?:\/\/(?:www\.)?xhslink\.com\/[A-Za-z0-9/_-]+/i;
const XHS_FULL_RE =
  /https?:\/\/(?:www\.)?xiaohongshu\.com\/(?:explore|discovery\/item|user\/profile\/[^/]+)\/([A-Za-z0-9]+)[^\s]*/i;

function extractUrl(raw: string): string | null {
  const m = raw.match(XHS_FULL_RE) || raw.match(XHSLINK_RE);
  return m ? m[0] : null;
}

function parseNoteId(url: string): { noteId: string; xsecToken: string } | null {
  // 长链格式: .../discovery/item/{noteId}?xsec_token=xxx&xsec_source=xxx
  // 或       .../explore/{noteId}?xsec_token=xxx
  const idMatch = url.match(/\/(?:discovery\/item|explore|profile\/[^/]+)\/([A-Za-z0-9]+)/);
  if (!idMatch) return null;
  const noteId = idMatch[1];
  const tokenMatch = url.match(/[?&]xsec_token=([^&]+)/);
  const xsecToken = tokenMatch ? decodeURIComponent(tokenMatch[1]) : "";
  return { noteId, xsecToken };
}

// 短链 → 长链解析
async function expandShortLink(shortUrl: string, controller: AbortController): Promise<string | null> {
  try {
    const r = await fetch(shortUrl, {
      method: "GET",
      headers: { "User-Agent": MOBILE_UA },
      redirect: "follow",
      signal: controller.signal,
    });
    // 跟随重定向后的最终 URL
    return r.url;
  } catch {
    return null;
  }
}

// === 策略 1: 小红书 feed JSON API ===
async function tryFeedApi(
  noteId: string,
  xsecToken: string,
  controller: AbortController,
): Promise<{ title: string; body: string } | null> {
  if (!xsecToken) return null; // 没 token 直接放弃，肯定 403

  const apiUrl = "https://edith.xiaohongshu.com/api/sns/web/v1/feed";

  // 模拟从 xiaohongshu.com 页面发出的请求
  const referer = `https://www.xiaohongshu.com/discovery/item/${noteId}?xsec_token=${encodeURIComponent(xsecToken)}&xsec_source=pc_share`;

  try {
    const resp = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "User-Agent": PC_UA,
        "Content-Type": "application/json;charset=UTF-8",
        Accept: "application/json, text/plain, */*",
        "Accept-Language": "zh-CN,zh;q=0.9",
        Origin: "https://www.xiaohongshu.com",
        Referer: referer,
      },
      body: JSON.stringify({
        source_note_id: noteId,
        image_formats: ["jpg", "webp", "avif"],
        extra: { need_body_topic: "1" },
        xsec_source: "pc_share",
        xsec_token: xsecToken,
      }),
      signal: controller.signal,
    });

    if (!resp.ok) return null;
    const data = await resp.json();
    // 小红书 feed API 响应格式：{ success, data: { items: [{ note_card: { title, desc, ... } }] } }
    const note = data?.data?.items?.[0]?.note_card;
    if (!note) return null;
    const title = (note.title || note.display_title || "").trim();
    const body = (note.desc || "").trim();
    if (!body && !title) return null;
    return { title, body };
  } catch {
    return null;
  }
}

// === 策略 2: 抓 HTML 页面 ===
async function tryHtml(
  url: string,
  controller: AbortController,
): Promise<{ title: string; body: string } | null> {
  try {
    const resp = await fetch(url, {
      headers: {
        "User-Agent": MOBILE_UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.5",
        "Cache-Control": "no-cache",
      },
      redirect: "follow",
      signal: controller.signal,
    });
    if (!resp.ok) return null;
    const html = await resp.text();
    if (html.length < 2000) return null;

    // 反爬识别
    if (/请打开\s*App\s*查看|访问的页面已下架|页面不存在/.test(html)) return null;

    // 提取 __INITIAL_STATE__
    let title = "";
    let body = "";
    const stateMatch = html.match(
      /window\.__INITIAL_(?:SSR_)?STATE__\s*=\s*(\{[\s\S]*?\})\s*<\/script>/,
    );
    if (stateMatch) {
      try {
        // 小红书 state 里有 undefined 字面量，会让 JSON.parse 报错
        const cleaned = stateMatch[1].replace(/:\s*undefined/g, ":null");
        const state = JSON.parse(cleaned);

        // 路径 1（PC 新版直出）: state.noteData.data.noteData
        const nd1 = state?.noteData?.data?.noteData;
        if (nd1 && (nd1.desc || nd1.title)) {
          title = nd1.title || "";
          body = nd1.desc || "";
        }

        // 路径 2（PC 备用）: state.noteData.normalNotePreloadData
        if (!body) {
          const nd2 = state?.noteData?.normalNotePreloadData;
          if (nd2 && (nd2.desc || nd2.title)) {
            title = title || nd2.title || "";
            body = nd2.desc || "";
          }
        }

        // 路径 3（移动版「启动 App 引导页」预加载，Vercel/数据中心 IP 实测命中）:
        //   state.errorNoteData.normalNotePreloadData.{title, desc}
        if (!body) {
          const nd3 = state?.errorNoteData?.normalNotePreloadData;
          if (nd3 && (nd3.desc || nd3.title)) {
            title = title || nd3.title || "";
            body = nd3.desc || "";
          }
        }

        // 路径 4（旧版结构）: state.note.noteDetailMap[noteId].note
        if (!body) {
          const noteMap = state?.note?.noteDetailMap || state?.noteDetailMap || {};
          for (const k in noteMap) {
            const n = noteMap[k]?.note || noteMap[k];
            if (n?.desc || n?.content) {
              title = title || n.title || n.displayTitle || "";
              body = n.desc || n.content || "";
              break;
            }
          }
        }
      } catch {
        // ignore JSON parse error
      }
    }

    // 兜底 meta
    if (!body) {
      const ogTitle =
        html.match(/<meta\s+(?:property|name)=["']og:title["']\s+content=["']([^"']+)["']/i)?.[1] ||
        html.match(/<title>([^<]+)<\/title>/i)?.[1] ||
        "";
      const ogDesc =
        html.match(/<meta\s+(?:property|name)=["']og:description["']\s+content=["']([^"']+)["']/i)?.[1] ||
        html.match(/<meta\s+(?:property|name)=["']description["']\s+content=["']([^"']+)["']/i)?.[1] ||
        "";
      title = title || ogTitle;
      body = ogDesc;
    }

    title = decodeHTMLEntities(title).trim();
    body = decodeHTMLEntities(body).trim();
    if (!body || body.length < 30) return null;
    return { title, body };
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, reason: "bad_input", message: "请求体不是合法 JSON" },
      { status: 400 },
    );
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, reason: "bad_input", message: "参数不合法" },
      { status: 400 },
    );
  }

  const rawInput = parsed.data.url;
  let url = extractUrl(rawInput);
  if (!url) {
    return NextResponse.json({
      ok: false,
      reason: "bad_input",
      message: "没识别到小红书链接",
    });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);

  try {
    // 如果是短链，先展开
    if (XHSLINK_RE.test(url)) {
      const expanded = await expandShortLink(url, controller);
      if (expanded && XHS_FULL_RE.test(expanded)) {
        url = expanded;
      }
    }

    const ids = parseNoteId(url);
    if (!ids) {
      clearTimeout(timeoutId);
      return NextResponse.json({
        ok: false,
        reason: "bad_input",
        message: "无法从链接中解析出笔记 ID",
        url,
      });
    }

    // 策略 1: feed API
    const apiResult = await tryFeedApi(ids.noteId, ids.xsecToken, controller);
    if (apiResult) {
      clearTimeout(timeoutId);
      return NextResponse.json({
        ok: true,
        title: apiResult.title,
        body: apiResult.body,
        url,
        via: "feed_api",
      });
    }

    // 策略 2: HTML
    const htmlResult = await tryHtml(url, controller);
    if (htmlResult) {
      clearTimeout(timeoutId);
      return NextResponse.json({
        ok: true,
        title: htmlResult.title,
        body: htmlResult.body,
        url,
        via: "html",
      });
    }

    clearTimeout(timeoutId);
    return NextResponse.json({
      ok: false,
      reason: "blocked",
      message: "小红书反爬拦截了所有抓取尝试",
      url,
      note_id: ids.noteId,
      has_xsec_token: !!ids.xsecToken,
    });
  } catch (e) {
    clearTimeout(timeoutId);
    const isAbort = e instanceof Error && e.name === "AbortError";
    return NextResponse.json({
      ok: false,
      reason: isAbort ? "timeout" : "blocked",
      message: isAbort
        ? "抓取超时（20 秒）"
        : `异常：${e instanceof Error ? e.message : String(e)}`,
      url,
    });
  }
}

function decodeHTMLEntities(s: string): string {
  if (!s) return "";
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\\n/g, "\n")
    .replace(/\\\"/g, '"');
}
