// Final wager: eligibility, limits, 1:1 settlement, and the guarantee that picks stay secret until finalize.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import survivor50 from "../src/data/seasons/survivor-50.json";
import type { DraftRow, Season } from "../src/domain/types";
import { publishEpisode, saveDraft } from "../src/domain/scoring";
import { activateSeason, createSeason, finalizeSeason } from "../src/domain/setup";
import { findWinner, lockWagers, openWagers, resolveWagers, wagerCandidates, wagerProblem } from "../src/domain/wager";
import { createStore } from "../src/server/store";

const ref = survivor50 as unknown as Season;
const at = "2026-03-01T00:00:00.000Z";

/** Three teams, three episodes (the last is the finale). a1 is the eventual winner. */
function season(): Season {
  const s = createSeason(ref, "w-51", "W 51");
  s.castaways = ["a1", "a2", "a3", "b1", "b2", "b3", "v1", "v2", "v3"].map((id, i) => ({
    id,
    name: id.toUpperCase(),
    initialTribeId: id[0] === "a" ? "cila" : id[0] === "b" ? "kalo" : "vatu",
    order: i + 1,
  }));
  s.teams = [
    { id: "x", member: "X", name: "Team X", draft: ["v1", "a1", "b1", "v2"] },
    { id: "y", member: "Y", name: "Team Y", draft: ["v3", "a2", "b2", "v1"] },
    { id: "z", member: "Z", name: "Team Z", draft: ["a3", "a3", "b3", "v3"].map((c, i) => (i === 0 ? "v2" : c)) },
  ];
  s.config.openingSeed = ["x", "y", "z"];
  s.config.ownershipCap = 3;
  s.episodes = s.episodes.slice(0, 3);
  s.episodes[2].phase = "finale";
  return s;
}
const row = (castaway: string, inputs: DraftRow["inputs"], exit?: DraftRow["exit"]): DraftRow => ({ castaway, inputs, exit });
const play = (s: Season, ep: number, rows: DraftRow[]) => publishEpisode(saveDraft(s, { episode: ep, rows }, at), ep, "t").season;

function finished(): Season {
  let s = activateSeason(season(), "t").season;
  s = play(s, 1, [row("a2", { journey: { on: true } }, { type: "VOTED_OUT" })]);
  s = play(s, 2, [row("a1", { journey: { on: true } })]);
  s = play(s, 3, [row("a1", { winner: { on: true } })]); // a1 wins the season (+10 finale)
  return s;
}

