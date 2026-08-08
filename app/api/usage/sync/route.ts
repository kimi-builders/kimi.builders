/* Legacy v1 endpoint.
   The former site-wide secret + handle authentication allowed one leaked
   secret to write usage for any account. Phase 0 retires that flow before
   v2 per-device authorization and /api/usage/ingest are introduced. */
import { NextResponse } from "next/server";

export function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: {
        code: "usage_sync_v1_retired",
        message: "The shared-secret usage sync endpoint has been retired.",
        help: "/usage",
        nextProtocolVersion: 2,
      },
    },
    {
      status: 410,
      headers: {
        "Cache-Control": "no-store",
        Link: '</usage>; rel="help"',
      },
    },
  );
}
