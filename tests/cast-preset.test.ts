// Loading a season's researched tribes and cast (src/data/casts.ts) into a season still in setup.
import { test } from "node:test";
import assert from "node:assert/strict";
import survivor50 from "../src/data/seasons/survivor-50.json";
import { castPresets } from "../src/data/casts";
import { createSeason, draftCanFinish } from "../src/domain/setup";
import { applyCast } from "../src/domain/template";
import type { Season } from "../src/domain/types";

const ref = survivor50 as unknown as Season;
const preset = castPresets["survivor-51"];
const s51 = () => {
  const s = createSeason(ref, "survivor-51", "Survivor 51");
  s.teams = ref.teams.map((t) => ({ id: t.id, member: t.member, name: t.name, draft: s.slots.map(() => "") }));
  s.config.openingSeed = s.teams.map((t) => t.id);
  return s;
};

test("the Survivor 51 cast: 21 castaways on Savu and Toka, Lewis included on Toka", () => {
  assert.deepEqual(preset.tribes.map((t) => t.name), ["Savu", "Toka"]);
  assert.equal(preset.castaways.length, 21);
  assert.equal(preset.castaways.filter((c) => c.tribe === "savu").length, 10);
  assert.equal(preset.castaways.filter((c) => c.tribe === "toka").length, 11);
  assert.equal(preset.castaways.find((c) => c.name === "Lewis")?.tribe, "toka");
});

test("loading replaces last season's tribes and cast and keeps four picks per team", () => {
  const before = s51();
  assert.deepEqual(before.slots.map((sl) => sl.name), ["Wild", "Cila", "Kalo", "Vatu"], "copied from Survivor 50");
  const { season, audit } = applyCast(before, preset, "admin");
  assert.deepEqual(season.tribes.map((t) => t.id), ["savu", "toka"]);
  assert.equal(season.castaways.length, 21);
  assert.equal(season.castaways.find((c) => c.name === "Thien An")?.id, "thien-an");
  assert.deepEqual(season.slots.map((sl) => [sl.name, sl.restrictionTribeId]), [["Savu", "savu"], ["Toka", "toka"], ["Wild 1", null], ["Wild 2", null]]);
  assert.ok(season.teams.every((t) => t.draft.length === 4 && t.draft.every((c) => c === "")));
  assert.equal(audit[0].action, "LOAD_CAST");
  assert.equal(before.tribes.length, 3, "the input season is not changed");
  // 14 teams × 4 picks from 21 castaways at Survivor 50's cap of 7 owners each: the draft can finish.
  assert.ok(draftCanFinish(season));
});

test("it refuses once anything refers to the current cast", () => {
  const drafted = applyCast(s51(), preset, "admin").season;
  drafted.teams[0].draft[0] = "alexis";
  assert.throws(() => applyCast(drafted, preset, "admin"), /rosters are already filled in/);

  const scored = s51();
  scored.scores = [{ episode: 1, castaway: "x", entries: [] }];
  assert.throws(() => applyCast(scored, preset, "admin"), /scoring has already been saved/);

  const live = s51();
  live.status = "ACTIVE";
  assert.throws(() => applyCast(live, preset, "admin"), /only be loaded while the season is in setup/);
});
