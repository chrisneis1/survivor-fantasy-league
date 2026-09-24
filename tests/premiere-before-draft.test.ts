// An episode excluded from standings: scored and published before any team has a roster (a premiere aired before
// the draft), and permanently worth zero to every team even after the draft fills every roster.
import { test } from "node:test";
import assert from "node:assert/strict";
import survivor50 from "../src/data/seasons/survivor-50.json";
import type { Season } from "../src/domain/types";
import { standings, teamEpisodeScore } from "../src/domain/engine";
import { makeOpeningPick, openOpeningSelection, openingBlock, openingTurn } from "../src/domain/picks";
import { publishEpisode, saveDraft, validatePublish } from "../src/domain/scoring";
import { createSeason } from "../src/domain/setup";

const ref = survivor50 as unknown as Season;
const at = "2026-01-15T20:00:00.000Z";

function season(): Season {
  const s = createSeason(ref, "premiere-51", "Premiere 51");
  s.castaways = ["a1", "a2", "b1", "b2"].map((id, i) => ({ id, name: id.toUpperCase(), initialTribeId: id[0] === "a" ? "cila" : "kalo", order: i + 1 }));
  s.teams = ["x", "y"].map((id) => ({ id, member: id.toUpperCase(), name: `Team ${id}`, draft: ["", ""] }));
  s.slots = [
    { id: "slot1", name: "S1", restrictionTribeId: null, enforceOnSwap: false },
    { id: "slot2", name: "S2", restrictionTribeId: null, enforceOnSwap: false },
  ];
  s.config.openingSeed = ["x", "y"];
  s.config.ownershipCap = 1;
  s.episodes = s.episodes.slice(0, 3);
  s.episodes[0].excludeFromStandings = true;
  return s;
}

test("an excluded episode publishes with no team having any roster yet, while the season is still in setup", () => {
  const s = season();
  assert.equal(s.status, "SETUP");
  let scored = saveDraft(s, { episode: 1, rows: [{ castaway: "a1", inputs: { extra: { points: 5, note: "test" } } }] }, at);
  assert.equal(validatePublish(scored, 1).length, 0, "no roster-completeness or active-season blockers, once scoring is saved");
  scored = publishEpisode(scored, 1, "t").season;
  assert.equal(scored.status, "SETUP", "publishing an excluded episode does not activate the season");
  assert.equal(teamEpisodeScore(scored, "x", 1), 0);
  assert.equal(teamEpisodeScore(scored, "y", 1), 0);
  assert.equal(standings(scored, 1)[0].total, 0);
});

test("someone voted out in the premiere can't be drafted afterward", () => {
  let s = season();
  // With A1 gone, 3 castaways at a cap of 1 couldn't fill 2 teams × 2 slots, and the draft won't open on a
  // season that can't finish drafting; a cap of 2 leaves enough to go around.
  s.config.ownershipCap = 2;
  s = saveDraft(s, { episode: 1, rows: [{ castaway: "a1", inputs: {}, exit: { type: "VOTED_OUT" } }] }, at);
  s = publishEpisode(s, 1, "t").season;
  s = openOpeningSelection(s, "t").season;
  assert.equal(openingBlock(s, "x", 0, "a1"), "Eliminated");
  assert.equal(openingBlock(s, "x", 0, "a2"), null, "everyone still in the game is pickable");
  assert.throws(() => makeOpeningPick(s, "x", 0, "a1", "m", at), /Eliminated/);
});

test("a normal (non-excluded) episode still refuses to publish before the season is active", () => {
  const s = season();
  delete s.episodes[0].excludeFromStandings;
  const scored = saveDraft(s, { episode: 1, rows: [{ castaway: "a1", inputs: {} }] }, at);
  assert.throws(() => publishEpisode(scored, 1, "t"), /season is not active/);
});

test("the excluded episode stays worth zero permanently, even once the draft fills every roster afterward", () => {
  let s = season();
  s = saveDraft(s, { episode: 1, rows: [{ castaway: "a1", inputs: { extra: { points: 5, note: "test" } } }] }, at);
  s = publishEpisode(s, 1, "t").season;

  // Open the draft after the premiere, same as the real workflow, and complete it.
  s = openOpeningSelection(s, "t").season;
  let guard = 0;
  while (s.status === "OPENING_SELECTION" && guard++ < 20) {
    const turn = openingTurn(s)!;
    const team = s.teams.find((t) => t.id === turn.teamId)!;
    const slot = team.draft.findIndex((d) => !d);
    const pick = s.castaways.find((c) => !s.teams.some((t) => t.draft.includes(c.id)))!;
    s = makeOpeningPick(s, turn.teamId, slot, pick.id, "m", at).season;
  }
  assert.equal(s.status, "ACTIVE");
  assert.ok(s.teams.every((t) => t.draft.every(Boolean)), "every roster is now full");

  // Episode 1 is still zero for everyone, exactly as before the draft — not just while rosters happened to be empty.
  assert.equal(teamEpisodeScore(s, "x", 1), 0);
  assert.equal(teamEpisodeScore(s, "y", 1), 0);

  // Episode 2 (not excluded) scores normally off the now-complete rosters.
  const ownerOfA1 = s.teams.find((t) => t.draft.includes("a1"))!.id;
  let s2 = saveDraft(s, { episode: 2, rows: [{ castaway: "a1", inputs: { extra: { points: 4, note: "test" } } }] }, at);
  s2 = publishEpisode(s2, 2, "t").season;
  assert.equal(teamEpisodeScore(s2, ownerOfA1, 2), 4);
  assert.equal(standings(s2, 2).find((r) => r.teamId === ownerOfA1)!.total, 4, "still zero from episode 1, 4 from episode 2");
});
