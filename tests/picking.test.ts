// Opening selection and weekly replacement windows (guide §5.1–5.4, §7, §14).
// The commissioner opens and closes every phase; nothing here depends on the clock.
import { test } from "node:test";
import assert from "node:assert/strict";
import survivor50 from "../src/data/seasons/survivor-50.json";
import type { PickWindow, Season } from "../src/domain/types";
import { effectiveRoster, isActiveAt, ownerCount } from "../src/domain/engine";
import {
  closePickWindow,
  currentTurn,
  endTurn,
  hasLegalPick,
  makeOpeningPick,
  makeReplacement,
  openOpeningSelection,
  openPickWindow,
  openingSequence,
  openingTurn,
  openWindow,
  picksRemaining,
  windowBlock,
} from "../src/domain/picks";
import { publishEpisode, saveDraft } from "../src/domain/scoring";
import { activateSeason, createSeason, validateSetup } from "../src/domain/setup";

const ref = survivor50 as unknown as Season;
const T0 = "2026-01-15T20:00:00.000Z";

// ---------- opening selection ----------

function setupSeason(): Season {
  const s = createSeason(ref, "t-51", "T 51");
  s.castaways = ["a1", "a2", "a3", "b1", "b2", "b3", "v1", "v2", "v3"].map((id, i) => ({
    id,
    name: id.toUpperCase(),
    initialTribeId: id[0] === "a" ? "cila" : id[0] === "b" ? "kalo" : "vatu",
    order: i + 1,
  }));
  s.teams = ["x", "y", "z"].map((id) => ({ id, member: id.toUpperCase(), name: `Team ${id}`, draft: ["", "", "", ""] }));
  s.config.openingSeed = ["x", "y", "z"];
  s.config.ownershipCap = 2;
  s.episodes = s.episodes.slice(0, 4);
  s.episodes[3].phase = "finale";
  return s;
}

test("opening order: FIXED repeats the seed, SNAKE reverses every other round", () => {
  const s = setupSeason();
  s.slots = s.slots.slice(0, 2);
  s.config.openingRoundMode = "FIXED";
  assert.deepEqual(openingSequence(s), ["x", "y", "z", "x", "y", "z"]);
  s.config.openingRoundMode = "SNAKE";
  assert.deepEqual(openingSequence(s), ["x", "y", "z", "z", "y", "x"]);
});

test("opening selection: only the team on turn may pick, rules are enforced, and the last pick activates the season", () => {
  let s = openOpeningSelection(setupSeason(), "t").season;
  assert.equal(s.status, "OPENING_SELECTION");
  assert.equal(openingTurn(s)!.teamId, "x");
  assert.throws(() => makeOpeningPick(s, "y", 0, "a1", "m", T0), /isn't this team's turn/);
  assert.throws(() => makeOpeningPick(s, "x", 1, "b1", "m", T0), /Cila slot needs a Cila/);
  s = makeOpeningPick(s, "x", 0, "a1", "m", T0).season;
  assert.throws(() => makeOpeningPick(s, "x", 0, "a2", "m", T0), /isn't this team's turn/);
  assert.equal(openingTurn(s)!.teamId, "y");

  // Drive the whole draft with the first legal option each time.
  let guard = 0;
  while (s.status === "OPENING_SELECTION" && guard++ < 50) {
    const turn = openingTurn(s)!;
    const team = s.teams.find((t) => t.id === turn.teamId)!;
    let done = false;
    for (let slot = 0; slot < s.slots.length && !done; slot++) {
      if (team.draft[slot]) continue;
      for (const c of s.castaways) {
        try {
          s = makeOpeningPick(s, team.id, slot, c.id, "m", T0).season;
          done = true;
          break;
        } catch {
          /* not legal: try the next castaway */
        }
      }
    }
    assert.ok(done, `turn ${turn.index} had no legal pick`);
  }
  assert.equal(s.status, "ACTIVE");
  assert.equal(s.opening.picks.length, 12);
  assert.deepEqual(validateSetup(s).filter((i) => i.level === "error"), [], "the finished draft is a legal setup");
  for (const c of s.castaways) assert.ok(ownerCount(s, c.id, 1) <= 2, `${c.id} exceeds the ownership cap`);
});

