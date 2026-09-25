// Commissioner scoring: resolve inputs to points, validate, publish, correct (guide §5.7, §5.8, §8).
// Pure functions: every mutation returns a new Season plus the audit events it produced.
import { currentTribeId, isActiveAt, rosterForEpisode, tribeBeforeEpisode } from "./engine";
import type {
  AuditEvent,
  DraftRow,
  EpisodeDraft,
  Phase,
  RuleInput,
  RuleOption,
  ScoreEntry,
  ScoringRule,
  Season,
  StatusType,
} from "./types";

export const statusTypes: StatusType[] = ["VOTED_OUT", "MEDICAL_EVACUATION", "QUIT", "OTHER_EXIT"];

const clone = <T>(v: T): T => structuredClone(v);

export function optionPoints(option: RuleOption, phase: Phase): number | null {
  if (typeof option.points === "number") return option.points;
  return option.points[phase] ?? null;
}

/** Rules the commissioner can score in a phase: those with a value there (choice rules need an option for it). */
export function rulesForPhase(season: Season, phase: Phase): ScoringRule[] {
  return season.rules.filter((r) => {
    if (r.retired) return false;
    if (r.inputType === "manual") return true;
    if (r.inputType === "choice") return (r.options ?? []).some((o) => optionPoints(o, phase) !== null);
    return r.points[phase] !== null;
  });
}

/** Resolves one input to a score entry, or null when it scores nothing. Throws on invalid input. */
export function resolveInput(rule: ScoringRule, phase: Phase, input: RuleInput): ScoreEntry | null {
  switch (rule.inputType) {
    case "boolean": {
      if (!input.on) return null;
      const each = rule.points[phase];
      if (each === null) throw new Error(`${rule.name} does not apply in ${phase}`);
      return { rule: rule.key, points: each, ...(input.note ? { note: input.note } : {}) };
    }
    case "quantity": {
      const q = input.quantity ?? 0;
      if (!Number.isInteger(q) || q < 0) throw new Error(`${rule.name}: quantity must be a whole number, 0 or more`);
      if (q === 0) return null;
      const each = rule.points[phase];
      if (each === null) throw new Error(`${rule.name} does not apply in ${phase}`);
      return { rule: rule.key, points: each * q, quantity: q, ...(input.note ? { note: input.note } : {}) };
    }
    case "choice": {
      if (input.option === undefined || input.option < 0) return null;
      const opt = rule.options?.[input.option];
      if (!opt) throw new Error(`${rule.name}: unknown option`);
      const points = optionPoints(opt, phase);
      if (points === null) throw new Error(`${rule.name}: "${opt.label}" does not apply in ${phase}`);
      return { rule: rule.key, points, note: opt.label };
    }
    case "manual": {
      const p = input.points ?? 0;
      if (!Number.isFinite(p)) throw new Error(`${rule.name}: points must be a number`);
      if (p === 0) return null;
      if (!input.note?.trim()) throw new Error(`${rule.name}: a note is required for a manual adjustment`);
      return { rule: rule.key, points: p, note: input.note.trim() };
    }
  }
}

export interface ResolvedRow {
  castaway: string;
  entries: ScoreEntry[];
  total: number;
  errors: string[];
}

/** Resolves every input on a row; problems are collected, not thrown, so the grid can show them live. */
export function resolveRow(season: Pick<Season, "rules">, phase: Phase, row: DraftRow): ResolvedRow {
  const entries: ScoreEntry[] = [];
  const errors: string[] = [];
  for (const [key, input] of Object.entries(row.inputs)) {
    const rule = season.rules.find((r) => r.key === key);
    if (!rule) {
      errors.push(`Unknown rule "${key}"`);
      continue;
    }
    try {
      const e = resolveInput(rule, phase, input);
      if (e) entries.push(e);
    } catch (err) {
      errors.push((err as Error).message);
    }
  }
  return { castaway: row.castaway, entries, total: entries.reduce((s, e) => s + e.points, 0), errors };
}

