/* 海报字体运行时加载(S5-2)。
   next/og 默认只内嵌 Geist Regular 400:CJK 靠其内置动态加载(按 text= 子集
   拉 Noto Sans SC 400,进程内缓存)——所以中文本来就不会豆腐;但粗体大标题
   和 mono 数字是这套海报视觉的核心,默认字体给不了(动态加载也只有 400)。
   方案:
   - JetBrains Mono 400/700/800 全量 TTF(拉丁/数字/符号走它),首次请求拉一次,
     模块级缓存;
   - Noto Sans SC 700 按海报实际用到的汉字 text= 子集(几 KB),按字符集内容缓存;
   - 任何一步失败就退回空数组 → 路由不传 fonts,next/og 默认 Geist + 动态
     Noto 400 接管,字重弱一些但绝不豆腐。
   老 UA 头让 Google Fonts css2 接口直接回 TTF(Satori 不支持 woff2),
   与 next/og 内置加载器同一技巧。 */
export interface PosterFont {
  name: string;
  data: ArrayBuffer;
  weight: 400 | 700 | 800;
  style: "normal";
}

const CSS_API = "https://fonts.googleapis.com/css2";
const TTF_UA =
  "Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_8; de-at) AppleWebKit/533.21.1 (KHTML, like Gecko) Version/5.0.5 Safari/533.21.1";

async function fetchTtf(family: string, text?: string): Promise<ArrayBuffer | null> {
  const url = `${CSS_API}?family=${family}&display=swap${text ? `&text=${encodeURIComponent(text)}` : ""}`;
  const css = await (await fetch(url, { headers: { "User-Agent": TTF_UA } })).text();
  const m = /src: url\((.+?)\) format\('(?:opentype|truetype)'\)/.exec(css);
  if (!m) return null;
  const res = await fetch(m[1]);
  return res.ok ? res.arrayBuffer() : null;
}

let latinPromise: Promise<PosterFont[]> | null = null;

function latinFonts(): Promise<PosterFont[]> {
  if (!latinPromise) {
    latinPromise = (async () => {
      const out: PosterFont[] = [];
      for (const weight of [400, 700, 800] as const) {
        try {
          const data = await fetchTtf(`JetBrains+Mono:wght@${weight}`);
          if (data) out.push({ name: "JetBrains Mono", data, weight, style: "normal" });
        } catch {
          /* 单字重失败不阻塞其余字重 */
        }
      }
      return out;
    })();
  }
  return latinPromise;
}

/* CJK 与全角标点(海报标题以中文为主,标点也要粗体覆盖)。 */
const CJK_RE = /[　-〿㐀-䶿一-鿿豈-﫿＀-￯]/;

const cjkBoldCache = new Map<string, Promise<PosterFont | null>>();

function cjkBoldFont(text: string): Promise<PosterFont | null> {
  const chars = [...new Set([...text].filter((c) => CJK_RE.test(c)))].join("");
  if (!chars) return Promise.resolve(null);
  let p = cjkBoldCache.get(chars);
  if (!p) {
    p = (async () => {
      try {
        const data = await fetchTtf("Noto+Sans+SC:wght@700", chars);
        return data ? { name: "Noto Sans SC", data, weight: 700 as const, style: "normal" as const } : null;
      } catch {
        return null;
      }
    })();
    if (cjkBoldCache.size > 50) cjkBoldCache.clear(); // 子集按内容缓存,防无限增长
    cjkBoldCache.set(chars, p);
  }
  return p;
}

/* 一张海报要用的全部字体;text = 动态文本 + 静态标签(POSTER_STATIC_TEXT)。 */
export async function getPosterFonts(text: string): Promise<PosterFont[]> {
  const [latin, cjkBold] = await Promise.all([latinFonts(), cjkBoldFont(text)]);
  return cjkBold ? [...latin, cjkBold] : latin;
}