test("the draft can publish before episodes or scoring are configured — teams and pick order are all it needs", () => {
  const s = createSeason(null, "fresh-51", "Fresh 51"); // no episodes, no rules: copied from nothing
  s.tribes = [{ id: "a", name: "A", color: "#111" }];
  s.slots = [{ id: "slot1", name: "Wild", restrictionTribeId: null, enforceOnSwap: false }];
  s.castaways = [
    { id: "c1", name: "C1", initialTribeId: "a", order: 1 },
    { id: "c2", name: "C2", initialTribeId: "a", order: 2 },
  ];
  s.teams = [
    { id: "x", member: "X", name: "X's Team", draft: [""] },
    { id: "y", member: "Y", name: "Y's Team", draft: [""] },
  ];
  s.config.openingSeed = ["x", "y"];
  assert.equal(s.episodes.length, 0);
  assert.equal(s.rules.length, 0);
  assert.ok(validateSetup(s).some((i) => i.level === "error" && i.section === "episodes"), "a full check still flags the missing episodes");
  assert.equal(validateSetup(s, { rosters: false, episodes: false, scoring: false }).filter((i) => i.level === "error").length, 0, "but opening the draft does not need them");
  const opened = openOpeningSelection(s, "t").season;
  assert.equal(opened.status, "OPENING_SELECTION");
});

test("the draft still requires teams, cast and a complete pick order, even with episodes/scoring skipped", () => {
  const s = createSeason(null, "fresh-52", "Fresh 52");
  s.tribes = [{ id: "a", name: "A", color: "#111" }];
  s.castaways = [{ id: "c1", name: "C1", initialTribeId: "a", order: 1 }];
  s.teams = [{ id: "x", member: "X", name: "X's Team", draft: [""] }]; // only one team
  s.config.openingSeed = ["x"];
  assert.throws(() => openOpeningSelection(s, "t"), /Fix 1 setup problem/);
});

test("opening selection cannot start with rosters already filled or an incomplete setup", () => {
  const filled = setupSeason();
  filled.teams[0].draft = ["a1", "", "", ""];
  assert.throws(() => openOpeningSelection(filled, "t"), /already filled in/);
  const s = setupSeason();
  s.teams.pop();
  s.teams.pop();
  assert.throws(() => openOpeningSelection(s, "t"), /Fix/);
});

test("the ownership cap holds during the opening draft", () => {
  let s = openOpeningSelection(setupSeason(), "t").season;
  s = makeOpeningPick(s, "x", 0, "a1", "m", T0).season;
  s = makeOpeningPick(s, "y", 0, "a1", "m", T0).season; // a1 now has 2 owners
  s = makeOpeningPick(s, "z", 0, "b1", "m", T0).season;
  assert.throws(() => makeOpeningPick(s, "z", 1, "a1", "m", T0), /already on 2 teams/); // snake: z is up again
});

// ---------- weekly windows ----------

/** Three teams, one week played: a1 voted out, b1 medically evacuated. */
function playedSeason(): Season {
  const s = setupSeason();
  s.teams[0].draft = ["a1", "a2", "b1", "v1"]; // x: two replaceable slots (one is free)
  s.teams[1].draft = ["b2", "a3", "b3", "v2"]; // y: none
  s.teams[2].draft = ["a1", "a2", "b2", "v3"]; // z: one
  let a = activateSeason(s, "t").season;
  a = saveDraft(
    a,
    {
      episode: 1,
      rows: [
        { castaway: "a1", inputs: {}, exit: { type: "VOTED_OUT" } },
        { castaway: "b1", inputs: {}, exit: { type: "MEDICAL_EVACUATION" } },
        { castaway: "v2", inputs: { extra: { points: 3, note: "test" } } },
        { castaway: "a2", inputs: { extra: { points: 1, note: "test" } } },
      ],
    },
    T0,
  );
  return publishEpisode(a, 1, "t").season;
}
const opened = (s = playedSeason()) => openPickWindow(s, 1, T0, "commissioner").season;
const win = (s: Season): PickWindow => s.windows[0];

