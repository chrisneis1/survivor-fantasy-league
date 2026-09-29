// The commissioner's roster override: replace a drafted pick, or make a free swap from the next episode, with a
// reason on the record — normally with the usual checks, or with the override switch for bugs and rulings.
import { test } from "node:test";
import assert from "node:assert/strict";
import survivor50 from "../src/data/seasons/survivor-50.json";
import { castPresets } from "../src/data/casts";
import { effectiveRoster, rosterForEpisode, teamEpisodeScore } from "../src/domain/engine";
import { overrideRoster } from "../src/domain/picks";
import { publishEpisode, saveDraft } from "../src/domain/scoring";
import { createSeason } from "../src/domain/setup";
import { applyCast, applyRosterLayout } from "../src/domain/template";
import type { Season } from "../src/domain/types";

const ref = survivor50 as unknown as Season;
const at = "2026-09-29T18:00:00.000Z";

/** Survivor 51 after its draft: two picks per tribe, Episode 1 published as not counting, Aaliyah out. */
function s51(): Season {
  let s = applyCast(createSeason(ref, "survivor-51", "Survivor 51"), castPresets["survivor-51"], "t").season;
  s = applyRosterLayout(s, { perTribe: 2, wild: 0 }, "t").season;
  s.teams = [
    { id: "kenzie", member: "Kenzie", name: "K", draft: ["ori", "alexis", "mike", "jelly"] },
    { id: "shane", member: "Shane", name: "S", draft: ["rob", "ana", "brady", "maggie"] },
  ];
  s.config.openingSeed = ["kenzie", "shane"];
  s.config.ownershipCap = 1;
  s.episodes[0].excludeFromStandings = true;
  s = saveDraft(s, { episode: 1, rows: [{ castaway: "aaliyah", inputs: {}, exit: { type: "VOTED_OUT" } }, { castaway: "jelly", inputs: { teamImmunity: { on: true } } }] }, at);
  s = publishEpisode(s, 1, "t").season;
  s.status = "ACTIVE";
  return s;
}

const base = { mode: "draft" as const, skipChecks: false, reason: "Kenzie meant to draft Thien An" };

test("replacing a drafted pick: Kenzie's Toka pick goes from Jelly to Thien An, from the start", () => {
  const s = s51();
  const slot = s.teams[0].draft.indexOf("jelly");
  const { season, audit } = overrideRoster(s, { ...base, teamId: "kenzie", slot, castawayId: "thien-an" }, "admin", at);
  assert.deepEqual(season.teams[0].draft, ["ori", "alexis", "mike", "thien-an"]);
  assert.deepEqual(rosterForEpisode(season, "kenzie", 2), ["ori", "alexis", "mike", "thien-an"]);
  assert.equal(teamEpisodeScore(season, "kenzie", 1), 0, "Episode 1 still doesn't count");
  assert.equal(audit[0].action, "OVERRIDE_DRAFT_PICK");
  assert.equal(audit[0].reason, "Kenzie meant to draft Thien An");
  assert.equal(s.teams[0].draft[slot], "jelly", "the input season is unchanged");
});

test("without the override switch the usual checks apply; with it they're skipped", () => {
  const s = s51();
  const toka = 3;
  const savu = 0;
  const check = (castawayId: string, slot: number, skipChecks: boolean) => () => overrideRoster(s, { ...base, teamId: "kenzie", slot, castawayId, skipChecks }, "admin", at);
  assert.throws(check("aaliyah", toka, false), /out of the game before the draft counted/);
  assert.throws(check("brady", toka, false), /already on 1 teams \(cap 1\)/);
  assert.throws(check("kilby", savu, false), /needs a Savu castaway/);
  for (const [id, slot] of [["aaliyah", toka], ["brady", toka], ["kilby", savu]] as const) assert.ok(check(id, slot, true)(), `${id} allowed with the switch`);
  // Never two of the same castaway on one team, even with the switch.
  assert.throws(check("mike", toka, true), /already on this team/);
});

test("a free swap from the next episode keeps earlier episodes as they were", () => {
  let s = s51();
  s.episodes[1].state = "SCHEDULED";
  s = saveDraft(s, { episode: 2, rows: [{ castaway: "jelly", inputs: { teamImmunity: { on: true } } }] }, at);
  s = publishEpisode(s, 2, "t").season;
  const before = teamEpisodeScore(s, "kenzie", 2);
  const { season } = overrideRoster(s, { ...base, mode: "swap", teamId: "kenzie", slot: 3, castawayId: "thien-an", reason: "League ruling" }, "admin", at);
  const tx = season.transactions.at(-1)!;
  assert.deepEqual([tx.out, tx.in, tx.effectiveEpisode, tx.free], ["jelly", "thien-an", 3, true]);
  assert.match(tx.note!, /Commissioner override: League ruling/);
  assert.equal(teamEpisodeScore(season, "kenzie", 2), before, "Episode 2 keeps Jelly");
  assert.equal(effectiveRoster(season, "kenzie", 3)[3], "thien-an");
  // Once a slot has swapped, the drafted pick can't be rewritten underneath it.
  assert.throws(() => overrideRoster(season, { ...base, teamId: "kenzie", slot: 3, castawayId: "kilby" }, "admin", at), /has had swaps since the draft/);
});

test("an override needs a reason and an active season", () => {
  const s = s51();
  assert.throws(() => overrideRoster(s, { ...base, teamId: "kenzie", slot: 3, castawayId: "thien-an", reason: "  " }, "admin", at), /Give a reason/);
  assert.throws(() => overrideRoster({ ...s, status: "ARCHIVED" }, { ...base, teamId: "kenzie", slot: 3, castawayId: "thien-an" }, "admin", at), /once the draft has finished/);
  // Episode 1 is published (even though it doesn't count), so a swap starts from Episode 2.
  assert.equal(overrideRoster(s, { ...base, mode: "swap", teamId: "kenzie", slot: 3, castawayId: "thien-an" }, "admin", at).season.transactions.at(-1)!.effectiveEpisode, 2);
  const fresh = s51();
  fresh.episodes[0].state = "SCHEDULED";
  fresh.scores = [];
  fresh.statusEvents = [];
  assert.throws(() => overrideRoster(fresh, { ...base, mode: "swap", teamId: "kenzie", slot: 3, castawayId: "thien-an" }, "admin", at), /Nothing has been published yet/);
});
