// Setup traps that used to produce a broken opening draft: slots that don't match the tribes, drafts that could
// never finish, and no way back to setup once a draft had started.
import { test } from "node:test";
import assert from "node:assert/strict";
import survivor50 from "../src/data/seasons/survivor-50.json";
import type { Season } from "../src/domain/types";
import { draftResetBlock, makeOpeningPick, openOpeningSelection, openingBlock, openingTurn, openingTurnStuck, resetOpeningSelection } from "../src/domain/picks";
import { publishEpisode, saveDraft } from "../src/domain/scoring";
import { createSeason, draftCanFinish, validateSetup } from "../src/domain/setup";
import { applyRosterLayout } from "../src/domain/template";

const ref = survivor50 as unknown as Season;
const at = "2026-02-01T00:00:00.000Z";
const errors = (s: Season) => validateSetup(s, { rosters: false, episodes: false, scoring: false }).filter((i) => i.level === "error").map((i) => i.message);
const warnings = (s: Season) => validateSetup(s, { rosters: false, episodes: false, scoring: false }).filter((i) => i.level === "warning").map((i) => i.message);

/** Two tribes of `perTribe` castaways, `teams` teams, slots from the quick layout. */
function league(o: { perTribe?: number; teams?: number; cap?: number; slotsPerTribe?: number; wild?: number } = {}): Season {
  let s = createSeason(null, "d", "Draft test");
  s.tribes = [
    { id: "a", name: "Ahu", color: "#aa3300" },
    { id: "b", name: "Bau", color: "#0033aa" },
  ];
  s.castaways = ["a", "b"].flatMap((t) => Array.from({ length: o.perTribe ?? 4 }, (_, i) => ({ id: `${t}${i}`, name: `${t.toUpperCase()}${i}`, initialTribeId: t, order: 0 })));
  s.teams = Array.from({ length: o.teams ?? 3 }, (_, i) => ({ id: `t${i}`, member: `T${i}`, name: `Team ${i}`, draft: [] }));
  s.config.openingSeed = s.teams.map((t) => t.id);
  s.config.ownershipCap = o.cap ?? 3;
  s = applyRosterLayout(s, { perTribe: o.slotsPerTribe ?? 1, wild: o.wild ?? 1 }, "t").season;
  return s;
}

function draftToEnd(s: Season): Season {
  let guard = 0;
  while (s.status === "OPENING_SELECTION" && guard++ < 500) {
    const turn = openingTurn(s)!;
    const team = s.teams.find((t) => t.id === turn.teamId)!;
    const choice = s.slots.flatMap((_, slot) => (team.draft[slot] ? [] : s.castaways.filter((c) => openingBlock(s, team.id, slot, c.id) === null).map((c) => [slot, c.id] as const)))[0];
    assert.ok(choice, `team ${team.id} had no legal pick at turn ${turn.index + 1}`);
    s = makeOpeningPick(s, team.id, choice[0], choice[1], "t", at).season;
  }
  return s;
}

test("slots built while only one tribe exists give fewer picks than intended, and the draft says how many before it opens", () => {
  let s = league();
  s.tribes = [{ id: "tbd", name: "Tribe TBD", color: "#888888" }];
  s.castaways = s.castaways.map((c) => ({ ...c, initialTribeId: "tbd" }));
  s = applyRosterLayout(s, { perTribe: 2, wild: 0 }, "t").season;
  assert.equal(s.slots.length, 2, "2 per tribe × 1 tribe is 2 slots, which is what caught the league out");
  // Real tribes arrive, castaways move to them: the placeholder's slots can no longer be filled, so launch is refused.
  s.tribes.push({ id: "a", name: "Ahu", color: "#aa3300" }, { id: "b", name: "Bau", color: "#0033aa" });
  s.castaways = s.castaways.map((c, i) => ({ ...c, initialTribeId: i % 2 ? "b" : "a" }));
  assert.ok(errors(s).some((m) => /no castaway starts on Tribe TBD/.test(m)), errors(s).join("\n"));
  assert.throws(() => openOpeningSelection(s, "t"), /Fix/);
  // Rebuilding once the cast is on the real tribes gives the 4 slots the league wanted (the now-empty placeholder
  // gets none), the placeholder can then be removed, and the draft opens.
  s = applyRosterLayout(s, { perTribe: 2, wild: 0 }, "t").season;
  assert.deepEqual(s.slots.map((x) => x.name), ["Ahu 1", "Ahu 2", "Bau 1", "Bau 2"]);
  assert.deepEqual(errors(s), []);
  assert.equal(openOpeningSelection(s, "t").season.status, "OPENING_SELECTION");
});

