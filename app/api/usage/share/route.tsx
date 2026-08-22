import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { getSessionUser } from "@/src/lib/auth/session";
import { getLocale } from "@/src/lib/i18n-server";
import { getUsageSettings } from "@/src/lib/usage/settings";
import {
  getUsageShareSnapshot,
  mockUsageShareSnapshot,
  normalizeUsageShareRange,
  usageShareText,
} from "@/src/lib/usage/share";
import { getPosterFonts } from "@/app/api/share/poster-fonts";
import { POSTER_STATIC_TEXT } from "@/app/api/share/poster-kit";
import { UsageSharePoster, USAGE_SHARE_POSTER_SIZE } from "./UsageSharePoster";

export const dynamic = "force-dynamic";

function clampTz(value: string | null): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(-720, Math.min(840, Math.trunc(parsed))) : 0;
}

export async function GET(request: NextRequest) {
  const range = normalizeUsageShareRange(request.nextUrl.searchParams.get("range"));
  const preview = process.env.NODE_ENV === "development" && request.nextUrl.searchParams.get("preview") === "1";
  const user = preview ? null : await getSessionUser();
  /* Poster language follows the exporting UI language (zh mixes Chinese
     and English; en is English-only). */
  const zh = (await getLocale(user)) === "zh";
  const snapshot = preview
    ? mockUsageShareSnapshot(range, zh)
    : await (async () => {
        if (!user) return null;
        const settings = await getUsageSettings(user.id);
        return getUsageShareSnapshot({
          user,
          range,
          tzOffsetMinutes: clampTz(request.nextUrl.searchParams.get("tz")),
          uploadProject: settings.uploadProject,
          retentionDays: settings.retentionDays,
          zh,
          publicProfile: settings.showOnLeaderboard,
        });
      })();

  if (!snapshot) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const download = request.nextUrl.searchParams.get("download") === "1";
  const fonts = await getPosterFonts(usageShareText(snapshot) + POSTER_STATIC_TEXT);
  return new ImageResponse(<UsageSharePoster snapshot={snapshot} />, {
    ...USAGE_SHARE_POSTER_SIZE,
    /* Satori treats an empty array as zero fonts (all tofu) — fall back
       to the default fonts. */
    ...(fonts.length ? { fonts } : {}),
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="kimi-builders-usage-${range}.png"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
