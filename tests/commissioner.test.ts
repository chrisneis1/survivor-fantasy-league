// Commissioner workflow on a brand-new season copied from the reference season's settings:
// setup validation -> activate -> save progress -> publish -> correct (guide §8, §13, §14).
import { test } from "node:test";
import assert from "node:assert/strict";
import survivor50 from "../src/data/seasons/survivor-50.json";
import type { DraftRow, Season } from "../src/domain/types";
import { isActiveAt, standings, teamEpisodeScore } from "../src/domain/engine";
import { correctScore, publishEpisode, resolveInput, resolveRow, saveDraft, validatePublish } from "../src/domain/scoring";
import { activateSeason, canActivate, createSeason, finalizeSeason, rosterProblem, validateSetup } from "../src/domain/setup";

const ref = survivor50 as unknown as Season;
const at = "2026-03-01T00:00:00.000Z";

/** Two teams, six castaways, three tribes; a 3-episode season. */
function newSeason(): Season {
  const s = createSeason(ref, "test-51", "Test 51");
  s.castaways = [
    { id: "a1", name: "A1", initialTribeId: "cila", order: 1 },
    { id: "a2", name: "A2", initialTribeId: "cila", order: 2 },
    { id: "b1", name: "B1", initialTribeId: "kalo", order: 3 },
    { id: "b2", name: "B2", initialTribeId: "kalo", order: 4 },
    { id: "v1", name: "V1", initialTribeId: "vatu", order: 5 },
    { id: "v2", name: "V2", initialTribeId: "vatu", order: 6 },
  ];
  s.teams = [
    { id: "x", member: "Xena", name: "Team X", draft: ["a2", "a1", "b1", "v1"] },
    { id: "y", member: "Yuri", name: "Team Y", draft: ["b2", "a1", "b1", "v2"] },
  ];
  s.config.ownershipCap = 2;
  s.config.openingSeed = ["x", "y"];
  s.episodes = s.episodes.slice(0, 3);
  s.episodes[2].phase = "finale";
  return s;
}
const active = () => activateSeason(newSeason(), "test").season;
const row = (castaway: string, inputs: DraftRow["inputs"], exit?: DraftRow["exit"]): DraftRow => ({ castaway, inputs, exit });

test("a fresh copy of the settings needs teams, cast and rosters before it can activate", () => {
  const empty = createSeason(ref, "s", "S");
  assert.equal(canActivate(empty), false);
  assert.ok(validateSetup(empty).some((i) => i.section === "teams"));
  assert.equal(empty.rules.length, ref.rules.length, "scoring rules are copied");
  assert.equal(empty.episodes.every((e) => e.state === "SCHEDULED"), true);
  assert.equal(canActivate(newSeason()), true);
});

test("roster rules: slot restriction, duplicates and ownership cap", () => {
  const s = newSeason();
  assert.match(rosterProblem(s, "x", ["a2", "b1", "b2", "v1"])!, /Cila slot needs a Cila/);
  assert.match(rosterProblem(s, "x", ["a2", "a1", "a1", "v1"])!, /more than one slot/);
  s.teams.push({ id: "z", member: "Zed", name: "Team Z", draft: ["a2", "a1", "b1", "v1"] });
  assert.match(rosterProblem(s, "z", ["b2", "a1", "b1", "v2"])!, /already on 2 teams \(cap 2\)/);
});

test("saving progress does not change the official standings; publishing does", () => {
  let s = active();
  const before = JSON.stringify(standings(s, 1));
  s = saveDraft(s, { episode: 1, rows: [row("a1", { teamImmunity: { on: true } })] }, at);
  assert.equal(s.episodes[0].state, "SCORING");
  assert.equal(JSON.stringify(standings(s, 1)), before);
  assert.equal(teamEpisodeScore(s, "x", 1), 0);
  s = publishEpisode(s, 1, "test").season;
  assert.equal(s.episodes[0].state, "PUBLISHED");
  assert.equal(s.drafts.length, 0);
  assert.equal(teamEpisodeScore(s, "x", 1), 2, "team immunity is worth 2 pre-merge");
});

test("a castaway scored once is applied to every owner", () => {
  let s = active();
  s = saveDraft(s, { episode: 1, rows: [row("a1", { teamImmunity: { on: true } })] }, at); // a1 is on both teams
  s = publishEpisode(s, 1, "test").season;
  assert.equal(teamEpisodeScore(s, "x", 1), 2);
  assert.equal(teamEpisodeScore(s, "y", 1), 2);
});