/** Keeps only well-formed rows and inputs: known castaways, rules and tribes, sane numbers, notes up to 300 characters. */
export function cleanRows(s: Season, rows: DraftRow[]): DraftRow[] {
  const known = new Set(s.castaways.map((c) => c.id));
  const rules = new Set(s.rules.map((r) => r.key));
  const out: DraftRow[] = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r || !known.has(r.castaway)) continue;
    const inputs: Record<string, RuleInput> = {};
    for (const [k, v] of Object.entries(r.inputs ?? {})) {
      if (!rules.has(k) || !v) continue;
      const i: RuleInput = {};
      if (v.on === true) i.on = true;
      if (typeof v.quantity === "number" && v.quantity > 0) i.quantity = Math.floor(v.quantity);
      if (typeof v.option === "number" && v.option >= 0) i.option = Math.floor(v.option);
      if (typeof v.points === "number" && v.points !== 0) i.points = v.points;
      if (typeof v.note === "string" && v.note.trim()) i.note = v.note.trim().slice(0, 300);
      if (Object.keys(i).length) inputs[k] = i;
    }
    const exit = r.exit && statusTypes.includes(r.exit.type as StatusType) ? { type: r.exit.type, ...(r.exit.note?.trim() ? { note: r.exit.note.trim().slice(0, 300) } : {}) } : undefined;
    const tribe = typeof r.tribe === "string" && s.tribes.some((t) => t.id === r.tribe) ? r.tribe : undefined;
    if (Object.keys(inputs).length || exit || tribe) out.push({ castaway: r.castaway, inputs, ...(exit ? { exit } : {}), ...(tribe ? { tribe } : {}) });
  }
  return out;
}

// ---------- progress + publish ----------

export function saveDraft(season: Season, draft: Omit<EpisodeDraft, "savedAt">, at: string): Season {
  const ep = season.episodes.find((e) => e.number === draft.episode);
  if (!ep) throw new Error(`No episode ${draft.episode}`);
  if (ep.state === "PUBLISHED") throw new Error("This episode is published. Use a correction instead.");
  const next = clone(season);
  next.drafts = next.drafts.filter((d) => d.episode !== draft.episode);
  next.drafts.push({ ...draft, savedAt: at });
  next.episodes.find((e) => e.number === draft.episode)!.state = "SCORING";
  return next;
}

/** Every reason this episode cannot be published yet (guide §8.3). Empty means it can. */
export function validatePublish(season: Season, episode: number): string[] {
  const errors: string[] = [];
  const ep = season.episodes.find((e) => e.number === episode);
  if (!ep) return [`No episode ${episode}`];
  if (season.status === "ARCHIVED") errors.push("The season is archived.");
  // An episode excluded from standings can be scored and published before the draft — no team has a roster yet,
  // and none is needed, since it never contributes to any team's total.
  else if (season.status !== "ACTIVE" && !ep.excludeFromStandings) errors.push("The season is not active.");
  if (ep.state === "PUBLISHED") errors.push("This episode is already published.");
  const unpublishedBefore = season.episodes.find((e) => e.number < episode && e.state !== "PUBLISHED");
  if (unpublishedBefore) errors.push(`Publish episode ${unpublishedBefore.number} first.`);
  const draft = season.drafts.find((d) => d.episode === episode);
  if (!draft) errors.push("No scoring has been saved for this episode.");

  for (const row of draft?.rows ?? []) {
    const name = season.castaways.find((c) => c.id === row.castaway)?.name;
    if (!name) {
      errors.push(`Unknown castaway "${row.castaway}".`);
      continue;
    }
    const r = resolveRow(season, ep.phase, row);
    errors.push(...r.errors.map((m) => `${name}: ${m}`));
    if (r.entries.length && !isActiveAt(season, row.castaway, episode)) errors.push(`${name} already left the game, so cannot score this episode.`);
    if (row.exit) {
      if (!statusTypes.includes(row.exit.type)) errors.push(`${name}: unknown exit type.`);
      if (season.statusEvents.some((s) => s.castaway === row.castaway)) errors.push(`${name} already has an exit recorded.`);
    }
  }

  // The season has one winner: never let two castaways both be scored as the Sole Survivor.
  const winnerRule = season.config.wager.winnerRule;
  const winners = (draft?.rows ?? []).filter((r) => resolveRow(season, ep.phase, r).entries.some((e) => e.rule === winnerRule));
  if (winners.length > 1) errors.push(`Only one castaway can win the season, but ${winners.length} are scored that way.`);

  // The roster resolver must succeed and be complete for every team under this episode's policy — except an
  // episode excluded from standings, which is never attributed to any team's roster in the first place.
  if (!ep.excludeFromStandings) {
    for (const t of season.teams) {
      try {
        const roster = rosterForEpisode(season, t.id, episode);
        if (roster.length !== season.slots.length || roster.some((c) => !c || !season.castaways.some((x) => x.id === c)))
          errors.push(`${t.member}'s roster is incomplete for this episode.`);
      } catch (e) {
        errors.push(`${t.member}: ${(e as Error).message}`);
      }
    }
  }
  return errors;
}

