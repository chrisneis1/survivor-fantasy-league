// Fills fields added after a season was first stored, so older documents keep loading.
import { rulePublished, switchCountAndCheckbox } from "./template";
import type { Season, WagerConfig } from "./types";

/**
 * The league scores "Vote correctly" as a checkbox (commissioner's call, September 2026). Applied once to any season
 * still being played where it was a count and hasn't been published yet; saved progress converts with it. Recorded in
 * `migrations`, so a commissioner who switches it back in Setup keeps their choice.
 */
const VOTE_CORRECT_CHECKBOX = "vote-correct-checkbox";

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
  const season = s as Season;
  if (season.status !== "ARCHIVED" && !(season.migrations ?? []).includes(VOTE_CORRECT_CHECKBOX)) {
    const rule = season.rules.find((r) => r.key === "voteCorrect");
    if (rule?.inputType === "quantity" && !rulePublished(season, rule.key)) {
      switchCountAndCheckbox(season, rule.key, "boolean");
      rule.note = "Tick when they voted for the person eliminated. An extra vote cast correctly: add its points under Manual adjustment.";
    }
    season.migrations = [...(season.migrations ?? []), VOTE_CORRECT_CHECKBOX];
  }
  return season;
}
