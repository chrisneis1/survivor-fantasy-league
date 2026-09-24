// League history (Hall of Fame): champions and member careers, worked out from the bundled past seasons.
import { test } from "node:test";
import assert from "node:assert/strict";
import s43 from "../src/data/seasons/survivor-43.json";
import s44 from "../src/data/seasons/survivor-44.json";
import s45 from "../src/data/seasons/survivor-45.json";
import s46 from "../src/data/seasons/survivor-46.json";
import s47 from "../src/data/seasons/survivor-47.json";
import s48 from "../src/data/seasons/survivor-48.json";
import s49 from "../src/data/seasons/survivor-49.json";
import s50 from "../src/data/seasons/survivor-50.json";
import { bySeasonNumber, finalStandings, leagueHistory, memberKey, seasonNumber } from "../src/domain/history";
import { createSeason } from "../src/domain/setup";
import type { Season } from "../src/domain/types";

const past = [s43, s44, s45, s46, s47, s48, s49, s50] as unknown as Season[];

test("seasons sort by their number, whatever order the database returns them in", () => {
  const shuffled = [past[7], past[2], past[0], past[5]];
  assert.deepEqual(bySeasonNumber(shuffled).map((s) => s.id), ["survivor-43", "survivor-45", "survivor-48", "survivor-50"]);
  assert.equal(seasonNumber({ id: "demo", name: "Demo Season" }), null);
  const withDemo = bySeasonNumber([{ id: "demo", name: "Demo Season" }, past[1]]);
  assert.deepEqual(withDemo.map((s) => s.id), ["survivor-44", "demo"], "unnumbered seasons go last");
});

test("champions come from each season's final standings, newest first", () => {
  const h = leagueHistory([...past].reverse());
  assert.equal(h.completedSeasons, 8);
  assert.deepEqual(
    h.champions.map((c) => [c.season.id, c.winners.map((w) => w.member).join("&")]),
    [
      ["survivor-50", "Shane"],
      ["survivor-49", "Shane"],
      ["survivor-48", "Jack"],
      ["survivor-47", "Dalsin"],
      ["survivor-46", "Shane"],
      ["survivor-45", "Kenzie"],
      ["survivor-44", "Shane"],
      ["survivor-43", "Shane"],
    ],
  );
});

test("final standings include a season's final bonus or typed-in total, the way the sheet ranked it", () => {
  const s46 = past[3];
  const rows = finalStandings(s46);
  const lela = rows.find((r) => r.teamId === "lela")!;
  assert.equal(lela.total, 193);
  assert.equal(lela.rank, 12);
  const s47 = finalStandings(past[4]);
  assert.equal(s47[0].teamId, "dalsin");
  assert.equal(s47[0].total, 196);
});

test("careers add up across seasons, matching members by name", () => {
  const h = leagueHistory(past);
  const shane = h.members.find((m) => m.key === "shane")!;
  assert.equal(shane.titles, 5);
  assert.equal(shane.finishes.length, 8);
  assert.equal(h.members[0], shane, "most titles first");
  const diego = h.members.find((m) => m.key === "diego")!;
  assert.equal(diego.name, "Diego", "stray spaces in a sheet's member name don't split a career");
  assert.ok(diego.finishes.length >= 2);
  const lela = h.members.find((m) => m.key === "lela")!;
  assert.ok(lela.lastPlaces >= 1);
  for (const m of h.members) {
    assert.equal(m.titles, m.finishes.filter((f) => f.rank === 1).length);
    assert.equal(m.podiums, m.finishes.filter((f) => f.rank <= 3).length);
    assert.equal(new Set(m.finishes.map((f) => f.seasonId)).size, m.finishes.length, "one finish per season");
  }
  assert.equal(memberKey(" Diego "), "diego");
});

test("a season still being played shows as current, not as a finish", () => {
  const live = structuredClone(past[7]);
  live.id = "survivor-51";
  live.name = "Survivor 51";
  live.status = "ACTIVE";
  const h = leagueHistory([...past, live]);
  assert.equal(h.completedSeasons, 8);
  const shane = h.members.find((m) => m.key === "shane")!;
  assert.equal(shane.current.length, 1);
  assert.equal(shane.current[0].seasonId, "survivor-51");
  assert.equal(shane.current[0].final, false);
  // A brand-new season with nothing published doesn't show up at all.
  const empty = createSeason(past[7], "survivor-52", "Survivor 52");
  assert.equal(leagueHistory([...past, empty]).members.find((m) => m.key === "shane")!.current.length, 0);
});
