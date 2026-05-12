/**
 * v2.0 小红书 POI 跳转 (#4)
 *
 * 把 POI 名 + 目的地拼成小红书搜索 URL，让用户一键看更多原帖。
 */

/** 生成小红书搜索 URL（带话题城市作为修饰） */
export function buildXhsSearchUrl(
  poiName: string,
  destination?: string
): string {
  const keyword = destination
    ? `${destination} ${poiName}`.trim()
    : poiName.trim();
  const encoded = encodeURIComponent(keyword);
  // 小红书 web 搜索结果页（移动端 / PC 都能打开）
  return `https://www.xiaohongshu.com/search_result?keyword=${encoded}&source=web_explore_feed`;
}

/** 生成小红书 App scheme（移动端可直跳 app；fallback 到 web） */
export function buildXhsAppOrWeb(
  poiName: string,
  destination?: string
): { app: string; web: string } {
  const keyword = destination ? `${destination} ${poiName}` : poiName;
  const encoded = encodeURIComponent(keyword);
  return {
    app: `xhsdiscover://search/result?keyword=${encoded}`,
    web: `https://www.xiaohongshu.com/search_result?keyword=${encoded}&source=web_explore_feed`,
  };
}