/** Makes an episode's saved scoring official. Standings change only here. */
export function publishEpisode(season: Season, episode: number, actor: string): { season: Season; audit: AuditEvent[] } {
  const errors = validatePublish(season, episode);
  if (errors.length) throw new Error(errors.join(" "));
  const next = clone(season);
  const ep = next.episodes.find((e) => e.number === episode)!;
  const draft = next.drafts.find((d) => d.episode === episode)!;
  const publishedRows: { castaway: string; total: number }[] = [];
  for (const row of draft.rows) {
    const { entries, total } = resolveRow(next, ep.phase, row);
    if (entries.length) {
      next.scores.push({ episode, castaway: row.castaway, entries });
      publishedRows.push({ castaway: row.castaway, total });
    }
    if (row.exit) next.statusEvents.push({ castaway: row.castaway, afterEpisode: episode, type: row.exit.type, ...(row.exit.note ? { note: row.exit.note } : {}) });
    if (row.tribe) {
      if (!next.tribes.some((t) => t.id === row.tribe)) throw new Error(`Unknown tribe "${row.tribe}".`);
      if (row.tribe !== tribeBeforeEpisode(next, row.castaway, episode)) next.tribeSwaps.push({ castaway: row.castaway, episode, tribeId: row.tribe });
    }
  }
  next.drafts = next.drafts.filter((d) => d.episode !== episode);
  ep.state = "PUBLISHED";
  const audit: AuditEvent[] = [{ seasonId: season.id, actor, entityType: "episode", entityId: String(episode), action: "PUBLISH", after: { scoredCastaways: publishedRows.length, exits: draft.rows.filter((r) => r.exit).length } }];
  // Wagering closes by itself once the deadline episode is scored.
  if (next.wagerState === "OPEN" && episode >= (next.config.wager.lockAtEpisode ?? 2)) {
    next.wagerState = "LOCKED";
    audit.push({ seasonId: season.id, actor, entityType: "wager", entityId: season.id, action: "AUTO_LOCK" });
  }
  return { season: next, audit };
}

// ---------- corrections (guide §8.4) ----------

export interface CorrectionInput {
  episode: number;
  castaway: string;
  rule: string;
  /** The corrected point value for this rule (0 removes the entry). */
  points: number;
  reason: string;
}

export function correctScore(season: Season, input: CorrectionInput, actor: string, at: string): { season: Season; audit: AuditEvent[] } {
  const ep = season.episodes.find((e) => e.number === input.episode);
  if (!ep || ep.state !== "PUBLISHED") throw new Error("Only a published episode can be corrected.");
  if (!input.reason.trim()) throw new Error("A reason is required for a correction.");
  if (!Number.isFinite(input.points)) throw new Error("Points must be a number.");
  if (!season.rules.some((r) => r.key === input.rule)) throw new Error("Unknown rule.");
  if (!season.castaways.some((c) => c.id === input.castaway)) throw new Error("Unknown castaway.");

  const next = clone(season);
  let row = next.scores.find((s) => s.episode === input.episode && s.castaway === input.castaway);
  const before = (row?.entries ?? []).filter((e) => e.rule === input.rule).reduce((s, e) => s + e.points, 0);
  if (before === input.points) throw new Error("That is already the recorded value.");
  if (!row) {
    row = { episode: input.episode, castaway: input.castaway, entries: [] };
    next.scores.push(row);
  }
  row.entries = row.entries.filter((e) => e.rule !== input.rule);
  if (input.points !== 0) row.entries.push({ rule: input.rule, points: input.points, note: input.reason.trim() });
  if (row.entries.length === 0) next.scores = next.scores.filter((s) => s !== row);

  next.corrections.push({
    id: `c${next.corrections.length + 1}`,
    episode: input.episode,
    castaway: input.castaway,
    rule: input.rule,
    before,
    after: input.points,
    reason: input.reason.trim(),
    actor,
    at,
  });
  return {
    season: next,
    audit: [
      {
        seasonId: season.id,
        actor,
        entityType: "score",
        entityId: `${input.episode}:${input.castaway}:${input.rule}`,
        action: "CORRECT",
        before,
        after: input.points,
        reason: input.reason.trim(),
      },
    ],
  };
}

