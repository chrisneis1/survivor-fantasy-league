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

test("teams tied on points are ordered by a random draw when the window opens, then the order is fixed", async () => {
  const { openPickWindow } = await import("../src/domain/picks");
  const { migrateSeason } = await import("../src/domain/migrate");
  let s = createSeason(ref, "ties-51", "Ties 51");
  const ids = ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"];
  s.castaways = ids.map((id, i) => ({ id, name: id, initialTribeId: "cila", order: i + 1 }));
  s.slots = [{ id: "s1", name: "S1", restrictionTribeId: null, enforceOnSwap: false }];
  s.teams = [
    { id: "x", member: "x", name: "x", draft: ["c1"] },
    { id: "y", member: "y", name: "y", draft: ["c1"] },
    { id: "z", member: "z", name: "z", draft: ["c3"] },
  ];
  s.config.openingSeed = ["x", "y", "z"];
  s.config.ownershipCap = 2;
  s.status = "ACTIVE";
  s.episodes = s.episodes.slice(0, 3);
  // z's castaway quits first (z's round); then x and y both lose c1 at the vote with 0 points: a tie.
  s = saveDraft(s, { episode: 1, rows: [
    { castaway: "c1", inputs: {}, exit: { type: "VOTED_OUT" } },
    { castaway: "c3", inputs: { extra: { points: 4, note: "t" } }, exit: { type: "QUIT" } },
  ] }, at);
  s = publishEpisode(s, 1, "t").season;
  s = migrateSeason(s);
  assert.equal(s.config.pickOrderTieRule, "RANDOM_DRAW", "seasons being played draw ties");

  const preview = buildPickQueue(s, 1);
  assert.deepEqual(preview.map((e) => [e.teamId, e.tied, e.drawn]), [["z", false, undefined], ["y", true, undefined], ["x", true, undefined]], "before the draw: seed order, marked tied");

  const queue = (draws: number[]) => {
    const r = openPickWindow(s, 1, at, "admin", () => draws.shift()!);
    return { order: r.season.windows[0].turns.map((t) => t.teamId), turns: r.season.windows[0].turns, audit: r.audit[0] };
  };
  // Draws are taken in team-list order (x, y, z); the lower draw picks first within a tie.
  assert.deepEqual(queue([0.9, 0.1, 0.5]).order, ["z", "y", "x"]);
  const xFirst = queue([0.1, 0.9, 0.5]);
  assert.deepEqual(xFirst.order, ["z", "x", "y"], "the draw, not the opening seed, decides");
  assert.deepEqual(xFirst.turns.map((t) => !!t.tieDrawn), [false, true, true]);
  assert.deepEqual((xFirst.audit.after as { tieDrawn: string[] }).tieDrawn, ["x", "y"]);

  // Finished seasons keep the rule they were played under.
  const old = { ...structuredClone(s), status: "ARCHIVED" as const, migrations: [], config: { ...s.config, pickOrderTieRule: "OPENING_SEED_REVERSE" as const } };
  assert.equal(migrateSeason(old).config.pickOrderTieRule, "OPENING_SEED_REVERSE");
});

