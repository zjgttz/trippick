// 快速验证小红书分享文案解析正则（独立 JS 版，无需 ts 转译）
const XHSLINK_RE = /https?:\/\/(?:www\.)?xhslink\.com\/[A-Za-z0-9/_-]+/i;
const XHS_FULL_RE = /https?:\/\/(?:www\.)?xiaohongshu\.com\/(?:explore|discovery\/item|user\/profile)\/[A-Za-z0-9?=&_-]+/i;

function parseXhsShare(raw) {
  if (!raw || typeof raw !== "string") return null;
  let text = raw.trim();
  if (text.length < 10) return null;

  let shortLink = "";
  const linkMatch = text.match(XHSLINK_RE) || text.match(XHS_FULL_RE);
  if (linkMatch) shortLink = linkMatch[0];

  text = text.replace(/复制本条信息[\s\S]*$/, "");
  text = text.replace(/打开[\s\S]*?小红书[\s\S]*?查看[\s\S]*$/, "");
  text = text.replace(/【小红书】[\s\S]*$/, "");
  text = text.replace(XHSLINK_RE, "");
  text = text.replace(XHS_FULL_RE, "");
  text = text.replace(/https?:\/\/\S+/g, "");
  text = text.replace(/^\s*\d{1,4}\s+/, "");
  text = text.trim();
  if (!text) return null;

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
    const split = text.search(/[。！？!?]/);
    if (split > 0 && split <= 60) {
      title = text.slice(0, split + 1).trim();
      body = text.slice(split + 1).trim();
    } else {
      title = text.slice(0, 30).trim();
      body = text.slice(30).trim();
    }
  }
  const parts = [];
  if (title) parts.push(title);
  if (body) parts.push(body);
  const cleaned = parts.join("\n").trim();
  if (cleaned.length < 10) return null;
  return { title, body, shortLink, cleaned };
}

function looksLikeXhsShare(raw) {
  if (!raw) return false;
  if (XHSLINK_RE.test(raw)) return true;
  if (XHS_FULL_RE.test(raw)) return true;
  if (/复制本条信息|【小红书】/.test(raw)) return true;
  return false;
}

const cases = [
  { name: "标准 xhslink 分享", raw: `32 杭州法喜寺Citywalk一日游 🌸 路线/拍照点全攻略
第一天从灵隐寺过去，走路 15 分钟。法喜寺氛围超棒，建议早上去人少。
http://xhslink.com/a/AbCdEf
复制本条信息，打开【小红书】App 查看精彩内容！` },
  { name: "无编号 + xiaohongshu.com 全链", raw: `杭州 4 天 3 夜亲测路线
DAY1: 西湖断桥 → 雷峰塔 → 河坊街
DAY2: 灵隐寺 → 法喜寺 → 龙井村
https://www.xiaohongshu.com/explore/12345abcdef
打开【小红书】App 查看` },
  { name: "只有正文无标题分隔", raw: "去了趟杭州法喜寺氛围真的太好了！http://xhslink.com/a/Xyz123" },
  { name: "纯正文（无分享格式）", raw: "今天去了西湖边的小餐馆，桂花鸡丁特别好吃，人均 80 不到。" },
  { name: "空字符串", raw: "" },
];

for (const c of cases) {
  console.log("\n=== " + c.name + " ===");
  console.log("looksLikeXhs:", looksLikeXhsShare(c.raw));
  console.log("result:", parseXhsShare(c.raw));
}