test("publishing does not open a window; the commissioner does, and only once", () => {
  const s = playedSeason();
  assert.equal(s.windows.length, 0);
  assert.equal(windowBlock(s, 1), null);
  const o = opened(s);
  assert.equal(o.windows.length, 1);
  assert.match(windowBlock(o, 1)!, /already open/);
  assert.throws(() => openPickWindow(o, 1, T0, "c"), /already open/);
});

test("a window freezes the queue lowest-first, ties by the configured rule, and auto-skips teams with nothing to replace", () => {
  const w = win(opened());
  // x and z tie on 1 point; y has 3. Later opening seed picks first, so z comes before x. Never alphabetical.
  assert.deepEqual(w.turns.map((t) => t.teamId), ["z", "x", "y"]);
  assert.deepEqual(w.turns.map((t) => t.status), ["UP_NOW", "WAITING", "AUTO_SKIPPED"]);
  assert.match(w.turns[2].skipReason!, /No eligible pick/);
  assert.deepEqual(w.turns.map((t) => t.rankAtOpen), [2, 2, 1], "tied teams share a rank; y leads");
  assert.equal("deadlineAt" in w.turns[0], false, "turns have no time limit");
});

test("a window cannot open when nobody can pick, the next episode ignores swaps, or the season is not active", () => {
  const nobody = playedSeason();
  nobody.teams.forEach((t) => (t.draft = ["b2", "a3", "b3", "v2"]));
  assert.match(windowBlock(nobody, 1)!, /No team has an eligible replacement/);
  const fixed = playedSeason();
  fixed.episodes[1].rosterPolicy = "ORIGINAL_DRAFT";
  assert.match(windowBlock(fixed, 1)!, /scores a fixed roster/);
  assert.match(windowBlock(setupSeason(), 1)!, /not active/);
  const s = playedSeason();
  assert.match(windowBlock(s, 2)!, /most recently published/);
});

test("only the current team can pick; a multi-pick turn stays open until the team is done", () => {
  let s = opened();
  assert.throws(() => makeReplacement(s, "x", 0, "a3", "m", T0), /isn't this team's turn/);
  s = makeReplacement(s, "z", 0, "a3", "m", T0).season;
  assert.deepEqual(effectiveRoster(s, "z", 2), ["a3", "a2", "b2", "v3"]);
  assert.equal(effectiveRoster(s, "z", 1)[0], "a1", "the earlier episode's roster is untouched");
  assert.equal(win(s).turns[0].status, "COMPLETED", "z had one open slot, so the turn ended by itself");
  assert.equal(currentTurn(win(s))!.teamId, "x");

  assert.equal(picksRemaining(s, "x", 2), 2);
  s = makeReplacement(s, "x", 2, "b3", "m", T0).season; // free (medical evacuation)
  assert.equal(s.transactions.at(-1)!.free, true);
  assert.equal(currentTurn(win(s))!.teamId, "x", "x still has a slot to fill, so the queue does not advance");
  assert.equal(picksRemaining(s, "x", 2), 1);
  s = makeReplacement(s, "x", 0, "v3", "m", T0).season;
  assert.equal(openWindow(s), undefined, "everyone has acted, so the window closed");
  assert.equal(win(s).status, "CLOSED");
});

