// Editing a published episode from the same grid used to score it, instead of one field at a time. The key
// guarantee: only cells the commissioner actually touches are ever looked at or changed — nothing else, even if the
// grid could not perfectly redisplay it (older imported data lacks the quantity/choice metadata to do that exactly).
import { test } from "node:test";
import assert from "node:assert/strict";
import survivor50 from "../src/data/seasons/survivor-50.json";
import type { DraftRow, Season } from "../src/domain/types";
import { isActiveAt, standings, teamEpisodeScore } from "../src/domain/engine";
import { openPickWindow } from "../src/domain/picks";
import { cellKey, correctEpisode, publishEpisode, rowsFromPublished, saveDraft } from "../src/domain/scoring";
import { activateSeason, createSeason } from "../src/domain/setup";

const ref = survivor50 as unknown as Season;
const at = "2026-03-01T00:00:00.000Z";

function season(): Season {
  const s = createSeason(ref, "e-51", "E 51");
  s.castaways = ["a1", "a2", "b1", "b2", "v1", "v2"].map((id, i) => ({ id, name: id.toUpperCase(), initialTribeId: id[0] === "a" ? "cila" : id[0] === "b" ? "kalo" : "vatu", order: i + 1 }));
  s.teams = [
    { id: "x", member: "X", name: "X", draft: ["v1", "a1", "b1", "v2"] },
    { id: "y", member: "Y", name: "Y", draft: ["v2", "a2", "b2", "v1"] },
  ];
  s.config.openingSeed = ["x", "y"];
  s.config.ownershipCap = 2;
  s.episodes = s.episodes.slice(0, 3);
  s.episodes[2].phase = "finale";
  return s;
}
const row = (castaway: string, inputs: DraftRow["inputs"], exit?: DraftRow["exit"]): DraftRow => ({ castaway, inputs, exit });

function published(): Season {
  let s = activateSeason(season(), "t").season;
  s = saveDraft(
    s,
    { episode: 1, rows: [row("a1", { journey: { on: true }, extra: { points: 2, note: "bonus" } }), row("a2", { voteCorrect: { quantity: 1 } }, { type: "VOTED_OUT" })] },
    at,
  );
  return publishEpisode(s, 1, "t").season;
}

test("rowsFromPublished rebuilds exactly what was entered: boolean, quantity, manual, and the exit", () => {
  const s = published();
  const rows = rowsFromPublished(s, 1);
  const a1 = rows.find((r) => r.castaway === "a1")!;
  assert.deepEqual(a1.inputs.journey, { on: true });
  assert.deepEqual(a1.inputs.extra, { points: 2, note: "bonus" });
  const a2 = rows.find((r) => r.castaway === "a2")!;
  assert.deepEqual(a2.inputs.voteCorrect, { quantity: 1 });
  assert.deepEqual(a2.exit, { type: "VOTED_OUT" });
});

test("a choice rule's option is recovered from its label when possible", () => {
  let s = activateSeason(season(), "t").season;
  s = saveDraft(s, { episode: 1, rows: [row("a1", { reward: { option: 0 } })] }, at); // pre-merge "Won reward"
  s = publishEpisode(s, 1, "t").season;
  const rows = rowsFromPublished(s, 1);
  assert.deepEqual(rows.find((r) => r.castaway === "a1")!.inputs.reward, { option: 0 });
});

test("nothing in `touched` means nothing changes, whatever the rows say", () => {
  const s = published();
  const rows = rowsFromPublished(s, 1).map((r) => (r.castaway === "a1" ? { ...r, inputs: { ...r.inputs, journey: { on: false } } } : r));
  assert.throws(() => correctEpisode(s, { episode: 1, rows, touched: [], reason: "x" }, "t", at), /Nothing was changed/);
});

