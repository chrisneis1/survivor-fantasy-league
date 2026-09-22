// Scoring template editing, episode/roster layout, and the two-tribe (two picks each) draft.
import { test } from "node:test";
import assert from "node:assert/strict";
import survivor50 from "../src/data/seasons/survivor-50.json";
import type { Season } from "../src/domain/types";
import { makeOpeningPick, openOpeningSelection, openingTurn } from "../src/domain/picks";
import { publishEpisode, resolveInput, rulesForPhase, saveDraft } from "../src/domain/scoring";
import { activateSeason, createSeason, rosterProblem } from "../src/domain/setup";
import {
  addRule,
  applyEpisodeLayout,
  applyRosterLayout,
  applyTemplate,
  layoutOf,
  optionsToText,
  parseOptions,
  removeRule,
  ruleUsed,
  setRuleRetired,
  setWinnerRule,
  templateFrom,
  updateRule,
  type RuleForm,
} from "../src/domain/template";
import { ownerCount } from "../src/domain/engine";

const ref = survivor50 as unknown as Season;
const at = "2026-03-01T00:00:00.000Z";
const form = (over: Partial<RuleForm> = {}): RuleForm => ({
  name: "Sneaky Alliance Vote",
  category: "Tribal",
  note: "",
  inputType: "boolean",
  points: { "pre-merge": 1, "post-merge": 2, finale: null },
  ...over,
});

// ---------- the reference season reads back as a layout ----------

test("the reference season's episodes read back as a layout: 14 episodes, merge at 6, last two on the original draft", () => {
  assert.deepEqual(layoutOf(ref), { total: 14, mergeAt: 6, draftTail: 2 });
});

// ---------- episode layout ----------

test("one step lays out any number of episodes, the merge, the finale and an original-draft tail", () => {
  const s = createSeason(ref, "l", "L");
  const { season } = applyEpisodeLayout(s, { total: 12, mergeAt: 7, draftTail: 2 }, "t");
  assert.equal(season.episodes.length, 12);
  assert.deepEqual(season.episodes.map((e) => e.phase), [...Array(6).fill("pre-merge"), ...Array(5).fill("post-merge"), "finale"]);
  assert.deepEqual(season.episodes.map((e) => e.rosterPolicy).slice(-3), ["EFFECTIVE", "ORIGINAL_DRAFT", "ORIGINAL_DRAFT"]);
  assert.equal(season.episodes.at(-1)!.title, "Finale");
  assert.equal(season.episodes[0].title, "Episode 1");
  assert.deepEqual(layoutOf(season), { total: 12, mergeAt: 7, draftTail: 2 });
  // Growing works too.
  assert.equal(applyEpisodeLayout(season, { total: 15, mergeAt: 9, draftTail: 0 }, "t").season.episodes.length, 15);
});

test("a layout keeps custom titles and rejects nonsense", () => {
  const s = createSeason(ref, "l", "L");
  s.episodes[2].title = "The One With The Fire";
  const out = applyEpisodeLayout(s, { total: 10, mergeAt: 5, draftTail: 0 }, "t").season;
  assert.equal(out.episodes[2].title, "The One With The Fire");
  assert.throws(() => applyEpisodeLayout(s, { total: 0, mergeAt: 1, draftTail: 0 }, "t"), /1 to 40/);
  assert.throws(() => applyEpisodeLayout(s, { total: 10, mergeAt: 11, draftTail: 0 }, "t"), /between 1 and 10/);
  assert.throws(() => applyEpisodeLayout(s, { total: 10, mergeAt: 5, draftTail: 10 }, "t"), /fewer than the total/);
  assert.throws(() => applyEpisodeLayout(s, { total: 10.5, mergeAt: 5, draftTail: 0 }, "t"), /whole numbers/);
});

