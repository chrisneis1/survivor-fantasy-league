// CSV export: a snapshot of a season's public data for spreadsheets and backups. Pure function, no I/O.
// Multiple tables in one file (blank line between each) — Excel, Sheets and Numbers all open this as one sheet.
import { castawayEpisodeTotal, castawaySeasonTotal, effectiveRoster, latestPublished, standings, standingsAfterWager } from "./engine";
import type { Season } from "./types";

const csvCell = (v: string | number | null | undefined): string => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const row = (cells: (string | number | null | undefined)[]) => cells.map(csvCell).join(",");
const table = (title: string, header: string[], rows: (string | number | null | undefined)[][]): string =>
  [`# ${title}`, row(header), ...rows.map(row)].join("\n");

export function seasonCsv(season: Season): string {
  const through = latestPublished(season);
  const episodes = season.episodes.filter((e) => e.number <= through);
  const teamName = (id: string) => season.teams.find((t) => t.id === id)?.member ?? id;
  const castName = (id: string) => season.castaways.find((c) => c.id === id)?.name ?? id;

  const rows = standings(season, through);
  const wagerRows = season.wagerState === "OFF" && season.wagers.length === 0 ? null : standingsAfterWager(season);
  const standingsTable = table(
    `Standings (through ${through > 0 ? `episode ${through}` : "no published episodes"})`,
    ["Rank", "Team", "Member", "Total", ...episodes.map((e) => e.title), ...(wagerRows ? ["Wager points", "Total after wager", "Rank after wager"] : [])],
    rows.map((r) => {
      const t = season.teams.find((x) => x.id === r.teamId)!;
      const w = wagerRows?.find((x) => x.teamId === r.teamId);
      return [r.rank, t.name, t.member, r.total, ...r.episodeScores, ...(w ? [w.wager?.points ?? "", w.total, w.rank] : [])];
    }),
  );

  const rosterTable = table(
    "Current rosters",
    ["Team", "Member", "Slot", "Castaway", "Tribe", "Status"],
    season.teams.flatMap((t) =>
      season.slots.map((slot, i) => {
        const cid = effectiveRoster(season, t.id, Math.max(through, 1))[i];
        const c = season.castaways.find((x) => x.id === cid);
        const exit = season.statusEvents.find((e) => e.castaway === cid);
        return [t.name, t.member, slot.name, c?.name ?? "", season.tribes.find((tr) => tr.id === c?.initialTribeId)?.name ?? "", exit ? exit.type : c ? "Active" : ""];
      }),
    ),
  );

  const castawayTable = table(
    "Castaways",
    ["Castaway", "Tribe", "Season points", "Status", "Left after episode"],
    season.castaways.map((c) => {
      const exit = season.statusEvents.find((e) => e.castaway === c.id);
      return [c.name, season.tribes.find((t) => t.id === c.initialTribeId)?.name ?? "", castawaySeasonTotal(season, c.id, through), exit ? exit.type : "Active", exit?.afterEpisode ?? ""];
    }),
  );

  const scoresTable = table(
    "Episode scoring",
    ["Episode", "Castaway", "Points", "Rules"],
    season.scores
      .filter((s) => s.episode <= through)
      .sort((a, b) => a.episode - b.episode || castName(a.castaway).localeCompare(castName(b.castaway)))
      .map((s) => [
        episodes.find((e) => e.number === s.episode)?.title ?? s.episode,
        castName(s.castaway),
        castawayEpisodeTotal(season, s.castaway, s.episode),
        s.entries.map((e) => `${season.rules.find((r) => r.key === e.rule)?.name ?? e.rule}: ${e.points}`).join("; "),
      ]),
  );

  const transactionsTable = table(
    "Roster transactions",
    ["Team", "Slot", "Out", "In", "Window after episode", "Effective episode", "Free pick", "Date"],
    [...season.transactions].sort((a, b) => a.windowAfterEpisode - b.windowAfterEpisode || (a.order ?? 0) - (b.order ?? 0)).map((t) => [
      teamName(t.team),
      season.slots[t.slot]?.name ?? t.slot,
      castName(t.out),
      castName(t.in),
      t.windowAfterEpisode,
      t.effectiveEpisode,
      t.free ? "Yes" : "No",
      t.date ?? "",
    ]),
  );

  const correctionsTable = table(
    "Score corrections",
    ["Episode", "Castaway", "Rule", "Before", "After", "Reason", "By", "When"],
    season.corrections.map((c) => [
      episodes.find((e) => e.number === c.episode)?.title ?? c.episode,
      castName(c.castaway),
      season.rules.find((r) => r.key === c.rule)?.name ?? c.rule,
      c.before,
      c.after,
      c.reason,
      c.actor,
      c.at,
    ]),
  );

  return [standingsTable, rosterTable, castawayTable, scoresTable, transactionsTable, correctionsTable].join("\n\n");
}