test("a new season copied from Survivor 50 can't launch with slots tied to last season's tribes", () => {
  const s = createSeason(ref, "s51", "Survivor 51");
  s.tribes.push({ id: "new", name: "Newtribe", color: "#123456" });
  s.castaways = Array.from({ length: 12 }, (_, i) => ({ id: `n${i}`, name: `N${i}`, initialTribeId: "new", order: i }));
  s.teams = Array.from({ length: 3 }, (_, i) => ({ id: `t${i}`, member: `T${i}`, name: `T${i}`, draft: s.slots.map(() => "") }));
  s.config.openingSeed = s.teams.map((t) => t.id);
  const e = errors(s);
  for (const tribe of ["Cila", "Kalo", "Vatu"]) assert.ok(e.some((m) => m.includes(`no castaway starts on ${tribe}`)), e.join("\n"));
  assert.throws(() => openOpeningSelection(s, "t"), /Fix/);
});

test("launch is refused when there aren't enough castaways to go around", () => {
  // 3 teams × 2 slots = 6 picks, but 2 castaways × cap 2 = 4.
  const tooFew = league({ perTribe: 1, teams: 3, cap: 2, slotsPerTribe: 1, wild: 0 });
  assert.ok(errors(tooFew).some((m) => /Not enough (Ahu |Bau )?castaways to go around/.test(m)), errors(tooFew).join("\n"));
  // More tribe slots than the tribe has castaways (a team can't take the same castaway twice).
  const twoSlotsOneCastaway = league({ perTribe: 1, teams: 2, cap: 5, slotsPerTribe: 2, wild: 0 });
  assert.ok(errors(twoSlotsOneCastaway).some((m) => /Each team has 2 Ahu slots, but only 1 Ahu castaway/.test(m)), errors(twoSlotsOneCastaway).join("\n"));
  // Castaways voted out in a premiere scored before the draft don't count toward the supply.
  let premiere = league({ perTribe: 2, teams: 2, cap: 1, slotsPerTribe: 1, wild: 0 });
  premiere.episodes = [{ id: "e1", number: 1, title: "Premiere", phase: "pre-merge", state: "SCHEDULED", rosterPolicy: "EFFECTIVE", excludeFromStandings: true }];
  premiere.rules = ref.rules;
  assert.deepEqual(errors(premiere), []);
  premiere = saveDraft(premiere, { episode: 1, rows: [{ castaway: "a0", inputs: {}, exit: { type: "VOTED_OUT" } }] }, at);
  premiere = publishEpisode(premiere, 1, "t").season;
  assert.ok(errors(premiere).some((m) => /Ahu castaways to go around/.test(m)), errors(premiere).join("\n"));
});

test("a lopsided slot layout is flagged but doesn't block", () => {
  const s = league();
  s.slots = s.slots.filter((sl) => sl.restrictionTribeId !== "b");
  for (const t of s.teams) t.draft = s.slots.map(() => "");
  assert.deepEqual(errors(s), []);
  assert.ok(warnings(s).some((m) => /Bau has castaways but no roster slot of its own/.test(m)), warnings(s).join("\n"));
});

