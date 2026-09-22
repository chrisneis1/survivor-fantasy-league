import { NextResponse } from "next/server";
import { establishMember } from "@/server/auth";

// A personal invite link: signs the member in for their team and sends them to their page.
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const found = await establishMember((await params).token);
  if (!found) {
    return new NextResponse("This link isn't valid any more. Ask the commissioner for a new one.", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8", "referrer-policy": "no-referrer" },
    });
  }
  const res = NextResponse.redirect(new URL(`/${found.seasonId}/my`, req.url));
  res.headers.set("referrer-policy", "no-referrer");
  return res;
}
