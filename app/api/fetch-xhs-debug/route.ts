/**
 * 临时调试端点：把抓取过程的中间状态全部返回，方便定位 Vercel 上反爬的具体形态
 * 用完即删
 */
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1";
const PC_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";
const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Mobile Safari/537.36";

async function probe(url: string, ua: string, label: string) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const resp = await fetch(url, {
      headers: {
        "User-Agent": ua,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.5",
      },
      redirect: "follow",
      signal: ctrl.signal,
    });
    clearTimeout(t);
    const html = await resp.text();
    const hasInitialState = /window\.__INITIAL_(?:SSR_)?STATE__/.test(html);
    const hasAppPrompt = /请打开\s*App\s*查看|访问的页面已下架|页面不存在/.test(html);
    const hasNoteDesc = /noteData/.test(html);
    const finalUrl = resp.url;
    return {
      label,
      ok: resp.ok,
      status: resp.status,
      finalUrl,
      htmlLen: html.length,
      hasInitialState,
      hasAppPrompt,
      hasNoteDesc,
      sample: html.slice(0, 600),
      titleTag: html.match(/<title>([^<]+)<\/title>/i)?.[1] || null,
    };
  } catch (e) {
    clearTimeout(t);
    return {
      label,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function GET() {
  const url =
    "https://www.xiaohongshu.com/discovery/item/69dba1b3000000001e00ecc6?xsec_token=ABMBdo_X0AJSTKcI-rwU5_RtOaH4NLgt2gmlfEalnKPq8=&xsec_source=pc_feed";
  const mobile = await probe(url, MOBILE_UA, "mobile_ua");
  const pc = await probe(url, PC_UA, "pc_ua");
  const android = await probe(url, ANDROID_UA, "android_ua");
  return NextResponse.json({ mobile, pc, android });
}
