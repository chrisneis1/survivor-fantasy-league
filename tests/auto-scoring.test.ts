// The weekly auto-scorer: reads an episode's scoring setup and saves progress — never publishes, never overwrites a
// commissioner's saved scoring.
import { test } from "node:test";
import assert from "node:assert/strict";
import survivor50 from "../src/data/seasons/survivor-50.json";
import { AUTO_SCORER, AutoScoringError, saveAutoScoring, scoringBrief } from "../src/domain/auto-scoring";
import { latestPublished } from "../src/domain/engine";
import { saveDraft } from "../src/domain/scoring";
import type { Season } from "../src/domain/types";

const at = "2026-10-01T16:00:00.000Z";
const CUT = 7;

/** Survivor 50 cut back to Episode 7, active, with Episode 8 not yet scored. */
function season(): Season {
  const s = structuredClone(survivor50 as unknown as Season);
  s.status = "ACTIVE";
  s.episodes = s.episodes.map((e) => (e.number > CUT ? { ...e, state: "SCHEDULED" } : e));
  s.scores = s.scores.filter((x) => x.episode <= CUT);
  s.statusEvents = s.statusEvents.filter((x) => x.afterEpisode <= CUT);
  s.transactions = s.transactions.filter((x) => x.windowAfterEpisode < CUT);
  s.wagers = [];
  s.wagerState = "OFF";
  return s;
}

const errorOf = (fn: () => unknown): AutoScoringError => {
  try {
    fn();
  } catch (e) {
    if (e instanceof AutoScoringError) return e;
    throw e;
  }
  assert.fail("expected an AutoScoringError");
};

test("the brief lists this phase's rules and only the castaways still in the game", () => {
  const s = season();
  const b = scoringBrief(s, 8);
  assert.equal(b.episode.number, 8);
  assert.equal(b.episode.savedProgress, null);
  assert.ok(b.rules.some((r) => r.key === "individualImmunity" && r.points === 3), "post-merge individual immunity is worth 3");
  const outIds = new Set(s.statusEvents.map((e) => e.castaway));
  assert.ok(b.castaways.length > 0 && b.castaways.every((c) => !outIds.has(c.id)));
  assert.equal(b.alreadyOut.length, outIds.size);
});

test("saves scoring as progress by castaway name, with the notes, and publishes nothing", () => {
  const s = season();
  const [a, b] = scoringBrief(s, 8).castaways;
  const next = saveAutoScoring(
    s,
    8,
    {
      rows: [
        { castaway: a.name.toUpperCase(), inputs: { individualImmunity: { on: true, note: "Won the puzzle (Inside Survivor recap)" } } },
        { castaway: b.id, inputs: {}, exit: { type: "VOTED_OUT" } },
      ],
      note: "Sources: two recaps. Check: who said the episode title.",
    },
    at,
  );
  const draft = next.drafts.find((d) => d.episode === 8)!;
  assert.equal(draft.savedBy, AUTO_SCORER);
  assert.equal(draft.note, "Sources: two recaps. Check: who said the episode title.");
  assert.deepEqual(draft.rows.map((r) => r.castaway), [a.id, b.id]);
  assert.equal(next.episodes.find((e) => e.number === 8)!.state, "SCORING");
  assert.equal(latestPublished(next), CUT, "nothing is published");
  assert.equal(next.scores.length, s.scores.length);
  assert.equal(next.statusEvents.length, s.statusEvents.length, "the exit waits for the commissioner to publish");

  // Running again replaces its own earlier save.
  const again = saveAutoScoring(next, 8, { rows: [{ castaway: a.id, inputs: { individualImmunity: { on: true } } }] }, at);
  assert.equal(again.drafts.find((d) => d.episode === 8)!.rows.length, 1);
});

test("never replaces scoring a commissioner saved, or touches a published episode or archived season", () => {
  const s = season();
  const [a] = scoringBrief(s, 8).castaways;
  const byCommissioner = saveDraft(s, { episode: 8, rows: [], savedBy: "admin" }, at);
  assert.equal(errorOf(() => saveAutoScoring(byCommissioner, 8, { rows: [{ castaway: a.id, inputs: { individualImmunity: { on: true } } }] }, at)).status, 409);
  const legacy = saveDraft(s, { episode: 8, rows: [] }, at);
  assert.equal(errorOf(() => saveAutoScoring(legacy, 8, { rows: [] }, at)).status, 409, "a save from before savedBy was kept counts as the commissioner's");
  assert.match(errorOf(() => saveAutoScoring(s, 7, { rows: [] }, at)).message, /already published/);
  const archived = { ...season(), status: "ARCHIVED" as const };
  assert.equal(errorOf(() => saveAutoScoring(archived, 8, { rows: [] }, at)).status, 409);
  assert.equal(errorOf(() => saveAutoScoring(s, 99, { rows: [] }, at)).status, 404);
});

test("rejects anything the scoring grid would flag, and saves nothing", () => {
  const s = season();
  const out = s.statusEvents[0].castaway;
  const [a] = scoringBrief(s, 8).castaways;
  const e = errorOf(() =>
    saveAutoScoring(
      s,
      8,
      {
        rows: [
          { castaway: "Nobody Here", inputs: {} },
          { castaway: a.id, inputs: { notARule: { on: true }, extra: { points: 2 } } },
          { castaway: out, inputs: { individualImmunity: { on: true } } },
        ],
      },
      at,
    ),
  );
  assert.equal(e.status, 422);
  assert.ok(e.problems.some((p) => /Unknown castaway "Nobody Here"/.test(p)));
  assert.ok(e.problems.some((p) => /unknown rule "notARule"/.test(p)));
  assert.ok(e.problems.some((p) => /note/i.test(p)), "a manual adjustment needs a note");
  assert.ok(e.problems.some((p) => /already left the game/.test(p)));
});
