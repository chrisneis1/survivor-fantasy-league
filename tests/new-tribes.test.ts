// A tribe swap or the merge brings new tribes mid-season: the commissioner (or the auto-scorer) adds them, castaways
// move from that episode on, emptied tribes drop off the scoring grid, and a late or early merge can be corrected.
import { test } from "node:test";
import assert from "node:assert/strict";
import survivor50 from "../src/data/seasons/survivor-50.json";
import { saveAutoScoring, scoringBrief } from "../src/domain/auto-scoring";
import { currentTribeId } from "../src/domain/engine";
import { publishEpisode, saveDraft } from "../src/domain/scoring";
import { addTribe, dissolvedTribes } from "../src/domain/setup";
import { applyEpisodeLayout, layoutOf } from "../src/domain/template";
import type { Season } from "../src/domain/types";

const at = "2026-10-15T04:00:00.000Z";
const CUT = 3;

/** Survivor 50 cut back to Episode 3, still being played. */
function season(): Season {
  const s = structuredClone(survivor50 as unknown as Season);
  s.status = "ACTIVE";
  s.episodes = s.episodes.map((e) => (e.number > CUT ? { ...e, state: "SCHEDULED" } : e));
  s.scores = s.scores.filter((x) => x.episode <= CUT);
  s.statusEvents = s.statusEvents.filter((x) => x.afterEpisode <= CUT);
  s.transactions = s.transactions.filter((x) => x.windowAfterEpisode < CUT);
  s.tribeSwaps = s.tribeSwaps.filter((x) => x.episode <= CUT);
  s.drafts = [];
  s.windows = [];
  s.wagers = [];
  s.wagerState = "OFF";
  return s;
}

test("a tribe can be added mid-season, once, by name, until the season is archived", () => {
  const s = season();
  const { season: next, tribe } = addTribe(s, { name: "Dina", color: "#d6453d" }, "admin");
  assert.deepEqual(tribe, { id: "dina", name: "Dina", color: "#d6453d" });
  assert.throws(() => addTribe(next, { name: " dina " }, "admin"), /already a tribe called/);
  assert.match(addTribe(s, { name: "Merged" }, "admin").tribe.color, /^#[0-9a-f]{6}$/, "a colour is picked when none is given");
  assert.throws(() => addTribe({ ...s, status: "ARCHIVED" }, { name: "X" }, "admin"), /archived/);
});

test("the auto-scorer adds a swap's new tribe, moves castaways onto it, and they move when the commissioner publishes", () => {
  const s = season();
  const brief = scoringBrief(s, 4);
  const [a, b, c] = brief.castaways;
  const next = saveAutoScoring(
    s,
    4,
    {
      newTribes: [{ name: "Dina", color: "#d6453d" }],
      rows: [
        { castaway: a.name, inputs: {}, tribe: "Dina" },
        { castaway: b.name, inputs: {}, tribe: "dina" },
        { castaway: c.name, inputs: {}, tribe: brief.tribes.find((t) => t.name !== c.tribe)!.name },
      ],
    },
    at,
  );
  assert.ok(next.tribes.some((t) => t.id === "dina" && t.color === "#d6453d"), "the tribe exists straight away");
  assert.deepEqual(next.drafts[0].rows.map((r) => r.tribe), ["dina", "dina", brief.tribes.find((t) => t.name !== c.tribe)!.id]);
  assert.notEqual(currentTribeId(next, a.id, 4), "dina", "nobody moves until it's published");
  // Saving again with the same new tribe doesn't add it twice.
  assert.equal(saveAutoScoring(next, 4, { newTribes: [{ name: "Dina" }], rows: [] }, at).tribes.filter((t) => t.id === "dina").length, 1);

  const published = publishEpisode(next, 4, "admin").season;
  assert.equal(currentTribeId(published, a.id, 4), "dina");
  assert.equal(currentTribeId(published, a.id, 3), currentTribeId(s, a.id, 3), "earlier episodes keep the old tribe");
});

test("a tribe everyone has left drops off the scoring grid; a brand-new one doesn't", () => {
  let s = addTribe(season(), { name: "Merged" }, "admin").season;
  assert.ok(!dissolvedTribes(s, 4).has("merged"), "a new, empty tribe is offered");
  const everyone = s.castaways.filter((c) => !s.statusEvents.some((e) => e.castaway === c.id)).map((c) => ({ castaway: c.id, inputs: {}, tribe: "merged" }));
  s = publishEpisode(saveDraft(s, { episode: 4, rows: everyone }, at), 4, "admin").season;
  const gone = dissolvedTribes(s, 5);
  assert.ok(!gone.has("merged"));
  for (const t of s.tribes.filter((t) => t.id !== "merged")) assert.ok(gone.has(t.id), `${t.name} is empty after the merge`);
});

test("the merge episode can be corrected while an episode has saved progress, but not once it's published", () => {
  const s = saveDraft(season(), { episode: 4, rows: [] }, at);
  const layout = layoutOf(s);
  const moved = applyEpisodeLayout(s, { ...layout, mergeAt: 4 }, "admin").season;
  assert.equal(moved.episodes[3].phase, "post-merge");
  assert.equal(moved.episodes[3].state, "SCORING", "the saved progress stays");
  assert.throws(() => applyEpisodeLayout(s, { ...layout, mergeAt: 3 }, "admin"), /Episode 3 is already scored/);

  // The auto-scorer can say this episode was the merge (or wasn't).
  const merged = saveAutoScoring(season(), 4, { phase: "post-merge", rows: [] }, at);
  assert.equal(merged.episodes[3].phase, "post-merge");
  assert.ok(merged.episodes.slice(4, -1).every((e) => e.phase === "post-merge"));
  const notYet = saveAutoScoring(merged, 4, { phase: "pre-merge", rows: [] }, at);
  assert.equal(notYet.episodes[3].phase, "pre-merge");
  assert.equal(notYet.episodes[4].phase, "post-merge", "the merge moves to the next episode");
});
