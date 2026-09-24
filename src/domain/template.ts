// Scoring template and season layout: edit the rule list, lay out episodes and roster slots, save/apply templates.
// Pure functions over a Season; each returns the new season plus audit events.
import { optionPoints } from "./scoring";
import { slug } from "./setup";
import type { AuditEvent, Episode, InputType, Phase, RuleOption, ScoringRule, Season } from "./types";

const clone = <T>(v: T): T => structuredClone(v);
type Result = { season: Season; audit: AuditEvent[] };
const phases: Phase[] = ["pre-merge", "post-merge", "finale"];
const inputTypes: InputType[] = ["boolean", "quantity", "choice", "manual"];
const ev = (s: Season, actor: string, entityType: string, entityId: string, action: string, before?: unknown, after?: unknown): AuditEvent => ({
  seasonId: s.id,
  actor,
  entityType,
  entityId,
  action,
  before,
  after,
});

// =====================================================================================================
// Rules
// =====================================================================================================

export interface RuleForm {
  name: string;
  category: string;
  note: string;
  inputType: InputType;
  points: Record<Phase, number | null>;
  options?: RuleOption[];
}

/** Has this rule been scored (published or saved as progress)? A used rule keeps its meaning: it can be retired, not deleted. */
export function ruleUsed(season: Season, key: string): boolean {
  return season.scores.some((s) => s.entries.some((e) => e.rule === key)) || season.drafts.some((d) => d.rows.some((r) => key in r.inputs));
}

function checkForm(f: RuleForm): RuleForm {
  const name = f.name.trim();
  if (!name) throw new Error("Give the rule a name.");
  if (!inputTypes.includes(f.inputType)) throw new Error("Choose how the rule is entered.");
  const points: Record<Phase, number | null> = { "pre-merge": null, "post-merge": null, finale: null };
  if (f.inputType === "boolean" || f.inputType === "quantity") {
    for (const p of phases) {
      const v = f.points[p];
      if (v !== null && !Number.isFinite(v)) throw new Error("Point values must be numbers.");
      points[p] = v;
    }
    if (phases.every((p) => points[p] === null)) throw new Error("Give the rule a value in at least one phase.");
  }
  if (f.inputType === "choice" && !(f.options ?? []).length) throw new Error("A choice rule needs at least one option.");
  return {
    name,
    category: f.category.trim() || "Other",
    note: f.note.trim(),
    inputType: f.inputType,
    points,
    ...(f.inputType === "choice" ? { options: f.options } : {}),
  };
}

/**
 * Options are typed one per line: "Label | pre-merge | post-merge | finale". A blank or "-" means the option does not
 * apply in that phase; a single number after the label means the same value in every phase.
 */
export function parseOptions(text: string): RuleOption[] {
  const out: RuleOption[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const parts = line.split("|").map((p) => p.trim());
    const label = parts[0];
    if (!label) throw new Error(`Option "${line}" needs a label before the first "|".`);
    const nums = parts.slice(1);
    const toNum = (s: string): number | null => {
      if (s === "" || s === "-") return null;
      const n = Number(s);
      if (!Number.isFinite(n)) throw new Error(`"${s}" in option "${label}" is not a number.`);
      return n;
    };
    if (nums.length === 0) throw new Error(`Option "${label}" needs a point value.`);
    if (nums.length === 1) {
      const n = toNum(nums[0]);
      if (n === null) throw new Error(`Option "${label}" needs a point value.`);
      out.push({ label, points: n });
    } else if (nums.length === 3) {
      const [a, b, c] = nums.map(toNum);
      if (a === null && b === null && c === null) throw new Error(`Option "${label}" applies in no phase.`);
      out.push({ label, points: { ...(a !== null ? { "pre-merge": a } : {}), ...(b !== null ? { "post-merge": b } : {}), ...(c !== null ? { finale: c } : {}) } });
    } else {
      throw new Error(`Option "${label}": write one number, or three (pre-merge | post-merge | finale).`);
    }
  }
  return out;
}

export function optionsToText(options: RuleOption[] = []): string {
  return options
    .map((o) => {
      const pts = o.points;
      if (typeof pts === "number") return `${o.label} | ${pts}`;
      return `${o.label} | ${phases.map((p) => pts[p] ?? "-").join(" | ")}`;
    })
    .join("\n");
}

export function addRule(season: Season, form: RuleForm, actor: string): Result {
  if (season.status === "ARCHIVED") throw new Error("An archived season is read-only.");
  const f = checkForm(form);
  const next = clone(season);
  let key = slug(f.name).replace(/-([a-z])/g, (_, c: string) => c.toUpperCase()) || "rule";
  for (let i = 2; next.rules.some((r) => r.key === key); i++) key = `${key.replace(/\d+$/, "")}${i}`;
  next.rules.push({ key, ...f });
  return { season: next, audit: [ev(season, actor, "scoring_rule", key, "ADD", undefined, f)] };
}