test("wagering is off until the commissioner opens it, and can be locked and reopened", () => {
  let s = activateSeason(season(), "t").season;
  assert.equal(s.wagerState, "OFF");
  assert.match(wagerProblem(s, "a1", 5)!, /isn't open/);
  assert.throws(() => lockWagers(s, "t"), /isn't open/);
  assert.throws(() => openWagers(season(), "t"), /once the season is active/);
  s = openWagers(s, "t").season;
  assert.equal(s.wagerState, "OPEN");
  assert.throws(() => openWagers(s, "t"), /already open/);
  s = lockWagers(s, "t").season;
  assert.equal(s.wagerState, "LOCKED");
  assert.match(wagerProblem(s, "a1", 5)!, /isn't open/);
  assert.equal(openWagers(s, "t").audit[0].action, "REOPEN");
});

test("a wager is a whole number of points from the minimum to 30, on a castaway still in the game", () => {
  let s = activateSeason(season(), "t").season;
  s = openWagers(s, "t").season;
  assert.equal(s.config.wager.maxStake, 30);
  assert.equal(wagerProblem(s, "a1", 30), null);
  assert.equal(wagerProblem(s, "a1", 1), null);
  assert.match(wagerProblem(s, "a1", 31)!, /from 1 to 30/);
  assert.match(wagerProblem(s, "a1", 0)!, /from 1 to 30/);
  assert.match(wagerProblem(s, "a1", 2.5)!, /whole number/);
  assert.match(wagerProblem(s, "nobody", 5)!, /isn't in the game/);
  // Once a castaway is voted out they can no longer be backed.
  s = play(s, 1, [row("a2", {}, { type: "VOTED_OUT" })]);
  assert.equal(wagerCandidates(s).some((c) => c.id === "a2"), false);
  assert.match(wagerProblem(s, "a2", 5)!, /isn't in the game/);
  assert.equal(wagerProblem(s, "a1", 5), null);
});

test("settlement is 1:1: a correct pick gains the stake, a wrong pick loses it, no wager is neutral", () => {
  const s = finished();
  assert.equal(findWinner(s), "a1");
  const w = resolveWagers(s, [{ team: "x", castaway: "a1", stake: 30 }, { team: "y", castaway: "b1", stake: 12 }], "a1");
  const by = Object.fromEntries(w.map((r) => [r.team, r]));
  assert.equal(by.x.points, 30);
  assert.equal(by.y.points, -12);
  assert.equal(by.z.points, 0);
  assert.equal(by.z.castaway, null);
  assert.equal(by.x.stake, 30);
  // x owns a1 (+10 finale +1 journey) so it leads before the wager; check totals and shared ranks after.
  const base = Object.fromEntries(w.map((r) => [r.team, r.pointsAfterWager - r.points]));
  assert.equal(by.x.pointsAfterWager, base.x + 30);
  assert.equal(by.y.pointsAfterWager, base.y - 12);
  assert.equal(by.x.rankAfterWager, 1);
});

test("finalize needs wagering locked and a scored winner, then settles every pick", () => {
  let s = finished();
  s = openWagers({ ...s }, "t").season;
  assert.throws(() => finalizeSeason(s, "t", []), /Lock wagering/);
  s = lockWagers(s, "t").season;
  const entries = [{ team: "x", castaway: "a1", stake: 7 }, { team: "z", castaway: "b3", stake: 20 }];
  const done = finalizeSeason(s, "t", entries);
  assert.equal(done.season.status, "ARCHIVED");
  assert.equal(done.season.wagers.length, 3);
  assert.equal(done.season.wagers.find((w) => w.team === "x")!.points, 7);
  assert.equal(done.season.wagers.find((w) => w.team === "z")!.points, -20);
  assert.deepEqual(done.audit[0].after, { winner: "a1", wagers: 2 });

  // No winner scored: the wagers cannot be settled.
  let noWinner = activateSeason(season(), "t").season;
  noWinner = openWagers(noWinner, "t").season;
  noWinner = lockWagers(noWinner, "t").season;
  for (const n of [1, 2, 3]) noWinner = play(noWinner, n, [row("a1", { journey: { on: true } })]);
  assert.throws(() => finalizeSeason(noWinner, "t", entries), /Sole Survivor/);
});

test("a season without wagering finalizes with no wager results", () => {
  const done = finalizeSeason(finished(), "t");
  assert.equal(done.season.wagerState, "OFF");
  assert.deepEqual(done.season.wagers, []);
});

test("nothing about anyone's pick exists in the season before finalize", () => {
  let s = activateSeason(season(), "t").season;
  s = openWagers(s, "t").season;
  s = lockWagers(s, "t").season;
  assert.deepEqual(s.wagers, [], "results are empty until finalize");
  assert.equal(JSON.stringify(s).includes('"stake"'), false, "no stake appears anywhere in the season data");
});

// ---------- storage: picks are separate and private ----------

const dir = mkdtempSync(join(tmpdir(), "league-wager-"));
after(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* Windows keeps SQLite files locked until exit */
  }
});

test("placing a wager never touches the season document; the audit row says who placed one, not what", async () => {
  const store = createStore(createClient({ url: `file:${join(dir, "priv.db")}` }), [ref]);
  let s = activateSeason(season(), "t").season;
  s = openWagers(s, "t").season;
  await store.create(s);
  const v0 = (await store.get("w-51"))!.version;

  await store.placeWager("w-51", "x", "a1", 12, (cur) => wagerProblem(cur, "a1", 12));
  assert.equal((await store.get("w-51"))!.version, v0, "the season document was not written");
  assert.deepEqual(await store.ownWager("w-51", "x"), { team: "x", castaway: "a1", stake: 12 });
  assert.equal(await store.ownWager("w-51", "y"), null, "another team has no access to x's pick");
  assert.deepEqual([...(await store.wagerPlacedBy("w-51"))], ["x"]);

  const log = await store.audit("w-51");
  assert.equal(log[0].action, "WAGER_PLACED");
  assert.equal(log[0].entityId, "x");
  assert.equal(log[0].before, undefined);
  assert.equal(log[0].after, undefined);
  assert.equal(JSON.stringify(log).includes("a1"), false, "the pick is not in the audit log");

  // Changing it replaces the old pick.
  await store.placeWager("w-51", "x", "b2", 5, (cur) => wagerProblem(cur, "b2", 5));
  assert.deepEqual(await store.ownWager("w-51", "x"), { team: "x", castaway: "b2", stake: 5 });
});

test("a wager is rejected inside the transaction once wagering is locked, or if the pick is invalid", async () => {
  const store = createStore(createClient({ url: `file:${join(dir, "lock.db")}` }), [ref]);
  let s = openWagers(activateSeason(season(), "t").season, "t").season;
  await store.create(s);
  await assert.rejects(store.placeWager("w-51", "x", "a1", 99, (cur) => wagerProblem(cur, "a1", 99)), /from 1 to 30/);

  const cur = (await store.get("w-51"))!;
  s = lockWagers(cur.season, "t").season;
  await store.save(s, cur.version);
  await assert.rejects(store.placeWager("w-51", "x", "a1", 5, (c) => wagerProblem(c, "a1", 5)), /isn't open/);
  assert.equal((await store.wagerPlacedBy("w-51")).size, 0, "nothing was stored");

  // finalize is the only reader of every pick
  const reopened = (await store.get("w-51"))!;
  await store.save(openWagers(reopened.season, "t").season, reopened.version);
  await store.placeWager("w-51", "y", "b1", 9, (c) => wagerProblem(c, "b1", 9));
  assert.deepEqual(await store.revealWagers("w-51"), [{ team: "y", castaway: "b1", stake: 9 }]);
});

test("a season stored before wagers existed loads with wagering off (or locked if it has results)", async () => {
  const { migrateSeason } = await import("../src/domain/migrate");
  const old = structuredClone(survivor50) as unknown as Record<string, any>;
  delete old.wagerState;
  delete old.config.wager;
  const m = migrateSeason(old as unknown as Season);
  assert.equal(m.wagerState, "LOCKED", "an archived season with results is settled");
  assert.equal(m.config.wager.maxStake, 30);
  const blank = structuredClone(survivor50) as unknown as Record<string, any>;
  delete blank.wagerState;
  delete blank.config.wager;
  blank.wagers = [];
  assert.equal(migrateSeason(blank as unknown as Season).wagerState, "OFF");
});
