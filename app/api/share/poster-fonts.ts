/* Poster font loading at runtime. next/og embeds only Geist Regular 400
   by default; CJK goes through its built-in dynamic loading (a text=
   subset of Noto Sans SC 400, cached in-process) — so Chinese never
   tofus by default. But bold headlines and mono digits are the core of
   this poster language, and the defaults can't provide them (dynamic
   loading is 400-only). Plan:
   - JetBrains Mono 400/700/800 full TTFs (Latin/digits/symbols), fetched
     once on first request, module-level cache;
   - Noto Sans SC 700 as a text= subset of the characters the poster
     actually uses (a few KB), cached per character set;
   - any failure returns an empty array -> the route passes no fonts and
     next/og's default Geist + dynamic Noto 400 take over — weaker
     weights, never tofu.
   The old-UA header makes the Google Fonts css2 endpoint return TTF
   (Satori has no woff2) — the same trick as next/og's own loader. */
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
  /* 5s timeout (20260822 P1-9): Google Fonts hanging shouldn't hang the poster route —
     on timeout/exception, fall back to the existing empty-array return per the contract (better weak than tofu) */
  const css = await (
    await fetch(url, { headers: { "User-Agent": TTF_UA }, signal: AbortSignal.timeout(5_000) })
  ).text();
  const m = /src: url\((.+?)\) format\('(?:opentype|truetype)'\)/.exec(css);
  if (!m) return null;
  const res = await fetch(m[1], { signal: AbortSignal.timeout(5_000) });
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
          /* One failed weight never blocks the others. */
        }
      }
      return out;
    })();
  }
  return latinPromise;
}

/* CJK and fullwidth punctuation (poster headlines are mostly Chinese —
   punctuation needs bold coverage too). */
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
    if (cjkBoldCache.size > 50) cjkBoldCache.clear(); // cached per
                                                       // character set,
                                                       // bounded
    cjkBoldCache.set(chars, p);
  }
  return p;
}

/* Every font a poster needs; text = dynamic text + static labels
   (POSTER_STATIC_TEXT). Contract: when the CJK subset fetch fails but the
   text contains CJK, the whole set falls back to an empty array (the
   route passes no fonts; next/og's default Geist + dynamic Noto 400
   take over) — prefer weaker weights over Latin-only tofu (same promise
   as the file header). */
export async function getPosterFonts(text: string): Promise<PosterFont[]> {
  const [latin, cjkBold] = await Promise.all([latinFonts(), cjkBoldFont(text)]);
  const needsCjk = [...text].some((c) => CJK_RE.test(c));
  if (needsCjk && !cjkBold) return [];
  return cjkBold ? [...latin, cjkBold] : latin;
}
