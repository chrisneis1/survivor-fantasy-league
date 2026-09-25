// The weekly auto-scorer: a scheduled job that researches an episode and saves its scoring as progress for the
// commissioner to review. It can read an episode's scoring setup and save progress, never publish — and never over
// the top of scoring a commissioner has saved.
import { currentTribeId, isActiveAt, statusEventFor } from "./engine";
import { cleanRows, optionPoints, resolveRow, rulesForPhase, saveDraft, statusTypes } from "./scoring";
import type { DraftRow, RuleInput, Season, StatusType } from "./types";

/** The actor recorded on everything the auto-scorer saves. */
export const AUTO_SCORER = "auto-scorer";

/** Everything the auto-scorer needs to score one episode by this league's own rules. */
export function scoringBrief(season: Season, episode: number) {
  const ep = season.episodes.find((e) => e.number === episode);
  if (!ep) throw new AutoScoringError(404, `There's no episode ${episode}.`);
  const draft = season.drafts.find((d) => d.episode === episode);
  const tribe = (id: string) => season.tribes.find((t) => t.id === id)?.name ?? id;
  return {
    season: { id: season.id, name: season.name, status: season.status },
    episode: {
      number: ep.number,
      title: ep.title,
      phase: ep.phase,
      state: ep.state,
      excludeFromStandings: !!ep.excludeFromStandings,
      savedProgress: draft ? { savedAt: draft.savedAt, savedBy: draft.savedBy ?? "commissioner", byAutoScorer: draft.savedBy === AUTO_SCORER } : null,
    },
    rules: rulesForPhase(season, ep.phase).map((r) => ({
      key: r.key,
      name: r.name,
      category: r.category,
      inputType: r.inputType,
      points: r.inputType === "choice" || r.inputType === "manual" ? null : r.points[ep.phase],
      ...(r.inputType === "choice" ? { options: (r.options ?? []).map((o, i) => ({ index: i, label: o.label, points: optionPoints(o, ep.phase) })) } : {}),
      note: r.note,
    })),
    castaways: season.castaways
      .filter((c) => isActiveAt(season, c.id, episode))
      .map((c) => ({ id: c.id, name: c.name, tribe: tribe(currentTribeId(season, c.id, episode)) })),
    alreadyOut: season.castaways
      .filter((c) => !isActiveAt(season, c.id, episode))
      .map((c) => ({ id: c.id, name: c.name, afterEpisode: statusEventFor(season, c.id)!.afterEpisode, how: statusEventFor(season, c.id)!.type })),
    exitTypes: statusTypes,
    howToSend: {
      rows: "One row per castaway who scored or left the game: { castaway: id or name, inputs: { [rule key]: input }, exit?: { type, note? } }.",
      inputs: "boolean rule: { on: true }; quantity rule: { quantity: n }; choice rule: { option: index }; manual rule: { points: n, note: required }. Any input can carry a note (a source, or what to check).",
      note: "note: one message for the commissioner — sources used, and anything the recaps didn't settle that they should check before publishing.",
    },
  };
}

export class AutoScoringError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly problems: string[] = [],
  ) {
    super(message);
  }
}

export interface AutoScoringInput {
  rows: { castaway: string; inputs?: Record<string, RuleInput>; exit?: { type: StatusType; note?: string } }[];
  note?: string;
}

/**
 * Saves the auto-scorer's scoring for an episode as progress, exactly as if the commissioner had pressed Save progress:
 * the episode shows as being scored and nothing public changes until the commissioner publishes it. Castaways may be
 * given by id or by name. Refuses a published episode, an archived season, and an episode a commissioner has already
 * saved progress on (its own earlier save it may replace), and rejects anything the scoring grid would flag.
 */
export function saveAutoScoring(season: Season, episode: number, input: AutoScoringInput, at: string): Season {
  if (season.status === "ARCHIVED") throw new AutoScoringError(409, "This season is archived.");
  const ep = season.episodes.find((e) => e.number === episode);
  if (!ep) throw new AutoScoringError(404, `There's no episode ${episode}.`);
  if (ep.state === "PUBLISHED") throw new AutoScoringError(409, `Episode ${episode} is already published.`);
  const existing = season.drafts.find((d) => d.episode === episode);
  if (existing && existing.savedBy !== AUTO_SCORER)
    throw new AutoScoringError(409, `The commissioner has already saved scoring for episode ${episode}, so auto-scoring won't replace it.`);

  const problems: string[] = [];
  const byName = new Map(season.castaways.map((c) => [c.name.trim().toLowerCase(), c.id]));
  const ids = new Set(season.castaways.map((c) => c.id));
  const rows: DraftRow[] = [];
  for (const raw of Array.isArray(input?.rows) ? input.rows : []) {
    const given = typeof raw?.castaway === "string" ? raw.castaway.trim() : "";
    const id = ids.has(given) ? given : byName.get(given.toLowerCase());
    if (!id) {
      problems.push(`Unknown castaway "${given}".`);
      continue;
    }
    for (const key of Object.keys(raw.inputs ?? {})) if (!season.rules.some((r) => r.key === key)) problems.push(`${given}: unknown rule "${key}".`);
    if (raw.exit && !statusTypes.includes(raw.exit.type)) problems.push(`${given}: unknown exit type "${raw.exit.type}".`);
    rows.push({ castaway: id, inputs: raw.inputs ?? {}, ...(raw.exit ? { exit: raw.exit } : {}) });
  }
  const clean = cleanRows(season, rows);
  const seen = new Set<string>();
  for (const row of clean) {
    const name = season.castaways.find((c) => c.id === row.castaway)!.name;
    if (seen.has(row.castaway)) problems.push(`${name} appears more than once.`);
    seen.add(row.castaway);
    if (!isActiveAt(season, row.castaway, episode)) problems.push(`${name} already left the game before episode ${episode}.`);
    problems.push(...resolveRow(season, ep.phase, row).errors.map((m) => `${name}: ${m}`));
  }
  if (problems.length) throw new AutoScoringError(422, "The scoring has problems; nothing was saved.", problems);

  const note = typeof input?.note === "string" && input.note.trim() ? input.note.trim().slice(0, 4000) : undefined;
  return saveDraft(season, { episode, rows: clean, savedBy: AUTO_SCORER, ...(note ? { note } : {}) }, at);
}
