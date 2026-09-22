import { headers } from "next/headers";
import { NextResponse } from "next/server";

// Temporary diagnostic: which headers does Render's proxy actually forward? Delete after use.
export async function GET() {
  const h = await headers();
  return NextResponse.json({
    host: h.get("host"),
    "x-forwarded-host": h.get("x-forwarded-host"),
    "x-forwarded-proto": h.get("x-forwarded-proto"),
    "x-forwarded-for": h.get("x-forwarded-for"),
  });
}