test("quantity, choice and manual inputs resolve; manual needs a note", () => {
  const rule = (k: string) => ref.rules.find((r) => r.key === k)!;
  assert.equal(resolveInput(rule("voteCorrect"), "pre-merge", { quantity: 3 })!.points, 6);
  assert.equal(resolveInput(rule("voteCorrect"), "post-merge", { quantity: 3 })!.points, 12);
  assert.equal(resolveInput(rule("shotInDark"), "pre-merge", { option: 1 })!.points, 6);
  assert.equal(resolveInput(rule("reward"), "post-merge", { option: 0 })!.points, 2);
  assert.throws(() => resolveInput(rule("extra"), "pre-merge", { points: 2 }), /note is required/);
  assert.equal(resolveInput(rule("extra"), "pre-merge", { points: -1, note: "Voted against" })!.points, -1);
  assert.equal(resolveInput(rule("journey"), "pre-merge", { on: false }), null);
  assert.throws(() => resolveInput(rule("winner"), "pre-merge", { on: true }), /does not apply/);
  const s = newSeason();
  const r = resolveRow(s, "pre-merge", row("a1", { voteCorrect: { quantity: 2 }, journey: { on: true } }));
  assert.equal(r.total, 5);
});

test("publish is blocked by invalid input, missing notes, out-of-order episodes and incomplete rosters", () => {
  let s = active();
  assert.match(validatePublish(s, 1).join(" "), /No scoring has been saved/);
  s = saveDraft(s, { episode: 2, rows: [row("a1", { journey: { on: true } })] }, at);
  assert.match(validatePublish(s, 2).join(" "), /Publish episode 1 first/);
  s = saveDraft(s, { episode: 1, rows: [row("a1", { extra: { points: 2 } })] }, at);
  assert.match(validatePublish(s, 1).join(" "), /note is required/);
  s = saveDraft(s, { episode: 1, rows: [row("a1", { winner: { on: true } })] }, at);
  assert.match(validatePublish(s, 1).join(" "), /does not apply/);
  s = saveDraft(s, { episode: 1, rows: [row("a1", { journey: { on: true } })] }, at);
  s.teams[0].draft = ["a2", "a1", "b1", ""];
  assert.match(validatePublish(s, 1).join(" "), /Xena's roster is incomplete/);
  assert.throws(() => publishEpisode(s, 1, "test"));
});

test("an exit recorded at publish makes the castaway unavailable and unscoreable afterwards", () => {
  let s = active();
  s = saveDraft(s, { episode: 1, rows: [row("b2", { voteCorrect: { quantity: 1 } }, { type: "VOTED_OUT" })] }, at);
  s = publishEpisode(s, 1, "test").season;
  assert.equal(isActiveAt(s, "b2", 1), true, "still scores in the episode they left");
  assert.equal(isActiveAt(s, "b2", 2), false);
  s = saveDraft(s, { episode: 2, rows: [row("b2", { journey: { on: true } })] }, at);
  assert.match(validatePublish(s, 2).join(" "), /already left the game/);
});

test("a published episode can only be corrected, with a reason, keeping the before/after", () => {
  let s = active();
  s = saveDraft(s, { episode: 1, rows: [row("a1", { teamImmunity: { on: true } })] }, at);
  s = publishEpisode(s, 1, "test").season;
  assert.throws(() => saveDraft(s, { episode: 1, rows: [] }, at), /published/);
  assert.throws(() => correctScore(s, { episode: 1, castaway: "a1", rule: "teamImmunity", points: 0, reason: " " }, "c", at), /reason is required/);
  assert.throws(() => correctScore(s, { episode: 2, castaway: "a1", rule: "teamImmunity", points: 0, reason: "x" }, "c", at), /published/);
  const { season: fixed, audit } = correctScore(s, { episode: 1, castaway: "a1", rule: "teamImmunity", points: 0, reason: "Wrong tribe won" }, "commissioner", at);
  assert.equal(teamEpisodeScore(fixed, "x", 1), 0);
  assert.equal(teamEpisodeScore(s, "x", 1), 2, "the original object is untouched");
  assert.deepEqual({ before: fixed.corrections[0].before, after: fixed.corrections[0].after, reason: fixed.corrections[0].reason }, { before: 2, after: 0, reason: "Wrong tribe won" });
  assert.equal(audit[0].action, "CORRECT");
  assert.equal(standings(fixed, 1)[0].total, 0);
});

test("finalize needs every episode published, then the season is archived", () => {
  let s = active();
  assert.throws(() => finalizeSeason(s, "t"), /Publish every episode/);
  for (const n of [1, 2, 3]) {
    s = saveDraft(s, { episode: n, rows: [row("a1", { journey: { on: true } })] }, at);
    s = publishEpisode(s, n, "t").season;
  }
  assert.equal(finalizeSeason(s, "t").season.status, "ARCHIVED");
  assert.equal(standings(s)[0].total, 3);
});
