// Reference-season regression (guide §14.1): the engine must reproduce every team-week score and season
// total from the imported workbook using only configuration + history — no season-specific code.
import { test } from "node:test";
import assert from "node:assert/strict";
import survivor50 from "../src/data/seasons/survivor-50.json";
import type { Season } from "../src/domain/types";
import {
  availability,
  buildPickQueue,
  castawayEpisodeTotal,
  competitionRanks,
  effectiveRoster,
  isActiveAt,
  rosterForEpisode,
  standings,
  standingsAfterWager,
  teamEpisodeScore,
} from "../src/domain/engine";

const season = survivor50 as unknown as Season;
const { reference } = season;

test("reproduces all 196 team-week scores", () => {
  let checked = 0;
  season.teams.forEach((team, ti) => {
    season.episodes.forEach((ep, wi) => {
      assert.equal(teamEpisodeScore(season, team.id, ep.number), reference.teamWeek[ti][wi], `${team.member} ${ep.title}`);
      checked++;
    });
  });
  assert.equal(checked, 196);
});

test("reproduces all 14 season totals and shared ranks", () => {
  const rows = standings(season);
  assert.equal(rows.length, 14);
  for (const row of rows) {
    assert.equal(row.total, reference.totals[row.teamId], row.teamId);
    assert.equal(row.rank, reference.ranks[row.teamId], row.teamId);
  }
});

test("derived rosters match the workbook's weekly rosters (history drives scoring)", () => {
  season.teams.forEach((team, ti) => {
    season.episodes.forEach((ep, wi) => {
      assert.deepEqual(rosterForEpisode(season, team.id, ep.number), reference.rosters[ti][wi], `${team.member} ${ep.title}`);
    });
  });
});

test("a later swap never changes an earlier episode's roster", () => {
  const tx = season.transactions.find((t) => t.effectiveEpisode > 2)!;
  assert.notEqual(effectiveRoster(season, tx.team, tx.effectiveEpisode)[tx.slot], effectiveRoster(season, tx.team, tx.effectiveEpisode - 1)[tx.slot]);
  assert.equal(effectiveRoster(season, tx.team, tx.effectiveEpisode - 1)[tx.slot], tx.out);
});

test("ORIGINAL_DRAFT episodes score the immutable opening roster", () => {
  const draftEps = season.episodes.filter((e) => e.rosterPolicy === "ORIGINAL_DRAFT");
  assert.ok(draftEps.length >= 1);
  for (const ep of draftEps) for (const t of season.teams) assert.deepEqual(rosterForEpisode(season, t.id, ep.number), t.draft);
});

test("post-wager points and ranks match the workbook", () => {
  for (const row of standingsAfterWager(season)) {
    const w = season.wagers.find((x) => x.team === row.teamId)!;
    assert.equal(row.total, w.pointsAfterWager, row.teamId);
    assert.equal(row.rank, w.rankAfterWager, row.teamId);
  }
});

test("shared competition ranks skip occupied positions", () => {
  assert.deepEqual(competitionRanks([50, 40, 40, 10]), [1, 2, 2, 4]);
});

test("a castaway is scored once and applied to every owner", () => {
  const owners = season.teams.filter((t) => rosterForEpisode(season, t.id, 1).includes("cirie"));
  assert.ok(owners.length > 1);
  const pts = castawayEpisodeTotal(season, "cirie", 1);
  assert.equal(pts, 1);
});

test("pick queue is lowest total first with a deterministic tie rule", () => {
  for (const w of [1, 5, 8, 11]) {
    const q = buildPickQueue(season, w);
    assert.equal(q.length, 14);
    for (let i = 1; i < q.length; i++) assert.ok(q[i - 1].pointsAtOpen <= q[i].pointsAtOpen, `window ${w} position ${i}`);
    assert.deepEqual(new Set(q.map((e) => e.sequence)).size, 14);
  }
});

test("teams with nothing to replace are auto-skipped with a reason", () => {
  const q = buildPickQueue(season, 1);
  for (const e of q) {
    assert.equal(e.eligible, e.openSlots > 0);
    if (!e.eligible) assert.match(e.skipReason ?? "", /No eligible pick/);
  }
  assert.ok(q.some((e) => !e.eligible) && q.some((e) => e.eligible));
});

test("availability never exceeds the ownership cap and flags eliminated castaways", () => {
  const list = availability(season, 12);
  for (const a of list) assert.ok(a.owners <= season.config.ownershipCap, `${a.castaway.name}: ${a.owners} owners`);
  assert.equal(isActiveAt(season, "jenna", 2), false);
  assert.equal(isActiveAt(season, "jenna", 1), true);
});

test("every recorded swap replaces an eliminated castaway", () => {
  for (const tx of season.transactions) assert.equal(isActiveAt(season, tx.out, tx.effectiveEpisode), false, `${tx.id}: ${tx.out} → ${tx.in}`);
});

import { migrateSeason } from "../src/domain/migrate";

test("a season stored before phase 4 loads with defaults and scores identically", () => {
  const old = structuredClone(survivor50) as unknown as Record<string, any>;
  delete old.opening;
  delete old.windows;
  delete old.config.openingRoundMode;
  delete old.config.freeReplacementStatuses;
  old.config.turn = { minutes: 240, quietStart: "22:00", quietEnd: "08:00" }; // an earlier draft's timer settings
  const s = migrateSeason(old as unknown as Season);
  assert.deepEqual(s.opening, { picks: [] });
  assert.deepEqual(s.windows, []);
  assert.equal(s.config.openingRoundMode, "SNAKE");
  assert.deepEqual(s.config.freeReplacementStatuses, ["MEDICAL_EVACUATION"]);
  assert.equal("turn" in s.config, false, "picks have no time limit, so stale timer settings are dropped");
  for (const row of standings(s)) assert.equal(row.total, reference.totals[row.teamId]);
});
