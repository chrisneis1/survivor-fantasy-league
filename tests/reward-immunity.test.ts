// A challenge for reward and immunity together pays 3 to everyone on the winning tribe, and a tiered one 3 / 2 / 0.
// Seasons still being played pick the rule up once; archived seasons are left exactly as they were.
import { test } from "node:test";
import assert from "node:assert/strict";
import survivor50 from "../src/data/seasons/survivor-50.json";
import { migrateSeason } from "../src/domain/migrate";
import { removeRule } from "../src/domain/template";
import { resolveRow, rulesForPhase } from "../src/domain/scoring";
import { createSeason } from "../src/domain/setup";
import type { Season } from "../src/domain/types";

const ref = survivor50 as unknown as Season;
const keys = (s: Season) => s.rules.map((r) => r.key);

test("a season being played gets Reward + immunity right after Team immunity, worth 3 / 2 pre-merge only", () => {
  const s = migrateSeason(createSeason(ref, "survivor-51", "Survivor 51"));
  const k = keys(s);
  assert.equal(k.indexOf("rewardImmunity"), k.indexOf("teamImmunity") + 1);
  assert.ok(s.migrations?.includes("reward-immunity-rule"));
  const row = (option: number) => resolveRow(s, "pre-merge", { castaway: "x", inputs: { rewardImmunity: { option } } });
  assert.equal(row(0).total, 3, "won, or 1st in a tiered challenge");
  assert.equal(row(1).total, 2, "2nd in a tiered challenge");
  assert.ok(!rulesForPhase(s, "post-merge").some((r) => r.key === "rewardImmunity"), "post-merge challenges are individual");
  assert.equal(keys(migrateSeason(structuredClone(s))).filter((x) => x === "rewardImmunity").length, 1, "added once");
});

test("a commissioner who removes it keeps it removed; archived seasons are untouched", () => {
  const s = migrateSeason(createSeason(ref, "survivor-51", "Survivor 51"));
  const removed = removeRule(s, "rewardImmunity", "admin").season;
  assert.ok(!keys(migrateSeason(structuredClone(removed))).includes("rewardImmunity"));
  const archived = migrateSeason(structuredClone(ref));
  assert.deepEqual(keys(archived), keys(ref));
});