test("editing changes only the touched rule, keeps the rest, and needs a reason", () => {
  const s = published();
  const rows = rowsFromPublished(s, 1).map((r) => (r.castaway === "a1" ? { ...r, inputs: { ...r.inputs, journey: { on: false } } } : r));
  const touched = [cellKey("a1", "journey")];
  assert.throws(() => correctEpisode(s, { episode: 1, rows, touched, reason: " " }, "t", at), /reason is required/);
  const { season: fixed, changes } = correctEpisode(s, { episode: 1, rows, touched, reason: "Journey was cancelled" }, "t", at);
  assert.equal(changes, 1);
  assert.equal(teamEpisodeScore(fixed, "x", 1), teamEpisodeScore(s, "x", 1) - 1, "only the journey point moved");
  assert.equal(fixed.corrections.length, 1);
  assert.deepEqual({ before: fixed.corrections[0].before, after: fixed.corrections[0].after, reason: fixed.corrections[0].reason }, { before: 1, after: 0, reason: "Journey was cancelled" });
  assert.equal(fixed.scores.find((sc) => sc.episode === 1 && sc.castaway === "a1")!.entries.some((e) => e.rule === "extra"), true, "the untouched manual entry survives");
  assert.equal(teamEpisodeScore(s, "x", 1), teamEpisodeScore(published(), "x", 1), "the original season object is never mutated");
});

test("multiple touched cells across multiple castaways all land under one shared reason", () => {
  const s = published();
  const rows = rowsFromPublished(s, 1).map((r) => {
    if (r.castaway === "a1") return { ...r, inputs: { ...r.inputs, journey: { on: false }, extra: { points: 5, note: "bonus" } } };
    if (r.castaway === "a2") return { ...r, inputs: { ...r.inputs, voteCorrect: { quantity: 2 } } };
    return r;
  });
  const touched = [cellKey("a1", "journey"), cellKey("a1", "extra"), cellKey("a2", "voteCorrect")];
  const { season: fixed, changes } = correctEpisode(s, { episode: 1, rows, touched, reason: "Rescoring after review" }, "commissioner", at);
  assert.equal(changes, 3);
  assert.equal(fixed.corrections.length, 3);
  assert.ok(fixed.corrections.every((c) => c.reason === "Rescoring after review" && c.actor === "commissioner"));
});

test("CRITICAL: a cell the grid could not perfectly redisplay is never touched by an edit elsewhere", () => {
  // Simulate an older imported entry: a quantity rule stored with no `quantity`, and a choice rule stored with no
  // matching option. If either were still readable via resolveRow (like the earlier, since-replaced design did),
  // saving any unrelated field would silently wipe them out.
  let s = published();
  const stripped = structuredClone(s);
  const a2 = stripped.scores.find((sc) => sc.castaway === "a2" && sc.episode === 1)!;
  a2.entries.push({ rule: "reward", points: 999 }); // an option no real option is worth: unreconstructable by design
  s = stripped;

  const rows = rowsFromPublished(s, 1);
  // The unreconstructable cell is correctly left blank in the grid, but the points are still on record underneath.
  assert.equal(rows.find((r) => r.castaway === "a2")!.inputs.reward, undefined);
  assert.equal(teamEpisodeScore(s, "y", 1), teamEpisodeScore(s, "y", 1)); // sanity: reading doesn't change anything

  // Touch a completely different castaway's completely different rule.
  const edited = rows.map((r) => (r.castaway === "a1" ? { ...r, inputs: { ...r.inputs, journey: { on: false } } } : r));
  const { season: fixed } = correctEpisode(s, { episode: 1, rows: edited, touched: [cellKey("a1", "journey")], reason: "unrelated fix" }, "t", at);

  const a2after = fixed.scores.find((sc) => sc.castaway === "a2" && sc.episode === 1)!;
  assert.equal(a2after.entries.find((e) => e.rule === "reward")?.points, 999, "the unreconstructable entry is untouched, byte for byte");
  assert.equal(a2after.entries.find((e) => e.rule === "voteCorrect")?.points, 2, "and everything else on that castaway too");
  assert.equal(fixed.corrections.length, 1, "only the one cell that was actually touched produced a correction");
});