test("the pick order runs in rounds by who left first: everyone who lost the first castaway out, then it starts again", async () => {
  const { openPickWindow, makeReplacement, currentTurn } = await import("../src/domain/picks");
  const { migrateSeason } = await import("../src/domain/migrate");
  // Survivor 51 after Episode 3: Rob quit, then Patt was voted out. Diego had both; Jack had Rob; three others had Patt.
  let s = createSeason(ref, "rounds-51", "Rounds 51");
  const ids = ["rob", "patt", "a", "b", "c", "d", "e", "f"];
  s.castaways = ids.map((id, i) => ({ id, name: id[0].toUpperCase() + id.slice(1), initialTribeId: "cila", order: i + 1 }));
  s.slots = ["S1", "S2"].map((n) => ({ id: n, name: n, restrictionTribeId: null, enforceOnSwap: false }));
  s.teams = [
    { id: "diego", member: "Diego", name: "DF", draft: ["rob", "patt"] },
    { id: "jack", member: "Jack", name: "J", draft: ["rob", "a"] },
    { id: "lindsey", member: "Lindsey", name: "L", draft: ["patt", "b"] },
    { id: "dalsin", member: "Dalsin", name: "D", draft: ["patt", "c"] },
  ];
  s.config.openingSeed = ["diego", "jack", "lindsey", "dalsin"];
  s.config.ownershipCap = 4;
  s.status = "ACTIVE";
  s.episodes = s.episodes.slice(0, 3);
  // Patt is entered first in the grid, but Rob quit first: quits and evacuations come before the vote.
  s = saveDraft(s, { episode: 1, rows: [
    { castaway: "patt", inputs: {}, exit: { type: "VOTED_OUT" } },
    { castaway: "rob", inputs: {}, exit: { type: "QUIT" } },
    { castaway: "b", inputs: { extra: { points: 2, note: "t" } } },
    { castaway: "c", inputs: { extra: { points: 3, note: "t" } } },
    { castaway: "a", inputs: { extra: { points: 1, note: "t" } } },
  ] }, at);
  s = migrateSeason(publishEpisode(s, 1, "t").season);
  const q = buildPickQueue(s, 1).filter((e) => e.eligible);
  assert.deepEqual(q.map((e) => [e.teamId, e.out]), [["diego", "rob"], ["jack", "rob"], ["diego", "patt"], ["lindsey", "patt"], ["dalsin", "patt"]]);

  // Diego picks once for Rob, then waits for the Patt round; the turn only fills Rob's slot.
  let o = openPickWindow(s, 1, at, "admin").season;
  assert.throws(() => makeReplacement(o, "diego", 1, "d", "m", at), /This turn replaces Rob/);
  o = makeReplacement(o, "diego", 0, "d", "m", at).season;
  assert.equal(currentTurn(o.windows[0])!.teamId, "jack");

  // The commissioner can set the order they left when it isn't quits-first: here Patt left before Rob.
  const s2 = structuredClone(s);
  s2.statusEvents.find((e) => e.castaway === "patt")!.order = 1;
  s2.statusEvents.find((e) => e.castaway === "rob")!.order = 2;
  assert.deepEqual(buildPickQueue(s2, 1).filter((e) => e.eligible).map((e) => [e.teamId, e.out]), [["diego", "patt"], ["lindsey", "patt"], ["dalsin", "patt"], ["diego", "rob"], ["jack", "rob"]]);
});

test("a window already open with one turn per team, and nobody picked yet, is re-queued once on load", async () => {
  const { migrateSeason } = await import("../src/domain/migrate");
  const s = createSeason(ref, "requeue-51", "Requeue 51");
  s.castaways = ["rob", "patt", "a"].map((id, i) => ({ id, name: id, initialTribeId: "cila", order: i + 1 }));
  s.slots = ["S1", "S2"].map((n) => ({ id: n, name: n, restrictionTribeId: null, enforceOnSwap: false }));
  s.teams = [
    { id: "diego", member: "Diego", name: "DF", draft: ["rob", "patt"] },
    { id: "jack", member: "Jack", name: "J", draft: ["rob", "a"] },
  ];
  s.config.openingSeed = ["diego", "jack"];
  s.config.ownershipCap = 2;
  s.status = "ACTIVE";
  s.episodes = s.episodes.slice(0, 3);
  let p = saveDraft(s, { episode: 1, rows: [{ castaway: "patt", inputs: {}, exit: { type: "VOTED_OUT" } }, { castaway: "rob", inputs: {}, exit: { type: "QUIT" } }] }, at);
  p = publishEpisode(p, 1, "t").season;
  // The old shape: one turn per team, Diego up with both slots.
  p.windows = [{ id: "w1", afterEpisode: 1, status: "OPEN", openedAt: at, turns: [
    { sequence: 1, teamId: "diego", pointsAtOpen: 0, rankAtOpen: 1, openSlots: 2, eligible: true, status: "UP_NOW", picks: 0, startedAt: at },
    { sequence: 2, teamId: "jack", pointsAtOpen: 0, rankAtOpen: 1, openSlots: 1, eligible: true, status: "WAITING", picks: 0 },
  ] }];
  p.migrations = (p.migrations ?? []).filter((m) => m !== "pick-turns-per-castaway");
  const m = migrateSeason(structuredClone(p));
  assert.deepEqual(m.windows[0].turns.map((t) => [t.teamId, t.out, t.status]), [["diego", "rob", "UP_NOW"], ["jack", "rob", "WAITING"], ["diego", "patt", "WAITING"]]);
  assert.deepEqual(migrateSeason(structuredClone(p)).windows[0].turns, m.windows[0].turns, "the same queue every load until it's saved");
  assert.equal(migrateSeason(structuredClone(m)).windows[0].turns.length, 3, "only once");
});