test("episodes that are already scored are never changed by a layout", () => {
  // A two-team season with episode 1 published (pre-merge).
  const s = createSeason(ref, "p", "P");
  s.castaways = ["a1", "a2", "b1", "b2", "v1", "v2"].map((id, i) => ({ id, name: id, initialTribeId: id[0] === "a" ? "cila" : id[0] === "b" ? "kalo" : "vatu", order: i + 1 }));
  s.teams = [
    { id: "x", member: "X", name: "X", draft: ["v1", "a1", "b1", "v2"] },
    { id: "y", member: "Y", name: "Y", draft: ["v2", "a2", "b2", "v1"] },
  ];
  s.config.openingSeed = ["x", "y"];
  s.config.ownershipCap = 2;
  let a = activateSeason(s, "t").season;
  a = publishEpisode(saveDraft(a, { episode: 1, rows: [{ castaway: "a1", inputs: { journey: { on: true } } }] }, at), 1, "t").season;
  assert.throws(() => applyEpisodeLayout(a, { total: 8, mergeAt: 1, draftTail: 0 }, "t"), /Episode 1 is already scored as pre-merge/);
  const ok = applyEpisodeLayout(a, { total: 8, mergeAt: 4, draftTail: 0 }, "t").season;
  assert.equal(ok.episodes[0].state, "PUBLISHED");
  assert.equal(ok.episodes.length, 8);
  assert.throws(() => applyEpisodeLayout(a, { total: 0, mergeAt: 1, draftTail: 0 }, "t"));
});

// ---------- rules ----------

test("a new rule appears in the grid only in the phases it has a value for, and resolves points", () => {
  const { season: s, audit } = addRule(createSeason(ref, "r", "R"), form(), "t");
  const rule = s.rules.at(-1)!;
  assert.equal(rule.key, "sneakyAllianceVote");
  assert.equal(audit[0].action, "ADD");
  assert.ok(rulesForPhase(s, "pre-merge").some((r) => r.key === rule.key));
  assert.ok(rulesForPhase(s, "post-merge").some((r) => r.key === rule.key));
  assert.ok(!rulesForPhase(s, "finale").some((r) => r.key === rule.key));
  assert.equal(resolveInput(rule, "post-merge", { on: true })!.points, 2);
  // Same name again gets its own key.
  assert.equal(addRule(s, form(), "t").season.rules.at(-1)!.key, "sneakyAllianceVote2");
});

test("rule forms are validated", () => {
  const s = createSeason(ref, "r", "R");
  assert.throws(() => addRule(s, form({ name: " " }), "t"), /name/);
  assert.throws(() => addRule(s, form({ points: { "pre-merge": null, "post-merge": null, finale: null } }), "t"), /at least one phase/);
  assert.throws(() => addRule(s, form({ inputType: "choice", options: [] }), "t"), /at least one option/);
  assert.throws(() => addRule(s, form({ points: { "pre-merge": NaN, "post-merge": 1, finale: 1 } }), "t"), /numbers/);
});

test("a choice rule takes typed options, and options round-trip through text", () => {
  const options = parseOptions("Won it | 1 | 2 | 2\nTiered first | 2\nPre-merge only | 5 | - | -");
  assert.deepEqual(options[0], { label: "Won it", points: { "pre-merge": 1, "post-merge": 2, finale: 2 } });
  assert.deepEqual(options[1], { label: "Tiered first", points: 2 });
  assert.deepEqual(options[2], { label: "Pre-merge only", points: { "pre-merge": 5 } });
  assert.deepEqual(parseOptions(optionsToText(options)), options);
  assert.throws(() => parseOptions("No value"), /needs a point value/);
  assert.throws(() => parseOptions("Bad | x"), /not a number/);
  assert.throws(() => parseOptions("Two | 1 | 2"), /one number, or three/);
  assert.throws(() => parseOptions("| 3"), /needs a label/);
  assert.throws(() => parseOptions("Nowhere | - | - | -"), /applies in no phase/);

  const s = addRule(createSeason(ref, "r", "R"), form({ name: "Challenge tier", inputType: "choice", points: { "pre-merge": null, "post-merge": null, finale: null }, options }), "t").season;
  const rule = s.rules.at(-1)!;
  assert.equal(resolveInput(rule, "pre-merge", { option: 2 })!.points, 5);
  assert.throws(() => resolveInput(rule, "post-merge", { option: 2 }), /does not apply/);
});

