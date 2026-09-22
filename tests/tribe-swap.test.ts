// Tracking a castaway's current tribe after a swap, entered from the scoring grid.
import { test } from "node:test";
import assert from "node:assert/strict";
import survivor50 from "../src/data/seasons/survivor-50.json";
import type { DraftRow, Season } from "../src/domain/types";
import { currentTribeId, tribeBeforeEpisode } from "../src/domain/engine";
import { cellKey, correctEpisode, publishEpisode, rowsFromPublished, saveDraft } from "../src/domain/scoring";
import { activateSeason, createSeason } from "../src/domain/setup";

const ref = survivor50 as unknown as Season;
const at = "2026-03-01T00:00:00.000Z";

function season(): Season {
  const s = createSeason(ref, "sw-51", "SW 51");
  s.castaways = ["a1", "a2", "b1", "b2"].map((id, i) => ({ id, name: id.toUpperCase(), initialTribeId: id[0] === "a" ? "cila" : "kalo", order: i + 1 }));
  s.teams = [
    { id: "x", member: "X", name: "X", draft: ["a1", "a2", "b1", "b2"] },
    { id: "y", member: "Y", name: "Y", draft: ["b2", "b1", "a2", "a1"] },
  ];
  s.slots = [
    { id: "slot1", name: "S1", restrictionTribeId: null, enforceOnSwap: false },
    { id: "slot2", name: "S2", restrictionTribeId: null, enforceOnSwap: false },
    { id: "slot3", name: "S3", restrictionTribeId: null, enforceOnSwap: false },
    { id: "slot4", name: "S4", restrictionTribeId: null, enforceOnSwap: false },
  ];
  s.config.openingSeed = ["x", "y"];
  s.config.ownershipCap = 2;
  s.episodes = s.episodes.slice(0, 4);
  s.episodes[3].phase = "finale";
  return s;
}
const row = (castaway: string, tribe?: string): DraftRow => ({ castaway, inputs: {}, tribe });

test("with no swap recorded, current tribe is always the starting tribe", () => {
  const s = season();
  assert.equal(currentTribeId(s, "a1", 1), "cila");
  assert.equal(currentTribeId(s, "a1", 99), "cila");
  assert.equal(tribeBeforeEpisode(s, "a1", 1), "cila");
});

test("publishing an episode with a checked tribe different from the current one records a swap, effective that episode", () => {
  let s = activateSeason(season(), "t").season;
  s = saveDraft(s, { episode: 1, rows: [row("a1", "kalo"), row("a2", "cila")] }, at);
  s = publishEpisode(s, 1, "t").season;
  assert.equal(s.tribeSwaps.length, 1, "a2 -> cila is a no-op: already on cila");
  assert.deepEqual(s.tribeSwaps[0], { castaway: "a1", episode: 1, tribeId: "kalo" });
  assert.equal(currentTribeId(s, "a1", 1), "kalo");
  assert.equal(currentTribeId(s, "a1", 0), "cila", "before episode 1 they were still on their starting tribe");
  assert.equal(tribeBeforeEpisode(s, "a1", 1), "cila");
});

test("checking the same tribe every episode never accumulates swap records", () => {
  let s = activateSeason(season(), "t").season;
  for (const n of [1, 2, 3]) {
    s = saveDraft(s, { episode: n, rows: [row("a1", "cila")] }, at);
    s = publishEpisode(s, n, "t").season;
  }
  assert.equal(s.tribeSwaps.length, 0);
});

test("rowsFromPublished always reports the effective current tribe, whether or not that episode was the swap", () => {
  let s = activateSeason(season(), "t").season;
  s = saveDraft(s, { episode: 1, rows: [row("a1", "kalo")] }, at);
  s = publishEpisode(s, 1, "t").season;
  s = saveDraft(s, { episode: 2, rows: [row("a1", "kalo")] }, at); // still on kalo, no new swap
  s = publishEpisode(s, 2, "t").season;
  assert.equal(rowsFromPublished(s, 1).find((r) => r.castaway === "a1")!.tribe, "kalo");
  assert.equal(rowsFromPublished(s, 2).find((r) => r.castaway === "a1")!.tribe, "kalo");
  assert.equal(s.tribeSwaps.length, 1, "the second episode's matching selection recorded nothing new");
});

