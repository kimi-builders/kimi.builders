import { NextRequest, NextResponse } from "next/server";

import {
  USAGE_PRICE_CATALOG,
  USAGE_PRICE_CATALOG_ETAG,
} from "@/src/lib/usage/price-catalog";

const CACHE_CONTROL = "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400";

export async function GET(request: NextRequest) {
  const headers = {
    "Cache-Control": CACHE_CONTROL,
    ETag: USAGE_PRICE_CATALOG_ETAG,
    "X-Content-Type-Options": "nosniff",
  };
  // Compression can weaken the ETag on the wire. GET revalidation compares opaque tags.
  const validators = request.headers.get("if-none-match");
  if (validators === "*" || validators?.split(",").some(
    (tag) => tag.trim().replace(/^W\//, "") === USAGE_PRICE_CATALOG_ETAG,
  )) {
    return new NextResponse(null, { status: 304, headers });
  }
  return NextResponse.json(USAGE_PRICE_CATALOG, { headers });
}

