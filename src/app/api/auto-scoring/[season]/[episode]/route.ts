// The weekly auto-scorer's door into the site (see src/domain/auto-scoring.ts).
//   GET  /api/auto-scoring/<season>/<episode>   the episode's scoring setup: rules, castaways still in the game
//   PUT  /api/auto-scoring/<season>/<episode>   save scoring as progress (never publishes)
// Both need "Authorization: Bearer <LEAGUE_SCORING_TOKEN>". With no token configured on the server, it's switched off.
import { createHash, timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { AUTO_SCORER, AutoScoringError, saveAutoScoring, scoringBrief, type AutoScoringInput } from "@/domain/auto-scoring";
import { store } from "@/server";
import { ConflictError } from "@/server/store";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ season: string; episode: string }> };

const json = (status: number, body: unknown) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

function authorized(req: Request): Response | null {
  const expected = process.env.LEAGUE_SCORING_TOKEN;
  if (!expected) return json(503, { error: "Auto-scoring is switched off: LEAGUE_SCORING_TOKEN isn't set on the server." });
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const digest = (v: string) => createHash("sha256").update(v).digest();
  if (!given || !timingSafeEqual(digest(given), digest(expected))) return json(401, { error: "Missing or wrong token." });
  return null;
}

const episodeNumber = (raw: string) => (/^\d+$/.test(raw) ? Number(raw) : NaN);

export async function GET(req: Request, { params }: Params) {
  const denied = authorized(req);
  if (denied) return denied;
  const p = await params;
  const cur = await store().get(p.season);
  if (!cur) return json(404, { error: `There's no season "${p.season}".` });
  try {
    return json(200, scoringBrief(cur.season, episodeNumber(p.episode)));
  } catch (e) {
    if (e instanceof AutoScoringError) return json(e.status, { error: e.message });
    throw e;
  }
}

export async function PUT(req: Request, { params }: Params) {
  const denied = authorized(req);
  if (denied) return denied;
  const p = await params;
  const episode = episodeNumber(p.episode);
  let input: AutoScoringInput;
  try {
    input = (await req.json()) as AutoScoringInput;
  } catch {
    return json(400, { error: "The body must be JSON: { rows: [...], note?: string }." });
  }
  for (let attempt = 0; ; attempt++) {
    const cur = await store().get(p.season);
    if (!cur) return json(404, { error: `There's no season "${p.season}".` });
    try {
      const next = saveAutoScoring(cur.season, episode, input, new Date().toISOString());
      const saved = next.drafts.find((d) => d.episode === episode)!;
      await store().save(next, cur.version, [
        { seasonId: next.id, actor: AUTO_SCORER, entityType: "episode", entityId: String(episode), action: "AUTO_SCORING_SAVED", after: { rows: saved.rows.length } },
      ]);
      revalidatePath("/", "layout");
      return json(200, { ok: `Saved scoring for ${saved.rows.length} castaways as progress on episode ${episode}. The commissioner reviews and publishes it.`, rows: saved.rows.length });
    } catch (e) {
      if (e instanceof ConflictError && attempt < 2) continue;
      if (e instanceof AutoScoringError) return json(e.status, { error: e.message, problems: e.problems });
      if (e instanceof ConflictError) return json(409, { error: e.message });
      throw e;
    }
  }
}