test("editing a published episode's tribe checkbox adds, moves or removes a swap, touching only that cell", () => {
  let s = activateSeason(season(), "t").season;
  s = saveDraft(s, { episode: 1, rows: [row("a1", "cila")] }, at);
  s = publishEpisode(s, 1, "t").season;

  // Add a swap after the fact.
  let rows = rowsFromPublished(s, 1);
  let edited = rows.map((r) => (r.castaway === "a1" ? { ...r, tribe: "kalo" } : r));
  let { season: fixed, changes } = correctEpisode(s, { episode: 1, rows: edited, touched: [cellKey("a1", "tribe")], reason: "Forgot the swap" }, "t", at);
  assert.equal(changes, 1);
  assert.equal(currentTribeId(fixed, "a1", 1), "kalo");

  // Re-editing to revert it removes the record entirely rather than leaving a same-tribe swap on file.
  rows = rowsFromPublished(fixed, 1);
  edited = rows.map((r) => (r.castaway === "a1" ? { ...r, tribe: "cila" } : r));
  ({ season: fixed, changes } = correctEpisode(fixed, { episode: 1, rows: edited, touched: [cellKey("a1", "tribe")], reason: "Undo" }, "t", at));
  assert.equal(changes, 1);
  assert.equal(fixed.tribeSwaps.length, 0);

  // Editing back to the same value already on file is a no-op that produces no change.
  assert.throws(
    () => correctEpisode(fixed, { episode: 1, rows: rowsFromPublished(fixed, 1), touched: [cellKey("a1", "tribe")], reason: "x" }, "t", at),
    /Nothing was changed/,
  );
});

test("swap events for other castaways and other episodes are never touched by an unrelated tribe edit", () => {
  let s = activateSeason(season(), "t").season;
  s = saveDraft(s, { episode: 1, rows: [row("a1", "kalo"), row("b1", "cila")] }, at);
  s = publishEpisode(s, 1, "t").season;
  assert.equal(s.tribeSwaps.length, 2);

  const rows = rowsFromPublished(s, 1);
  const edited = rows.map((r) => (r.castaway === "a2" ? { ...r, tribe: "kalo" } : r)); // a2 was never swapped
  const { season: fixed } = correctEpisode(s, { episode: 1, rows: edited, touched: [cellKey("a2", "tribe")], reason: "a2 also swapped" }, "t", at);
  assert.equal(fixed.tribeSwaps.length, 3);
  assert.ok(fixed.tribeSwaps.some((e) => e.castaway === "a1" && e.tribeId === "kalo"), "a1's swap is untouched");
  assert.ok(fixed.tribeSwaps.some((e) => e.castaway === "b1" && e.tribeId === "cila"), "b1's swap is untouched");
});

test("an unknown tribe id is rejected both at publish and when editing", () => {
  let s = activateSeason(season(), "t").season;
  s = saveDraft(s, { episode: 1, rows: [row("a1", "nope")] }, at);
  assert.throws(() => publishEpisode(s, 1, "t"), /Unknown tribe/);
  s = saveDraft(s, { episode: 1, rows: [row("a1", "cila")] }, at);
  s = publishEpisode(s, 1, "t").season;
  const rows = rowsFromPublished(s, 1).map((r) => (r.castaway === "a1" ? { ...r, tribe: "nope" } : r));
  assert.throws(() => correctEpisode(s, { episode: 1, rows, touched: [cellKey("a1", "tribe")], reason: "x" }, "t", at), /choose a tribe/);
});
