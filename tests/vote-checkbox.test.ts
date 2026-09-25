// "Vote correctly" is scored as a checkbox. A season still being played converts once (its saved progress with it);
// a published rule never changes type, and a commissioner can still switch a count and a checkbox in Setup.
import { test } from "node:test";
import assert from "node:assert/strict";
import survivor50 from "../src/data/seasons/survivor-50.json";
import { migrateSeason } from "../src/domain/migrate";
import { resolveRow, saveDraft } from "../src/domain/scoring";
import { createSeason } from "../src/domain/setup";
import { updateRule } from "../src/domain/template";
import type { Season } from "../src/domain/types";

const ref = survivor50 as unknown as Season;
const at = "2026-09-25T02:00:00.000Z";
const vote = (s: Season) => s.rules.find((r) => r.key === "voteCorrect")!;

function newSeasonWithProgress(): Season {
  const s = createSeason(ref, "survivor-51", "Survivor 51");
  s.castaways = ref.castaways.slice(0, 3).map((c) => ({ ...c }));
  const [a, b] = s.castaways;
  return saveDraft(s, { episode: 1, rows: [{ castaway: a.id, inputs: { voteCorrect: { quantity: 1, note: "voted Aaliyah" } } }, { castaway: b.id, inputs: { voteCorrect: { quantity: 2 } } }] }, at);
}

test("a season being played converts Vote correctly to a checkbox once, saved progress included", () => {
  const s = migrateSeason(newSeasonWithProgress());
  assert.equal(vote(s).inputType, "boolean");
  assert.deepEqual(vote(s).points, vote(ref).points, "same points");
  const rows = s.drafts[0].rows;
  assert.deepEqual(rows[0].inputs.voteCorrect, { on: true, note: "voted Aaliyah" });
  assert.equal(rows[1].inputs.voteCorrect.on, true);
  assert.match(rows[1].inputs.voteCorrect.note!, /was ×2/);
  assert.equal(resolveRow(s, "pre-merge", rows[0]).entries[0].points, 2);
  assert.ok(s.migrations?.includes("vote-correct-checkbox"));

  // A commissioner who switches it back keeps that choice.
  const back = updateRule(s, "voteCorrect", { ...vote(s), inputType: "quantity" }, "admin").season;
  assert.equal(vote(back).inputType, "quantity");
  assert.deepEqual(back.drafts[0].rows[0].inputs.voteCorrect, { quantity: 1, note: "voted Aaliyah" });
  assert.equal(vote(migrateSeason(structuredClone(back))).inputType, "quantity");
});

test("archived seasons and published scoring are left alone", () => {
  assert.equal(vote(migrateSeason(structuredClone(ref))).inputType, "quantity", "an archived season keeps its history as it was");
  const live = structuredClone(ref);
  live.status = "ACTIVE";
  const migrated = migrateSeason(live);
  assert.equal(vote(migrated).inputType, "quantity", "already published as a count");
  assert.throws(() => updateRule(migrated, "voteCorrect", { ...vote(migrated), inputType: "boolean" }, "admin"), /already been scored/);
});
