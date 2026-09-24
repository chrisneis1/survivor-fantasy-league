// Replacement order: teams that lost a castaway this episode go first; teams with open slots left over from
// earlier skipped windows go after them. Within each group, lowest points act first.
import { test } from "node:test";
import assert from "node:assert/strict";
import survivor50 from "../src/data/seasons/survivor-50.json";
import type { Season } from "../src/domain/types";
import { buildPickQueue } from "../src/domain/engine";
import { publishEpisode, saveDraft } from "../src/domain/scoring";
import { createSeason } from "../src/domain/setup";

const ref = survivor50 as unknown as Season;
const at = "2026-01-15T20:00:00.000Z";

test("this episode's losers pick before earlier skips, each group lowest points first", () => {
  let s = createSeason(ref, "order-51", "Order 51");
  const ids = ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"];
  s.castaways = ids.map((id, i) => ({ id, name: id, initialTribeId: "cila", order: i + 1 }));
  s.slots = [{ id: "s1", name: "S1", restrictionTribeId: null, enforceOnSwap: false }];
  s.teams = ["x", "y", "z", "w"].map((id, i) => ({ id, member: id, name: id, draft: [ids[i]] }));
  s.config.openingSeed = ["x", "y", "z", "w"];
  s.config.ownershipCap = 2;
  s.status = "ACTIVE";
  s.episodes = s.episodes.slice(0, 4);
  // Ep 2: c1 (team x) voted out, and x skips. Ep 3: c2 (y) and c3 (z) voted out. Points: z 5, y 0... others differ.
  s = saveDraft(s, { episode: 1, rows: [{ castaway: "c4", inputs: { extra: { points: 9, note: "t" } } }] }, at);
  s = publishEpisode(s, 1, "t").season;
  s = saveDraft(s, { episode: 2, rows: [{ castaway: "c1", inputs: {}, exit: { type: "VOTED_OUT" } }] }, at);
  s = publishEpisode(s, 2, "t").season;
  s = saveDraft(s, { episode: 3, rows: [
    { castaway: "c2", inputs: {}, exit: { type: "VOTED_OUT" } },
    { castaway: "c3", inputs: { extra: { points: 3, note: "t" } }, exit: { type: "VOTED_OUT" } },
  ] }, at);
  s = publishEpisode(s, 3, "t").season;

  const q = buildPickQueue(s, 3).filter((e) => e.eligible).map((e) => e.teamId);
  // y (lost c2, 0 pts) then z (lost c3, 3 pts); x's open slot is a leftover skip, so it goes last.
  assert.deepEqual(q, ["y", "z", "x"]);
});

test("wagering auto-locks when the deadline episode is published and can't be reopened", async () => {
  const { openWagers, wagerProblem, wagerDeadlinePassed } = await import("../src/domain/wager");
  let s = createSeason(ref, "wager-51", "Wager 51");
  s.castaways = ["a", "b"].map((id, i) => ({ id, name: id, initialTribeId: "cila", order: i + 1 }));
  s.teams = [{ id: "x", member: "x", name: "x", draft: ["a"] }];
  s.slots = [{ id: "s1", name: "S1", restrictionTribeId: null, enforceOnSwap: false }];
  s.config.openingSeed = ["x"];
  s.status = "ACTIVE";
  s.episodes = s.episodes.slice(0, 4);
  s = openWagers(s, "t").season;
  s = publishEpisode(saveDraft(s, { episode: 1, rows: [{ castaway: "a", inputs: {} }] }, at), 1, "t").season;
  assert.equal(s.wagerState, "OPEN", "still open after episode 1");
  assert.equal(wagerProblem(s, "b", 5), null);
  s = publishEpisode(saveDraft(s, { episode: 2, rows: [{ castaway: "a", inputs: {} }] }, at), 2, "t").season;
  assert.equal(s.wagerState, "LOCKED");
  assert.ok(wagerDeadlinePassed(s));
  assert.throws(() => openWagers(s, "t"), /can't be opened/);
  assert.match(wagerProblem(s, "b", 5) ?? "", /isn't open/);
});

test("two castaways can't both be scored as the season winner", () => {
  let s = createSeason(ref, "win-51", "Win 51");
  s.castaways = ["a", "b"].map((id, i) => ({ id, name: id, initialTribeId: "cila", order: i + 1 }));
  s.teams = [{ id: "x", member: "x", name: "x", draft: ["a"] }];
  s.slots = [{ id: "s1", name: "S1", restrictionTribeId: null, enforceOnSwap: false }];
  s.config.openingSeed = ["x"];
  s.status = "ACTIVE";
  s.episodes = s.episodes.slice(0, 1);
  s.episodes[0].phase = "finale";
  const rule = s.config.wager.winnerRule;
  const both = saveDraft(s, { episode: 1, rows: [{ castaway: "a", inputs: { [rule]: { on: true } } }, { castaway: "b", inputs: { [rule]: { on: true } } }] }, at);
  assert.throws(() => publishEpisode(both, 1, "t"), /Only one castaway can win/);
  const one = saveDraft(s, { episode: 1, rows: [{ castaway: "a", inputs: { [rule]: { on: true } } }] }, at);
  assert.equal(publishEpisode(one, 1, "t").season.episodes[0].state, "PUBLISHED");
});
