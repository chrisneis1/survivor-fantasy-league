// Archived seasons imported from the league's old spreadsheets (scripts/import-archive.mjs): the engine must give
// back every team-week score and every final total and rank the sheets recorded.
import { test } from "node:test";
import assert from "node:assert/strict";
import s43 from "../src/data/seasons/survivor-43.json";
import s44 from "../src/data/seasons/survivor-44.json";
import s45 from "../src/data/seasons/survivor-45.json";
import s46 from "../src/data/seasons/survivor-46.json";
import s47 from "../src/data/seasons/survivor-47.json";
import s48 from "../src/data/seasons/survivor-48.json";
import s49 from "../src/data/seasons/survivor-49.json";
import type { Season } from "../src/domain/types";
import { rosterForEpisode, standings, standingsAfterWager, teamEpisodeScore } from "../src/domain/engine";

const seasons = [s43, s44, s45, s46, s47, s48, s49] as unknown as Season[];

for (const season of seasons) {
  test(`${season.name}: every team-week score matches the sheet`, () => {
    season.teams.forEach((team, ti) =>
      season.episodes.forEach((ep, wi) =>
        assert.equal(teamEpisodeScore(season, team.id, ep.number), season.reference.teamWeek[ti][wi], `${team.member} ${ep.title}`),
      ),
    );
  });

  test(`${season.name}: final totals and ranks match the sheet`, () => {
    const rows = season.wagers.length ? standingsAfterWager(season) : standings(season);
    assert.equal(rows.length, season.teams.length);
    for (const row of rows) {
      assert.equal(row.total, season.reference.totals[row.teamId], `${row.teamId} total`);
      assert.equal(row.rank, season.reference.ranks[row.teamId], `${row.teamId} rank`);
    }
  });

  test(`${season.name}: is archived, fully published, and says where it came from`, () => {
    assert.equal(season.status, "ARCHIVED");
    assert.ok(season.episodes.every((e) => e.state === "PUBLISHED"));
    assert.ok(season.archive && season.archive.notes.length > 0);
  });
}

test("seasons with weekly rosters recompute from them; the rest use their recorded team scores", () => {
  for (const season of [s47, s48, s49] as unknown as Season[]) {
    assert.equal(season.archive?.teamScores, undefined);
    season.teams.forEach((team, ti) =>
      season.episodes.forEach((ep, wi) => assert.deepEqual(rosterForEpisode(season, team.id, ep.number), season.reference.rosters[ti][wi])),
    );
  }
  for (const season of [s43, s44, s45, s46] as unknown as Season[]) assert.ok(season.archive?.teamScores);
});

test("a voluntary swap's cost comes off the team's score in the episode it takes effect (Survivor 47)", () => {
  const season = s47 as unknown as Season;
  const tx = season.transactions.find((t) => t.cost)!;
  assert.equal(tx.cost, 2);
  assert.equal(teamEpisodeScore(season, tx.team, tx.effectiveEpisode), -2);
});