export function updateRule(season: Season, key: string, form: RuleForm, actor: string): Result {
  if (season.status === "ARCHIVED") throw new Error("An archived season is read-only.");
  const f = checkForm(form);
  const next = clone(season);
  const rule = next.rules.find((r) => r.key === key);
  if (!rule) throw new Error("Unknown rule.");
  if (rule.inputType !== f.inputType && ruleUsed(season, key)) throw new Error("This rule has already been scored, so how it is entered can't change. Retire it and add a new one.");
  const before = clone(rule);
  Object.assign(rule, { name: f.name, category: f.category, note: f.note, inputType: f.inputType, points: f.points });
  if (f.inputType === "choice") rule.options = f.options;
  else delete rule.options;
  return { season: next, audit: [ev(season, actor, "scoring_rule", key, "UPDATE", before, rule)] };
}

export function removeRule(season: Season, key: string, actor: string): Result {
  if (season.status === "ARCHIVED") throw new Error("An archived season is read-only.");
  if (!season.rules.some((r) => r.key === key)) throw new Error("Unknown rule.");
  if (ruleUsed(season, key)) throw new Error("This rule has been scored, so it can't be deleted. Retire it instead.");
  if (key === season.config.wager.winnerRule) throw new Error("This rule identifies the season winner for the final wager. Pick a different winner rule first.");
  const next = clone(season);
  next.rules = next.rules.filter((r) => r.key !== key);
  return { season: next, audit: [ev(season, actor, "scoring_rule", key, "REMOVE")] };
}

/** Retiring hides a rule from the scoring grid but keeps it, so past scores still read correctly. */
export function setRuleRetired(season: Season, key: string, retired: boolean, actor: string): Result {
  if (season.status === "ARCHIVED") throw new Error("An archived season is read-only.");
  if (retired && key === season.config.wager.winnerRule) throw new Error("This rule identifies the season winner for the final wager, so it can't be retired.");
  const next = clone(season);
  const rule = next.rules.find((r) => r.key === key);
  if (!rule) throw new Error("Unknown rule.");
  if (retired) rule.retired = true;
  else delete rule.retired;
  return { season: next, audit: [ev(season, actor, "scoring_rule", key, retired ? "RETIRE" : "RESTORE")] };
}

export function setWinnerRule(season: Season, key: string, actor: string): Result {
  const rule = season.rules.find((r) => r.key === key);
  if (!rule || rule.retired) throw new Error("Choose a scoring rule that is in use.");
  const next = clone(season);
  const before = next.config.wager.winnerRule;
  next.config.wager.winnerRule = key;
  return { season: next, audit: [ev(season, actor, "season", season.id, "SET_WINNER_RULE", before, key)] };
}

// =====================================================================================================
// Episode layout
// =====================================================================================================

export interface EpisodeLayout {
  total: number;
  /** The first post-merge episode. Equal to `total` means the finale is the only post-merge episode. */
  mergeAt: number;
  /** How many episodes at the end score every team's original draft roster. */
  draftTail: number;
}

const genericTitle = /^(Episode|Week) \d+$|^Finale$/;

/** Lays out the whole season's episodes in one step. Episodes that have been scored (or have progress saved) are left alone. */
export function applyEpisodeLayout(season: Season, layout: EpisodeLayout, actor: string): Result {
  if (season.status === "ARCHIVED") throw new Error("An archived season is read-only.");
  const { total, mergeAt, draftTail } = layout;
  if (![total, mergeAt, draftTail].every(Number.isInteger)) throw new Error("Use whole numbers.");
  if (total < 1 || total > 40) throw new Error("A season has 1 to 40 episodes.");
  if (mergeAt < 1 || mergeAt > total) throw new Error(`The merge episode must be between 1 and ${total}.`);
  if (draftTail < 0 || draftTail >= total) throw new Error("The original-draft episodes at the end must be fewer than the total.");

  const locked = season.episodes.filter((e) => e.state !== "SCHEDULED");
  if (total < locked.length) throw new Error(`${locked.length} episodes are already scored or in progress, so the season can't have fewer than that.`);

  const wanted = (n: number): Pick<Episode, "phase" | "rosterPolicy"> => ({
    phase: n === total ? "finale" : n >= mergeAt ? "post-merge" : "pre-merge",
    rosterPolicy: n > total - draftTail ? "ORIGINAL_DRAFT" : "EFFECTIVE",
  });
  for (const e of locked) {
    const w = wanted(e.number);
    if (e.phase !== w.phase || e.rosterPolicy !== w.rosterPolicy) throw new Error(`Episode ${e.number} is already scored as ${e.phase} (${e.rosterPolicy.toLowerCase().replace("_", " ")}); the layout would make it ${w.phase}. Adjust the layout to match.`);
  }

  const next = clone(season);
  const before = next.episodes.map((e) => `${e.number}:${e.phase}`);
  next.episodes = Array.from({ length: total }, (_, i) => {
    const n = i + 1;
    const existing = next.episodes.find((e) => e.number === n);
    const w = wanted(n);
    const title = !existing || genericTitle.test(existing.title) ? (w.phase === "finale" ? "Finale" : `Episode ${n}`) : existing.title;
    if (existing && existing.state !== "SCHEDULED") return existing;
    return { id: `e${n}`, number: n, title, phase: w.phase, state: "SCHEDULED" as const, rosterPolicy: w.rosterPolicy, ...(existing?.excludeFromStandings ? { excludeFromStandings: true } : {}) };
  });
  return { season: next, audit: [ev(season, actor, "season", season.id, "APPLY_EPISODE_LAYOUT", before, layout)] };
}