test("a rule that has been scored can be edited and retired but not re-typed or deleted", () => {
  let s = addRule(activateSeason(seasonWithTeams(), "t").season, form(), "t").season;
  s = publishEpisode(saveDraft(s, { episode: 1, rows: [{ castaway: "a1", inputs: { sneakyAllianceVote: { on: true } } }] }, at), 1, "t").season;
  assert.equal(ruleUsed(s, "sneakyAllianceVote"), true);
  assert.throws(() => updateRule(s, "sneakyAllianceVote", form({ inputType: "quantity" }), "t"), /already been scored/);
  assert.throws(() => removeRule(s, "sneakyAllianceVote", "t"), /Retire it instead/);

  // Editing the value affects only future episodes: episode 1 keeps the points it resolved to.
  const edited = updateRule(s, "sneakyAllianceVote", form({ points: { "pre-merge": 9, "post-merge": 9, finale: null } }), "t").season;
  assert.equal(edited.scores[0].entries[0].points, 1);

  const retired = setRuleRetired(s, "sneakyAllianceVote", true, "t").season;
  assert.ok(!rulesForPhase(retired, "pre-merge").some((r) => r.key === "sneakyAllianceVote"));
  assert.equal(retired.scores[0].entries[0].rule, "sneakyAllianceVote", "history is intact");
  assert.ok(rulesForPhase(setRuleRetired(retired, "sneakyAllianceVote", false, "t").season, "pre-merge").some((r) => r.key === "sneakyAllianceVote"));
});

test("an unused rule can be deleted, but not the rule that identifies the season winner", () => {
  const s = addRule(createSeason(ref, "r", "R"), form(), "t").season;
  assert.equal(removeRule(s, "sneakyAllianceVote", "t").season.rules.some((r) => r.key === "sneakyAllianceVote"), false);
  assert.throws(() => removeRule(s, "winner", "t"), /identifies the season winner/);
  assert.throws(() => setRuleRetired(s, "winner", true, "t"), /identifies the season winner/);
  assert.equal(setWinnerRule(s, "final3", "t").season.config.wager.winnerRule, "final3");
  assert.throws(() => setWinnerRule(s, "nope", "t"), /in use/);
});

// ---------- templates ----------

test("a template carries the rules and layout to a new season, only before scoring starts", () => {
  const tpl = templateFrom(ref);
  assert.deepEqual(tpl.layout, { total: 14, mergeAt: 6, draftTail: 2 });
  const fresh = createSeason(null, "f", "F");
  assert.equal(fresh.rules.length, 0);
  const applied = applyTemplate(fresh, tpl, "t").season;
  assert.deepEqual(applied.rules, ref.rules);
  assert.equal(applied.episodes.length, 14);
  assert.equal(applied.config.wager.winnerRule, "winner");
  assert.throws(() => applyTemplate(activateSeason(seasonWithTeams(), "t").season, tpl, "t"), /in setup/);
  const scored = seasonWithTeams();
  scored.scores.push({ episode: 1, castaway: "a1", entries: [{ rule: "journey", points: 1 }] });
  assert.throws(() => applyTemplate(scored, tpl, "t"), /Scoring has started/);
  // Retired rules are not carried into a template.
  const withRetired = setRuleRetired(createSeason(ref, "q", "Q"), "journey", true, "t").season;
  assert.equal(templateFrom(withRetired).rules.some((r) => r.key === "journey"), false);
});

function seasonWithTeams(): Season {
  const s = createSeason(ref, "s", "S");
  s.castaways = ["a1", "a2", "b1", "b2", "v1", "v2"].map((id, i) => ({ id, name: id, initialTribeId: id[0] === "a" ? "cila" : id[0] === "b" ? "kalo" : "vatu", order: i + 1 }));
  s.teams = [
    { id: "x", member: "X", name: "X", draft: ["v1", "a1", "b1", "v2"] },
    { id: "y", member: "Y", name: "Y", draft: ["v2", "a2", "b2", "v1"] },
  ];
  s.config.openingSeed = ["x", "y"];
  s.config.ownershipCap = 2;
  s.episodes = s.episodes.slice(0, 4);
  s.episodes[3].phase = "finale";
  return s;
}

// ---------- two tribes, two picks from each ----------