test("a wild pick that would leave another team's tribe slot impossible to fill is blocked", () => {
  // Tight on purpose: 2 teams × 3 slots (Ahu, Bau, Wild) = 6 picks from 6 castaways at a cap of 1.
  const s = league({ perTribe: 4, teams: 2, cap: 1, slotsPerTribe: 1, wild: 1 });
  s.castaways = s.castaways.filter((c) => c.id !== "a2" && c.id !== "a3");
  assert.deepEqual(errors(s), []);
  const aSlot = s.slots.findIndex((sl) => sl.restrictionTribeId === "a");
  const wild = s.slots.findIndex((sl) => !sl.restrictionTribeId);
  // Team 1 already holds Ahu 1 in its Ahu slot, so team 0's Ahu slot can only ever be Ahu 0 (cap 1).
  s.teams[1].draft[aSlot] = "a1";
  s.status = "OPENING_SELECTION";
  assert.match(openingBlock(s, "t0", wild, "a0") ?? "", /Needed elsewhere/, "Ahu 0 as a wild pick would strand team 0's own Ahu slot");
  assert.equal(openingBlock(s, "t0", wild, "b0"), null, "a Bau castaway is fine as the wild pick");
  assert.equal(openingBlock(s, "t0", aSlot, "a0"), null, "and Ahu 0 is fine in the Ahu slot");
  assert.equal(draftCanFinish(s), true);
  assert.equal(draftCanFinish(s, { t0: s.slots.map((_, i) => (i === wild ? "a0" : "")) }), false);
});

test("drafts that pass the launch checks always finish (randomised)", () => {
  let rs = 7;
  const rnd = () => (rs = (rs * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  const int = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
  let drafted = 0;
  for (let trial = 0; trial < 300 && drafted < 60; trial++) {
    const slotsPerTribe = int(0, 2);
    const s = league({ perTribe: int(2, 5), teams: int(2, 6), cap: int(1, 3), slotsPerTribe, wild: int(slotsPerTribe ? 0 : 1, 2) });
    if (errors(s).length) continue;
    let d = openOpeningSelection(s, "t").season;
    // Random legal picks, not the first one, to shake out orderings that could strand a team.
    let guard = 0;
    while (d.status === "OPENING_SELECTION" && guard++ < 500) {
      const turn = openingTurn(d)!;
      const team = d.teams.find((t) => t.id === turn.teamId)!;
      assert.equal(openingTurnStuck(d), false, `trial ${trial}: ${team.id} is stuck at pick ${turn.index + 1}`);
      const opts = d.slots.flatMap((_, slot) => (team.draft[slot] ? [] : d.castaways.filter((c) => openingBlock(d, team.id, slot, c.id) === null).map((c) => [slot, c.id] as const)));
      const [slot, cid] = opts[int(0, opts.length - 1)];
      d = makeOpeningPick(d, team.id, slot, cid, "t", at).season;
    }
    assert.equal(d.status, "ACTIVE", `trial ${trial} should finish`);
    drafted++;
  }
  assert.ok(drafted >= 30, `only ${drafted} feasible setups were drafted`);
});

test("the draft can be undone back to setup, until something depends on the rosters", () => {
  let s = openOpeningSelection(league(), "t").season;
  const first = openingTurn(s)!;
  s = makeOpeningPick(s, first.teamId, 0, s.castaways.find((c) => openingBlock(s, first.teamId, 0, c.id) === null)!.id, "t", at).season;
  const undone = resetOpeningSelection(s, "t");
  assert.equal(undone.season.status, "SETUP");
  assert.deepEqual(undone.season.opening.picks, []);
  assert.ok(undone.season.teams.every((t) => t.draft.length === undone.season.slots.length && t.draft.every((c) => c === "")));
  assert.equal(undone.audit[0].action, "RESET_OPENING_SELECTION");

  // A finished draft can still be undone before anything that counts happens…
  const done = draftToEnd(openOpeningSelection(league(), "t").season);
  assert.equal(done.status, "ACTIVE");
  assert.equal(draftResetBlock(done), null);
  assert.equal(resetOpeningSelection(done, "t").season.status, "SETUP");
  // …but not once a pick window has run, wagering has opened, or the season was never drafted here.
  assert.match(draftResetBlock({ ...done, transactions: [{ id: "x", team: "t0", slot: 0, out: "a0", in: "a1", windowAfterEpisode: 1, effectiveEpisode: 2 }] }) ?? "", /pick window/);
  assert.match(draftResetBlock({ ...done, wagerState: "OPEN" }) ?? "", /Wagering/);
  assert.match(draftResetBlock({ ...done, opening: { picks: [] } }) ?? "", /wasn't drafted here/);
  assert.match(draftResetBlock(league()) ?? "", /Only a season in its opening draft/);
});