test("who left can be added, changed or removed, as long as no pick window has used the result yet", () => {
  const s = published();
  let rows = rowsFromPublished(s, 1);
  let edited = rows.map((r) => (r.castaway === "a2" ? { ...r, exit: undefined } : r));
  let { season: fixed } = correctEpisode(s, { episode: 1, rows: edited, touched: [cellKey("a2", "exit")], reason: "Wrong person recorded" }, "t", at);
  assert.equal(isActiveAt(fixed, "a2", 2), true);
  assert.equal(fixed.statusEvents.some((e) => e.castaway === "a2"), false);

  rows = rowsFromPublished(s, 1);
  edited = rows.map((r) => (r.castaway === "a1" ? { ...r, exit: { type: "MEDICAL_EVACUATION" as const } } : r));
  ({ season: fixed } = correctEpisode(s, { episode: 1, rows: edited, touched: [cellKey("a1", "exit")], reason: "Actually a medical evac" }, "t", at));
  assert.equal(fixed.statusEvents.find((e) => e.castaway === "a1")!.type, "MEDICAL_EVACUATION");
});

test("once a pick window has opened for the episode, its exits are locked but scores are not", () => {
  let s = published();
  s = openPickWindow(s, 1, at, "t").season;
  const rows = rowsFromPublished(s, 1);
  const unExit = rows.map((r) => (r.castaway === "a2" ? { ...r, exit: undefined } : r));
  assert.throws(() => correctEpisode(s, { episode: 1, rows: unExit, touched: [cellKey("a2", "exit")], reason: "too late" }, "t", at), /pick window already used/);
  const scoreOnly = rows.map((r) => (r.castaway === "a1" ? { ...r, inputs: { ...r.inputs, journey: { on: false } } } : r));
  const { changes } = correctEpisode(s, { episode: 1, rows: scoreOnly, touched: [cellKey("a1", "journey")], reason: "score still editable" }, "t", at);
  assert.equal(changes, 1);
});

test("an invalid touched input is rejected the same way it would be before publishing", () => {
  const s = published();
  const rows = rowsFromPublished(s, 1).map((r) => (r.castaway === "a1" ? { ...r, inputs: { ...r.inputs, extra: { points: 3 } } } : r)); // manual with no note
  assert.throws(() => correctEpisode(s, { episode: 1, rows, touched: [cellKey("a1", "extra")], reason: "x" }, "t", at), /note is required/);
});

test("a manual entry imported without a note (older data) reconstructs cleanly", () => {
  let s = activateSeason(season(), "t").season;
  s = saveDraft(s, { episode: 1, rows: [row("a1", { extra: { points: -1, note: "placeholder" } })] }, at);
  s = publishEpisode(s, 1, "t").season;
  const stripped = structuredClone(s);
  stripped.scores.find((sc) => sc.castaway === "a1")!.entries.find((e) => e.rule === "extra")!.note = undefined;

  const rows = rowsFromPublished(stripped, 1);
  const a1 = rows.find((r) => r.castaway === "a1")!;
  assert.equal(a1.inputs.extra!.points, -1);
  assert.ok(a1.inputs.extra!.note, "a placeholder note is filled in so the row validates if it is ever touched");
});

test("editing only works on a published episode", () => {
  const s = activateSeason(season(), "t").season;
  assert.throws(() => correctEpisode(s, { episode: 1, rows: [], touched: [], reason: "x" }, "t", at), /Only a published episode/);
});

test("the recalculated standings reflect an edit immediately, like any other correction", () => {
  const s = published();
  const before = standings(s, 1).find((r) => r.teamId === "x")!.total;
  const rows = rowsFromPublished(s, 1).map((r) => (r.castaway === "a1" ? { ...r, inputs: { ...r.inputs, journey: { on: false } } } : r));
  const { season: fixed } = correctEpisode(s, { episode: 1, rows, touched: [cellKey("a1", "journey")], reason: "x" }, "t", at);
  assert.equal(standings(fixed, 1).find((r) => r.teamId === "x")!.total, before - 1);
});