/** Reads a season's episodes back as a layout (the inverse of applyEpisodeLayout). */
export function layoutOf(season: Season): EpisodeLayout {
  const total = season.episodes.length;
  const firstPost = season.episodes.findIndex((e) => e.phase === "post-merge" || e.phase === "finale");
  let tail = 0;
  for (let i = total - 1; i >= 0 && season.episodes[i].rosterPolicy === "ORIGINAL_DRAFT"; i--) tail++;
  return { total, mergeAt: firstPost < 0 ? total : firstPost + 1, draftTail: Math.min(tail, Math.max(total - 1, 0)) };
}

// =====================================================================================================
// Roster layout
// =====================================================================================================

/**
 * Builds the roster slots from "picks per tribe": each tribe gets that many slots restricted to its castaways, plus any
 * wild slots. Two tribes with two picks each gives four slots. Only while no roster has been picked.
 */
export function applyRosterLayout(season: Season, layout: { perTribe: number; wild: number }, actor: string): Result {
  if (season.status !== "SETUP") throw new Error("Roster slots can only be changed while the season is in setup.");
  const { perTribe, wild } = layout;
  if (!Number.isInteger(perTribe) || !Number.isInteger(wild) || perTribe < 0 || wild < 0 || perTribe > 6 || wild > 6) throw new Error("Use whole numbers from 0 to 6.");
  if (season.tribes.length === 0) throw new Error("Add the tribes first.");
  if (season.teams.some((t) => t.draft.some(Boolean))) throw new Error("Some rosters are already filled in. Clear them before changing the slots.");
  const slots: Season["slots"] = [];
  const add = (name: string, restrictionTribeId: string | null) => slots.push({ id: `slot${slots.length + 1}`, name, restrictionTribeId, enforceOnSwap: false });
  // Only tribes that actually have castaways get slots: a placeholder tribe the cast has since moved off, or last
  // season's tribes copied into a new one, would otherwise get slots nobody can fill. Before any cast is entered,
  // every tribe counts.
  const tribes = season.castaways.length ? season.tribes.filter((t) => season.castaways.some((c) => c.initialTribeId === t.id)) : season.tribes;
  for (const t of tribes) for (let k = 1; k <= perTribe; k++) add(perTribe === 1 ? t.name : `${t.name} ${k}`, t.id);
  for (let k = 1; k <= wild; k++) add(wild === 1 ? "Wild" : `Wild ${k}`, null);
  if (slots.length === 0) throw new Error("That leaves no roster slots.");
  const next = clone(season);
  next.slots = slots;
  for (const t of next.teams) t.draft = slots.map(() => "");
  return { season: next, audit: [ev(season, actor, "season", season.id, "APPLY_ROSTER_LAYOUT", season.slots.map((s) => s.name), slots.map((s) => s.name))] };
}

// =====================================================================================================
// Templates
// =====================================================================================================

export interface ScoringTemplate {
  rules: ScoringRule[];
  layout: EpisodeLayout;
  winnerRule: string;
}

export function templateFrom(season: Season): ScoringTemplate {
  return { rules: clone(season.rules.filter((r) => !r.retired)), layout: layoutOf(season), winnerRule: season.config.wager.winnerRule };
}

/** Replaces the season's scoring rules and episode layout with a saved template. Only before anything has been scored. */
export function applyTemplate(season: Season, tpl: ScoringTemplate, actor: string): Result {
  if (season.status !== "SETUP") throw new Error("A template can only be applied while the season is in setup.");
  if (season.scores.length || season.drafts.length) throw new Error("Scoring has started, so the rules can't be replaced.");
  const next = clone(season);
  next.rules = clone(tpl.rules);
  next.config.wager.winnerRule = tpl.rules.some((r) => r.key === tpl.winnerRule) ? tpl.winnerRule : next.config.wager.winnerRule;
  const laid = applyEpisodeLayout(next, tpl.layout, actor).season;
  return { season: laid, audit: [ev(season, actor, "season", season.id, "APPLY_TEMPLATE", undefined, { rules: tpl.rules.length, layout: tpl.layout })] };
}

/** Which phases a rule can be scored in, for display. */
export const rulePhases = (r: ScoringRule): Phase[] =>
  phases.filter((p) => (r.inputType === "choice" ? (r.options ?? []).some((o) => optionPoints(o, p) !== null) : r.inputType === "manual" ? true : r.points[p] !== null));
