import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1";

export async function GET() {
  const url =
    "https://www.xiaohongshu.com/discovery/item/69dba1b3000000001e00ecc6?xsec_token=ABMBdo_X0AJSTKcI-rwU5_RtOaH4NLgt2gmlfEalnKPq8=&xsec_source=pc_feed";
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const resp = await fetch(url, {
      headers: {
        "User-Agent": MOBILE_UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.5",
      },
      redirect: "follow",
      signal: ctrl.signal,
    });
    clearTimeout(t);
    const html = await resp.text();
    const stateMatch = html.match(/window\.__INITIAL_(?:SSR_)?STATE__\s*=\s*(\{[\s\S]*?\})\s*<\/script>/);
    const state = stateMatch ? stateMatch[1] : null;
    return NextResponse.json({
      status: resp.status,
      htmlLen: html.length,
      finalUrl: resp.url,
      stateLen: state?.length || 0,
      stateSample: state ? state.slice(0, 3000) : null,
      headers: Object.fromEntries(resp.headers.entries()),
    });
  } catch (e) {
    clearTimeout(t);
    return NextResponse.json({
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
