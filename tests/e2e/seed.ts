// Builds the throwaway database the page tests run against (never production: only a local file: URL is accepted).
//   npx tsx tests/e2e/seed.ts .e2e/league.db
// Seasons: the bundled archived Survivor 43–48 and 50 (49 is left out, for the commissioner's "Add past seasons"
// button to add); "demo-active", a copy cut back to Episode 7 with a pick window open and the test player up next;
// "survivor-51", a new season still in setup with no teams or cast (the flows load its researched cast);
// "survivor-52", the same but left untouched; and "draft-demo", an opening draft three picks in.
import { mkdirSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import { createClient } from "@libsql/client";
import { bundledSeasons } from "../../src/data/archive";
import survivor50 from "../../src/data/seasons/survivor-50.json";
import { currentTurn, makeOpeningPick, makeReplacement, openOpeningSelection, openPickWindow, openWindow, openingBlock, openingTurn, replaceableSlots, replacementCheck } from "../../src/domain/picks";
import { createSeason } from "../../src/domain/setup";
import type { Season } from "../../src/domain/types";
import { hashPassword } from "../../src/server/session";
import { createStore } from "../../src/server/store";
import { PLAYER } from "./fixtures";

const CUT = 7;

async function main() {
  const file = process.argv[2];
  if (!file || file.includes(":")) throw new Error("Pass a local file path for the test database, e.g. .e2e/league.db");
  mkdirSync(dirname(file), { recursive: true });
  for (const f of [file, `${file}-wal`, `${file}-shm`, `${file}-journal`]) rmSync(f, { force: true });

  const ref = survivor50 as unknown as Season;
  const store = createStore(createClient({ url: `file:${file}` }), bundledSeasons.filter((s) => s.id !== "survivor-49"));
  await store.list();

  let s: Season = structuredClone(ref);
  s.id = "demo-active";
  s.name = "Demo Season";
  s.status = "ACTIVE";
  s.episodes = s.episodes.map((e) => (e.number > CUT ? { ...e, state: "SCHEDULED" } : e));
  s.scores = s.scores.filter((x) => x.episode <= CUT);
  s.statusEvents = s.statusEvents.filter((x) => x.afterEpisode <= CUT);
  s.transactions = s.transactions.filter((x) => x.windowAfterEpisode < CUT);
  s.corrections = s.corrections.filter((x) => x.episode <= CUT);
  s.tribeSwaps = s.tribeSwaps.filter((x) => x.episode <= CUT);
  s.windows = [];
  s.wagers = [];
  s.wagerState = "OFF";
  s = openPickWindow(s, CUT, "2026-03-01T00:00:00.000Z", "seed").season;
  // Two teams have already picked, so the queue, activity feed and availability all have something to show.
  for (let n = 0; n < 2; n++) {
    const w = openWindow(s);
    const t = w && currentTurn(w);
    if (!t) break;
    const slot = replaceableSlots(s, t.teamId, CUT + 1)[0];
    const c = s.castaways.find((x) => replacementCheck(s, t.teamId, slot, x.id, CUT + 1).ok);
    if (slot === undefined || !c) break;
    s = makeReplacement(s, t.teamId, slot, c.id, "seed", "2026-03-02T00:00:00.000Z").season;
  }
  await store.create(s);
  await store.create(createSeason(ref, "survivor-51", "Survivor 51"));
  // Survivor 52: another new season in setup, left untouched by the flows, for the empty-state page checks.
  await store.create(createSeason(ref, "survivor-52", "Survivor 52"));

  // "draft-demo": an opening draft in progress (three picks in), for undoing a draft back to setup.
  let d = createSeason(ref, "draft-demo", "Draft Demo");
  d.castaways = ref.castaways.map((c) => ({ ...c }));
  d.teams = ref.teams.slice(0, 4).map((t) => ({ id: t.id, member: t.member, name: t.name, draft: d.slots.map(() => "") }));
  d.config.openingSeed = d.teams.map((t) => t.id);
  d = openOpeningSelection(d, "seed").season;
  for (let n = 0; n < 3; n++) {
    const turn = openingTurn(d)!;
    const pick = d.slots.flatMap((_, slot) => d.castaways.filter((c) => openingBlock(d, turn.teamId, slot, c.id) === null).map((c) => [slot, c.id] as const))[0];
    d = makeOpeningPick(d, turn.teamId, pick[0], pick[1], "seed", "2026-03-03T00:00:00.000Z").season;
  }
  await store.create(d);

  const up = currentTurn(openWindow(s)!);
  if (!up) throw new Error("seed: expected a team to be up in the demo window");
  const player = await store.createUser(PLAYER.username, hashPassword(PLAYER.password));
  await store.assignUser("demo-active", up.teamId, player);
  console.log(`seeded ${file}: player "${PLAYER.username}" is up in demo-active as ${up.teamId}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