// ---------- editing a published episode in the scoring grid ----------

/** `${castawayId}:${ruleKey}` for a rule cell, or `${castawayId}:exit` for the exit selector. */
export type CellKey = string;
export const cellKey = (castawayId: string, field: string): CellKey => `${castawayId}:${field}`;
export const splitCellKey = (key: CellKey): [string, string] => {
  const i = key.lastIndexOf(":");
  return [key.slice(0, i), key.slice(i + 1)];
};

/**
 * Rebuilds the grid rows a published episode's scores and exits resolve back to, so "Edit scoring" opens pre-filled.
 * Best-effort only: older imported data did not record a quantity-rule's count or a choice-rule's chosen option, only
 * the points it was worth, so those can't always be recovered exactly. That is fine — the grid uses this purely to
 * display a starting point, and `correctEpisode` never trusts a cell the commissioner did not actually touch.
 */
export function rowsFromPublished(season: Season, episodeNumber: number): DraftRow[] {
  const ep = season.episodes.find((e) => e.number === episodeNumber);
  return season.castaways
    .filter((c) => isActiveAt(season, c.id, episodeNumber))
    .map((c) => {
      const score = season.scores.find((s) => s.episode === episodeNumber && s.castaway === c.id);
      const inputs: Record<string, RuleInput> = {};
      for (const entry of score?.entries ?? []) {
        const rule = season.rules.find((r) => r.key === entry.rule);
        if (!rule) continue;
        if (rule.inputType === "boolean") inputs[entry.rule] = { on: true };
        else if (rule.inputType === "manual") inputs[entry.rule] = { points: entry.points, note: entry.note?.trim() || "Imported from the original scoring sheet" };
        else if (rule.inputType === "quantity") {
          const each = ep ? rule.points[ep.phase] : null;
          const q = each ? entry.points / each : NaN;
          if (Number.isInteger(q) && q >= 0) inputs[entry.rule] = { quantity: q };
          // else: leave blank rather than show a wrong count. The stored points are unaffected unless this cell is touched.
        } else if (rule.inputType === "choice") {
          // Prefer the option whose label matches (the entry's own note); otherwise any option worth the same points,
          // so the reconstructed total still matches even when the exact original choice can't be told apart from another.
          const byLabel = (rule.options ?? []).findIndex((o) => o.label === entry.note);
          const byPoints = byLabel >= 0 ? byLabel : ep ? (rule.options ?? []).findIndex((o) => optionPoints(o, ep.phase) === entry.points) : -1;
          if (byPoints >= 0) inputs[entry.rule] = { option: byPoints };
        }
      }
      const exit = season.statusEvents.find((e) => e.castaway === c.id && e.afterEpisode === episodeNumber);
      return { castaway: c.id, inputs, tribe: currentTribeId(season, c.id, episodeNumber), ...(exit ? { exit: { type: exit.type, ...(exit.note ? { note: exit.note } : {}) } } : {}) };
    });
}

export interface EpisodeEditInput {
  episode: number;
  rows: DraftRow[];
  /** Exactly which cells the commissioner changed. Everything else is left byte-for-byte alone. */
  touched: CellKey[];
  reason: string;
}

