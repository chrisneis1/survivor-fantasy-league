// Editing an existing castaway's name or starting tribe (e.g. once tribes are revealed after the cast was entered
// with a placeholder tribe). Only while the season is in setup, and never into a tribe that breaks a filled roster.
import { test } from "node:test";
import assert from "node:assert/strict";
import survivor50 from "../src/data/seasons/survivor-50.json";
import type { Season } from "../src/domain/types";
import { createSeason, updateCastaway } from "../src/domain/setup";

const ref = survivor50 as unknown as Season;

function season(): Season {
  const s = createSeason(ref, "ce-51", "CE 51");
  s.tribes = [{ id: "tbd", name: "TBD", color: "#888888" }, { id: "cila", name: "Cila", color: "#111111" }];
  s.castaways = [{ id: "c1", name: "C1", initialTribeId: "tbd", order: 1 }];
  s.teams = [
    { id: "x", member: "X", name: "X", draft: [""] },
    { id: "y", member: "Y", name: "Y", draft: [""] },
  ];
  s.slots = [{ id: "slot1", name: "Wild", restrictionTribeId: null, enforceOnSwap: false }];
  return s;
}

test("renames and moves a castaway to their real tribe once it's announced", () => {
  const s = season();
  const { season: next, audit } = updateCastaway(s, "c1", { name: " C1 Real Name ", tribe: "cila" }, "t");
  assert.equal(next.castaways[0].name, "C1 Real Name", "trimmed");
  assert.equal(next.castaways[0].initialTribeId, "cila");
  assert.equal(s.castaways[0].initialTribeId, "tbd", "the original season object is untouched");
  assert.deepEqual({ action: audit[0].action, before: audit[0].before, after: audit[0].after }, { action: "UPDATE", before: { name: "C1", tribe: "tbd" }, after: { name: "C1 Real Name", tribe: "cila" } });
});

test("rejects a blank name, an unknown tribe, no real change, or a season that has left setup", () => {
  const s = season();
  assert.throws(() => updateCastaway(s, "c1", { name: "   ", tribe: "cila" }, "t"), /Give the castaway a name/);
  assert.throws(() => updateCastaway(s, "c1", { name: "C1", tribe: "nope" }, "t"), /Choose a tribe/);
  assert.throws(() => updateCastaway(s, "c1", { name: "C1", tribe: "tbd" }, "t"), /Nothing changed/);
  assert.throws(() => updateCastaway(s, "nope", { name: "X", tribe: "tbd" }, "t"), /Unknown castaway/);
  const active = { ...s, status: "ACTIVE" as const };
  assert.throws(() => updateCastaway(active, "c1", { name: "C1", tribe: "cila" }, "t"), /only be changed while the season is in setup/);
});

test("refuses to move a castaway on a filled roster into a tribe that would make that roster illegal", () => {
  const s = season();
  s.slots = [{ id: "slot1", name: "Cila", restrictionTribeId: "cila", enforceOnSwap: false }];
  s.castaways.push({ id: "c2", name: "C2", initialTribeId: "cila", order: 2 });
  s.teams[0].draft = ["c2"];
  // Moving c2 off Cila would leave team x's Cila-restricted slot holding a non-Cila castaway.
  assert.throws(() => updateCastaway(s, "c2", { name: "C2", tribe: "tbd" }, "t"), /Cila slot needs a Cila castaway/);
});
