// Renaming a team: the commissioner can, and so can the member who owns it, any time short of archived.
import { test } from "node:test";
import assert from "node:assert/strict";
import survivor50 from "../src/data/seasons/survivor-50.json";
import type { Season } from "../src/domain/types";
import { activateSeason, createSeason, renameTeam } from "../src/domain/setup";

const ref = survivor50 as unknown as Season;

function season(): Season {
  const s = createSeason(ref, "rn-51", "RN 51");
  s.teams = [
    { id: "x", member: "X", name: "X's Team", draft: [] },
    { id: "y", member: "Y", name: "Y's Team", draft: [] },
  ];
  return s;
}

test("a team starts with a filler name and can be renamed by anyone acting on its behalf", () => {
  const s = season();
  assert.equal(s.teams[0].name, "X's Team");
  const { season: renamed, audit } = renameTeam(s, "x", "  The Coconuts  ", "member:x");
  assert.equal(renamed.teams[0].name, "The Coconuts", "trimmed");
  assert.equal(s.teams[0].name, "X's Team", "the original season object is untouched");
  assert.deepEqual({ action: audit[0].action, before: audit[0].before, after: audit[0].after, actor: audit[0].actor }, { action: "RENAME", before: "X's Team", after: "The Coconuts", actor: "member:x" });
});

test("renaming is not gated to setup — it works while the draft is live and once the season is active", () => {
  let s = season();
  s.tribes = [{ id: "a", name: "A", color: "#111" }];
  s.slots = [{ id: "slot1", name: "Wild", restrictionTribeId: null, enforceOnSwap: false }];
  s.castaways = [
    { id: "c1", name: "C1", initialTribeId: "a", order: 1 },
    { id: "c2", name: "C2", initialTribeId: "a", order: 2 },
  ];
  s.teams[0].draft = ["c1"];
  s.teams[1].draft = ["c2"];
  s.config.openingSeed = ["x", "y"];
  s = activateSeason(s, "t").season;
  assert.equal(renameTeam(s, "y", "Renamed while active", "t").season.teams[1].name, "Renamed while active");
});

test("rejects a blank name, a too-long name, no real change, an unknown team, or an archived season", () => {
  const s = season();
  assert.throws(() => renameTeam(s, "x", "   ", "t"), /Give the team a name/);
  assert.throws(() => renameTeam(s, "x", "x".repeat(61), "t"), /60 characters/);
  assert.throws(() => renameTeam(s, "x", "X's Team", "t"), /already the team's name/);
  assert.throws(() => renameTeam(s, "nope", "New Name", "t"), /Unknown team/);
  const archived = { ...s, status: "ARCHIVED" as const };
  assert.throws(() => renameTeam(archived, "x", "New Name", "t"), /read-only/);
});