/**
 * Edits a published episode using the same grid the commissioner used to publish it, instead of one field at a time.
 * Only the cells named in `touched` are looked at or changed — never a whole row — so a field the grid could not
 * perfectly redisplay (see `rowsFromPublished`) is never silently rewritten just because a different cell was edited.
 * Each changed rule value becomes its own Correction record via correctScore (before/after/the shared reason), so the
 * audit trail stays as detailed as a single-field correction. Who left the game that episode can also be added,
 * changed or removed — unless a pick window has already opened for it, since that window's eligibility was computed
 * from the original result; scores are never blocked by that.
 */
export function correctEpisode(season: Season, input: EpisodeEditInput, actor: string, at: string): { season: Season; audit: AuditEvent[]; changes: number } {
  const ep = season.episodes.find((e) => e.number === input.episode);
  if (!ep || ep.state !== "PUBLISHED") throw new Error("Only a published episode can be edited this way.");
  const reason = input.reason.trim();
  if (!reason) throw new Error("A reason is required to edit published scoring.");
  const windowOpened = season.windows.some((w) => w.afterEpisode === input.episode);
  const rowByCastaway = new Map(input.rows.map((r) => [r.castaway, r]));

  let next = season;
  let changes = 0;
  for (const key of new Set(input.touched)) {
    const [castawayId, field] = splitCellKey(key);
    const castaway = next.castaways.find((c) => c.id === castawayId);
    const row = rowByCastaway.get(castawayId);
    if (!castaway || !row) continue;

    if (field === "tribe") {
      const wantTribe = row.tribe;
      if (!wantTribe || !next.tribes.some((t) => t.id === wantTribe)) throw new Error(`${castaway.name}: choose a tribe.`);
      const priorTribe = tribeBeforeEpisode(next, castawayId, input.episode);
      const existingSwap = next.tribeSwaps.find((e) => e.castaway === castawayId && e.episode === input.episode);
      const recordedNow = existingSwap ? existingSwap.tribeId : priorTribe;
      if (wantTribe === recordedNow) continue;
      const withTribe = clone(next);
      withTribe.tribeSwaps = withTribe.tribeSwaps.filter((e) => !(e.castaway === castawayId && e.episode === input.episode));
      if (wantTribe !== priorTribe) withTribe.tribeSwaps.push({ castaway: castawayId, episode: input.episode, tribeId: wantTribe });
      next = withTribe;
      changes++;
      continue;
    }

    if (field === "exit") {
      const existingExit = next.statusEvents.find((e) => e.castaway === castawayId && e.afterEpisode === input.episode);
      const wantExit = row.exit;
      const same = !!existingExit === !!wantExit && !(existingExit && wantExit && (existingExit.type !== wantExit.type || existingExit.note !== wantExit.note));
      if (same) continue;
      if (windowOpened) throw new Error(`${castaway.name}: a pick window already used this episode's result, so who left can't be changed here. Scores can still be edited.`);
      const withExit = clone(next);
      withExit.statusEvents = withExit.statusEvents.filter((e) => !(e.castaway === castawayId && e.afterEpisode === input.episode));
      if (wantExit) withExit.statusEvents.push({ castaway: castawayId, afterEpisode: input.episode, type: wantExit.type, ...(wantExit.note ? { note: wantExit.note } : {}) });
      next = withExit;
      changes++;
      continue;
    }

    const rule = next.rules.find((r) => r.key === field);
    if (!rule) throw new Error(`Unknown rule "${field}".`);
    let resolvedEntry;
    try {
      resolvedEntry = resolveInput(rule, ep.phase, row.inputs[field] ?? {});
    } catch (e) {
      throw new Error(`${castaway.name}: ${(e as Error).message}`);
    }
    const after = resolvedEntry?.points ?? 0;
    const existingScore = next.scores.find((s) => s.episode === input.episode && s.castaway === castawayId);
    const before = (existingScore?.entries ?? []).filter((e) => e.rule === field).reduce((sum, e) => sum + e.points, 0);
    if (before === after) continue;
    next = correctScore(next, { episode: input.episode, castaway: castawayId, rule: field, points: after, reason }, actor, at).season;
    changes++;
  }

  if (changes === 0) throw new Error("Nothing was changed.");
  return {
    season: next,
    changes,
    audit: [{ seasonId: season.id, actor, entityType: "episode", entityId: String(input.episode), action: "EDIT_SCORING", after: { changes }, reason }],
  };
}