test("pass ends the turn once and moves the queue on; unused picks are simply not taken", () => {
  let s = opened();
  s = endTurn(s, "z", "m", T0).season;
  assert.equal(win(s).turns[0].status, "PASSED");
  assert.equal(currentTurn(win(s))!.teamId, "x");
  s = makeReplacement(s, "x", 2, "b3", "m", T0).season;
  s = endTurn(s, "x", "m", T0).season;
  assert.equal(win(s).turns[1].status, "COMPLETED");
  assert.equal(win(s).status, "CLOSED");
  assert.throws(() => endTurn(s, "x", "m", T0), /isn't this team's turn/);
});

test("there is no time limit: a turn stays open however long it takes", () => {
  const s = opened();
  const muchLater = "2027-06-01T00:00:00.000Z";
  const after = makeReplacement(s, "z", 0, "a3", "m", muchLater).season;
  assert.equal(win(after).turns[0].status, "COMPLETED");
  assert.equal(currentTurn(win(s))!.teamId, "z", "nothing advanced by itself");
});

test("the commissioner can skip the team that is up, or close the whole window", () => {
  let s = endTurn(opened(), "z", "commissioner", T0, { skipped: true, reason: "Away this week" }).season;
  assert.equal(win(s).turns[0].skipReason, "Skipped by the commissioner");
  assert.equal(currentTurn(win(s))!.teamId, "x");
  s = closePickWindow(s, "commissioner", T0, "Enough waiting").season;
  assert.equal(win(s).status, "CLOSED");
  assert.equal(win(s).turns[1].status, "PASSED");
  assert.equal(win(s).turns[1].skipReason, "Window closed by the commissioner");
  assert.throws(() => closePickWindow(s, "commissioner", T0), /no open pick window/);
  assert.equal(windowBlock(s, 1), "A window was already held after that episode.");
});

test("the frozen queue does not re-sort when a score is corrected while the window is open", async () => {
  const { correctScore } = await import("../src/domain/scoring");
  const s = opened();
  const order = win(s).turns.map((t) => t.teamId);
  const fixed = correctScore(s, { episode: 1, castaway: "v2", rule: "extra", points: 0, reason: "Mis-scored" }, "c", T0).season;
  assert.deepEqual(win(fixed).turns.map((t) => t.teamId), order);
});

test("replacement rules: ownership cap, duplicates, eliminated castaways", () => {
  let s = opened();
  assert.throws(() => makeReplacement(s, "z", 0, "a1", "m", T0), /Eliminated/);
  assert.throws(() => makeReplacement(s, "z", 0, "a2", "m", T0), /Already on your team/);
  assert.throws(() => makeReplacement(s, "z", 1, "a3", "m", T0), /nobody to replace/);
  s = makeReplacement(s, "z", 0, "a3", "m", T0).season; // a3 now on y and z
  assert.equal(ownerCount(s, "a3", 2), 2);
  assert.throws(() => makeReplacement(s, "x", 0, "a3", "m", T0), /Ownership cap reached/);
});

test("swap credits: a paid swap needs one, a free replacement does not, and teams with none are auto-skipped", () => {
  const p = playedSeason();
  p.config.swapCreditLimit = 0;
  let s = opened(p);
  // z only has a paid slot and no credits: skipped. x is Up Now with only its free slot usable.
  assert.equal(win(s).turns[0].status, "AUTO_SKIPPED");
  assert.equal(currentTurn(win(s))!.teamId, "x");
  assert.throws(() => makeReplacement(s, "x", 0, "a3", "m", T0), /No swap credits left/);
  s = makeReplacement(s, "x", 2, "b3", "m", T0).season;
  assert.equal(s.transactions.at(-1)!.free, true);
  assert.equal(win(s).status, "CLOSED");
});

test("every replacement replaces an eliminated castaway and scores from the next episode", () => {
  let s = opened();
  s = makeReplacement(s, "z", 0, "a3", "m", T0).season;
  for (const tx of s.transactions) {
    assert.equal(isActiveAt(s, tx.out, tx.effectiveEpisode), false);
    assert.equal(tx.effectiveEpisode, tx.windowAfterEpisode + 1);
  }
  assert.equal(hasLegalPick(s, "z", 2), false);
});
