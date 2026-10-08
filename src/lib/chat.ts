import type { PickWindow, Season } from "@/domain/types";
import { episodeLabel, seasonPath } from "./format";
import { castawayName, teamOf } from "./view";

/**
 * A short update for the league's group chat about a pick window: the last pick, who's up now and who's next (with
 * the castaway each turn replaces), and where to pick. `origin` is the site's address for the link.
 */
export function pickChatText(season: Season, w: PickWindow, origin: string): string {
  const who = (teamId: string) => `${teamOf(season, teamId).member} (${teamOf(season, teamId).name})`;
  const replacing = (out?: string) => (out ? `, replacing ${castawayName(season, out)}` : "");
  const picks = season.transactions.filter((t) => t.windowAfterEpisode === w.afterEpisode).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const last = picks.at(-1);
  const up = w.status === "OPEN" ? w.turns.find((t) => t.status === "UP_NOW") : undefined;
  const next = up ? w.turns.find((t) => t.status === "WAITING" && t.sequence > up.sequence) : undefined;
  return [
    `${season.name}: picks after ${episodeLabel(season, w.afterEpisode)}`,
    ...(last ? [`Last pick: ${teamOf(season, last.team).member} took ${castawayName(season, last.in)} for ${castawayName(season, last.out)}`] : []),
    ...(up
      ? [`Up now: ${who(up.teamId)}${replacing(up.out)}`, next ? `Next up: ${who(next.teamId)}${replacing(next.out)}` : "Next up: nobody, this is the last pick"]
      : ["That's the last pick: everyone's set for the next episode."]),
    ...(up ? [`Pick here: ${origin}${seasonPath(season.id, "/my")}`] : []),
  ].join("\n");
}
