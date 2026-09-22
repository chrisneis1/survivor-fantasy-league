// Fills fields added after a season was first stored, so older documents keep loading.
import type { Season } from "./types";

import type { WagerConfig } from "./types";

/** Defaults for a season's wager. The league wagers up to 30 points at a 1:1 payout. */
export const DEFAULT_WAGER: WagerConfig = { minStake: 1, maxStake: 30, correctMultiplier: 1, wrongMultiplier: 1, winnerRule: "winner" };

export function migrateSeason(raw: Season): Season {
  const s = raw as Season & Partial<Pick<Season, "opening" | "windows" | "wagerState">>;
  s.opening ??= { picks: [] };
  s.windows ??= [];
  s.drafts ??= [];
  (s as Season).tribeSwaps ??= [];
  s.corrections ??= [];
  const c = s.config;
  c.openingRoundMode ??= "SNAKE";
  delete (c as { turn?: unknown }).turn; // an earlier draft had turn timers; picks have no time limit
  c.freeReplacementStatuses ??= ["MEDICAL_EVACUATION"];
  c.wager ??= { ...DEFAULT_WAGER };
  s.wagerState ??= s.wagers.length > 0 ? "LOCKED" : "OFF";
  return s as Season;
}