test("two tribes with two picks each: the slots are built in one step and a full draft comes out legal", () => {
  let s = createSeason(ref, "two", "Two Tribes");
  s.tribes = [
    { id: "aloha", name: "Aloha", color: "#e8752a" },
    { id: "bula", name: "Bula", color: "#1fb5b0" },
  ];
  s.castaways = [
    ...Array.from({ length: 6 }, (_, i) => ({ id: `a${i + 1}`, name: `A${i + 1}`, initialTribeId: "aloha", order: i + 1 })),
    ...Array.from({ length: 6 }, (_, i) => ({ id: `b${i + 1}`, name: `B${i + 1}`, initialTribeId: "bula", order: i + 7 })),
  ];
  s.teams = ["p", "q", "r", "u"].map((id) => ({ id, member: id.toUpperCase(), name: `Team ${id}`, draft: ["", "", "", ""] }));
  s.config.openingSeed = ["p", "q", "r", "u"];
  s.config.ownershipCap = 2;

  s = applyRosterLayout(s, { perTribe: 2, wild: 0 }, "t").season;
  assert.deepEqual(s.slots.map((x) => x.name), ["Aloha 1", "Aloha 2", "Bula 1", "Bula 2"]);
  assert.deepEqual(s.slots.map((x) => x.restrictionTribeId), ["aloha", "aloha", "bula", "bula"]);
  s = applyEpisodeLayout(s, { total: 10, mergeAt: 6, draftTail: 0 }, "t").season;

  s = openOpeningSelection(s, "t").season;
  assert.match(String(tryPick(s, "p", 2, "a1")), /Bula 1 slot needs a Bula/, "an Aloha castaway cannot fill a Bula slot");
  s = makeOpeningPick(s, "p", 0, "a1", "m", at).season;

  // Drive the rest of the draft.
  let guard = 0;
  while (s.status === "OPENING_SELECTION" && guard++ < 100) {
    const turn = openingTurn(s)!;
    const team = s.teams.find((t) => t.id === turn.teamId)!;
    let done = false;
    for (let slot = 0; slot < s.slots.length && !done; slot++) {
      if (team.draft[slot]) continue;
      for (const c of s.castaways) {
        try {
          s = makeOpeningPick(s, team.id, slot, c.id, "m", at).season;
          done = true;
          break;
        } catch {
          /* not legal for this slot */
        }
      }
    }
    assert.ok(done, `pick ${turn.index + 1} had no legal choice`);
  }
  assert.equal(s.status, "ACTIVE");
  assert.equal(s.opening.picks.length, 16);
  for (const t of s.teams) {
    assert.equal(rosterProblem(s, t.id, t.draft), null, `${t.member}'s roster is legal`);
    const tribes = t.draft.map((c) => s.castaways.find((x) => x.id === c)!.initialTribeId);
    assert.deepEqual(tribes.slice().sort(), ["aloha", "aloha", "bula", "bula"], `${t.member} has two from each tribe`);
    assert.equal(new Set(t.draft).size, 4, "no castaway twice on a team");
  }
  for (const c of s.castaways) assert.ok(ownerCount(s, c.id, 1) <= 2, `${c.id} within the cap`);
});

function tryPick(s: Season, team: string, slot: number, castaway: string): string | null {
  try {
    makeOpeningPick(s, team, slot, castaway, "m", at);
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

test("roster layout refuses once anyone has picked, or without tribes", () => {
  const s = createSeason(ref, "z", "Z");
  s.teams = [{ id: "x", member: "X", name: "X", draft: ["v1", "", "", ""] }];
  assert.throws(() => applyRosterLayout(s, { perTribe: 2, wild: 0 }, "t"), /already filled in/);
  const none = createSeason(null, "n", "N");
  assert.throws(() => applyRosterLayout(none, { perTribe: 2, wild: 0 }, "t"), /Add the tribes first/);
  assert.throws(() => applyRosterLayout(createSeason(ref, "y", "Y"), { perTribe: 0, wild: 0 }, "t"), /no roster slots/);
  assert.equal(applyRosterLayout(createSeason(ref, "y", "Y"), { perTribe: 1, wild: 1 }, "t").season.slots.map((x) => x.name).join(","), "Cila,Kalo,Vatu,Wild");
});
