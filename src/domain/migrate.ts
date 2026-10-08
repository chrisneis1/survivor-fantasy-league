// Fills fields added after a season was first stored, so older documents keep loading.
import { requeueOpenWindow } from "./picks";
import { rulePublished, switchCountAndCheckbox } from "./template";
import type { ScoringRule, Season, WagerConfig } from "./types";

/**
 * The league scores "Vote correctly" as a checkbox (commissioner's call, September 2026). Applied once to any season
 * still being played where it was a count and hasn't been published yet; saved progress converts with it. Recorded in
 * `migrations`, so a commissioner who switches it back in Setup keeps their choice.
 */
const VOTE_CORRECT_CHECKBOX = "vote-correct-checkbox";

/**
 * A challenge for reward and immunity together pays 3, and a tiered one 3 / 2 / 0 (commissioner's call, October 2026).
 * Added once, right after Team immunity win, to any season still being played that scores team immunity.
 */
const REWARD_IMMUNITY_RULE = "reward-immunity-rule";
export const REWARD_IMMUNITY: ScoringRule = {
  key: "rewardImmunity",
  name: "Reward + immunity win (team)",
  category: "Challenges",
  inputType: "choice",
  points: { "pre-merge": 3, "post-merge": null, finale: null },
  options: [
    { label: "Won / 1st", points: { "pre-merge": 3 } },
    { label: "2nd", points: { "pre-merge": 2 } },
  ],
  note: "One challenge for reward and immunity together: score it here instead of under Reward and Team immunity. Tiered placement pays 3/2/0.",
};

/**
 * Teams tied on points in a pick window are ordered by a random draw (commissioner's call, October 2026), not by
 * opening-draft position. Applied once to seasons still being played; finished seasons keep the rule they used.
 */
const RANDOM_PICK_TIES = "random-pick-ties";

/**
 * Pick windows run in rounds by the order castaways left, one turn per castaway to replace (commissioner's call,
 * October 2026). Applied once: a window already open with one turn per team, and nobody picked yet, is re-queued.
 */
const PICK_TURNS_PER_CASTAWAY = "pick-turns-per-castaway";

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
  if (season.status !== "ARCHIVED" && !(season.migrations ?? []).includes(REWARD_IMMUNITY_RULE)) {
    const at = season.rules.findIndex((r) => r.key === "teamImmunity");
    if (at >= 0 && !season.rules.some((r) => r.key === REWARD_IMMUNITY.key)) season.rules.splice(at + 1, 0, structuredClone(REWARD_IMMUNITY));
    season.migrations = [...(season.migrations ?? []), REWARD_IMMUNITY_RULE];
  }
  if (season.status !== "ARCHIVED" && !(season.migrations ?? []).includes(RANDOM_PICK_TIES)) {
    season.config.pickOrderTieRule = "RANDOM_DRAW";
    season.migrations = [...(season.migrations ?? []), RANDOM_PICK_TIES];
  }
  if (season.status !== "ARCHIVED" && !(season.migrations ?? []).includes(PICK_TURNS_PER_CASTAWAY)) {
    season.migrations = [...(season.migrations ?? []), PICK_TURNS_PER_CASTAWAY];
    return requeueOpenWindow(season);
  }
  return season;
}
