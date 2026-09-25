// Season data shape. Everything season-specific lives in data, never in engine code (guide §1.1).

export type Phase = "pre-merge" | "post-merge" | "finale";
export type RosterPolicy = "EFFECTIVE" | "ORIGINAL_DRAFT" | "SNAPSHOT_AS_OF";
export type StatusType = "VOTED_OUT" | "MEDICAL_EVACUATION" | "QUIT" | "OTHER_EXIT";
export type PickTieRule = "OPENING_SEED_REVERSE";

export interface Tribe {
  id: string;
  name: string;
  color: string;
}

export interface RosterSlot {
  id: string;
  name: string;
  /** Opening-selection restriction; null means any castaway (the "Wild" slot). */
  restrictionTribeId: string | null;
  enforceOnSwap: boolean;
}

export interface Episode {
  id: string;
  number: number;
  title: string;
  phase: Phase;
  /** SCHEDULED: no scoring yet. SCORING: commissioner has saved provisional work. PUBLISHED: official. */
  state: EpisodeState;
  rosterPolicy: RosterPolicy;
  /** Required when rosterPolicy is SNAPSHOT_AS_OF. */
  rosterPolicySourceEpisode?: number;
  /**
   * True for an episode that is scored (castaway performance, exits, tribes) but never contributes to any team's
   * total — a premiere aired before the draft happens, for example. Publishing it skips the season-must-be-ACTIVE
   * and complete-roster checks, since no team has a roster yet; it stays zero for every team permanently, not just
   * until rosters exist, so a later draft or edit can never retroactively make it start counting.
   */
  excludeFromStandings?: boolean;
}

export type EpisodeState = "SCHEDULED" | "SCORING" | "PUBLISHED";
export type InputType = "boolean" | "quantity" | "choice" | "manual";

/** One selectable outcome of a "choice" rule, e.g. a tiered challenge placement. */
export interface RuleOption {
  label: string;
  /** A fixed value, or a value per phase. */
  points: number | Partial<Record<Phase, number>>;
}

export interface ScoringRule {
  key: string;
  name: string;
  category: string;
  inputType: InputType;
  /** Point value by phase; null where the rule does not apply. */
  points: Record<Phase, number | null>;
  /** Only for inputType "choice". */
  options?: RuleOption[];
  /** Hidden from the scoring grid but kept, so scores already entered for it still read correctly. */
  retired?: boolean;
  note: string;
}

export interface Castaway {
  id: string;
  name: string;
  initialTribeId: string;
  order: number;
}

export interface Team {
  id: string;
  member: string;
  name: string;
  /** Opening roster, one castaway id per slot in slot order. */
  draft: string[];
}

export interface ScoreEntry {
  rule: string;
  quantity?: number;
  /** Required for manual adjustments and corrections. */
  note?: string;
  /** Resolved points, retained so history stays explainable if later seasons change values. */
  points: number;
}

export interface CastawayEpisodeScore {
  episode: number;
  castaway: string;
  entries: ScoreEntry[];
}

export interface TribeSwapEvent {
  castaway: string;
  /** Effective from this episode onward. */
  episode: number;
  tribeId: string;
}

export interface Transaction {
  id: string;
  team: string;
  slot: number;
  out: string;
  in: string;
  /** The pick window opened after this episode's results were published. */
  windowAfterEpisode: number;
  effectiveEpisode: number;
  /** Position in the recorded pick order for the whole season. */
  order?: number;
  date?: string;
  free?: boolean;
  note?: string;
  /** Points the team gave up for making this swap, taken off its score in the effective episode (archived seasons). */
  cost?: number;
  /** When the pick was made (ISO); archived picks only have `date`. */
  at?: string;
  by?: string;
}

export interface StatusEvent {
  castaway: string;
  /** The castaway is unavailable from the episode after this one. */
  afterEpisode: number;
  type: StatusType;
  note?: string;
}

export interface Wager {
  team: string;
  castaway: string | null;
  points: number;
  pointsAfterWager: number;
  rankAfterWager: number;
  /** What the member staked. Absent on seasons imported from before stakes were recorded. */
  stake?: number;
}

export type WagerState = "OFF" | "OPEN" | "LOCKED";

/** How a final wager is scored (guide §6.3). A correct pick pays stake × correctMultiplier; a wrong one loses stake × wrongMultiplier. */
export interface WagerConfig {
  minStake: number;
  /** The most points a member may wager. */
  maxStake: number;
  correctMultiplier: number;
  wrongMultiplier: number;
  /** The scoring rule whose entry marks the season's winner. */
  winnerRule: string;
  /** Wagering closes for good once this episode is published (default 2). */
  lockAtEpisode?: number;
}

export interface SeasonConfig {
  timezone: string;
  visibility: "PUBLIC_READ" | "PRIVATE";
  ownershipCap: number;
  swapCreditLimit: number | null;
  openingSeedMethod: "RANDOM_DRAW" | "MANUAL_LIST";
  pickOrderTieRule: PickTieRule;
  /** Team ids in opening pick order. */
  openingSeed: string[];
  /** Later opening rounds run in the same order (FIXED) or reversed each round (SNAKE). */
  openingRoundMode: "FIXED" | "SNAKE";
  /** Exit types whose replacement costs no swap credit. */
  freeReplacementStatuses: StatusType[];
  wager: WagerConfig;
}

export interface Season {
  id: string;
  name: string;
  status: "SETUP" | "OPENING_SELECTION" | "ACTIVE" | "ARCHIVED";
  config: SeasonConfig;
  tribes: Tribe[];
  slots: RosterSlot[];
  episodes: Episode[];
  rules: ScoringRule[];
  castaways: Castaway[];
  teams: Team[];
  scores: CastawayEpisodeScore[];
  transactions: Transaction[];
  statusEvents: StatusEvent[];
  /** Tribe swaps, effective from the episode recorded. Empty means everyone is still on their starting tribe. */
  tribeSwaps: TribeSwapEvent[];
  /** Results, filled in only when the season is finalized. Individual picks stay private until then. */
  wagers: Wager[];
  /** OFF: no wager this season. OPEN: members can place or change theirs. LOCKED: no more changes. */
  wagerState: WagerState;
  /** Opening selection history (guide §5.1). */
  opening: { picks: OpeningPick[] };
  /** Weekly pick windows, each with its saved queue (guide §5.2). */
  windows: PickWindow[];
  /** Provisional commissioner work; never shown as official (guide §8.1). */
  drafts: EpisodeDraft[];
  /** Post-publication score corrections, oldest first. */
  corrections: Correction[];
  /** Set on seasons imported into the archive from an old spreadsheet. */
  archive?: SeasonArchive;
  /** The source workbook's own numbers, kept only as a regression fixture. */
  reference: {
    teamWeek: number[][];
    totals: Record<string, number>;
    ranks: Record<string, number>;
    rosters: string[][][];
  };
}

/** Where an archived season's record came from, and what its spreadsheet couldn't keep. */
export interface SeasonArchive {
  /** Plain-language notes shown on the season's pages. */
  notes: string[];
  /**
   * Each team's official score per episode (in episode order), for sheets that kept team totals but not who was on
   * each roster week to week. When present, team scores come from here instead of from rosters.
   */
  teamScores?: Record<string, number[]>;
  /** The sheet kept only each team's final picks: `team.draft` holds those, and who owned whom week to week is unknown. */
  finalRostersOnly?: boolean;
}

// ---------- derived views ----------

export interface StandingRow {
  teamId: string;
  total: number;
  /** Shared competition rank: 1, 2, 2, 4. */
  rank: number;
  tied: boolean;
  episodeScores: number[];
  latest: number;
  /** Positive = climbed since the prior published episode. */
  movement: number | null;
}

export type QueueStatus = "WAITING" | "UP_NOW" | "COMPLETED" | "PASSED" | "AUTO_SKIPPED";

export interface QueueEntry {
  sequence: number;
  teamId: string;
  pointsAtOpen: number;
  rankAtOpen: number;
  eligible: boolean;
  /** Replaceable slots at window open. */
  openSlots: number;
  skipReason?: string;
}

export interface Availability {
  castaway: Castaway;
  active: boolean;
  owners: number;
  capacityLeft: number;
  /** Why this castaway cannot be selected league-wide; undefined when selectable. */
  blockedReason?: string;
}

// ---------- commissioner scoring ----------

/** What the commissioner entered for one castaway and one rule. */
export interface RuleInput {
  on?: boolean;
  quantity?: number;
  /** Index into the rule's options. */
  option?: number;
  /** Signed points for manual rules. */
  points?: number;
  note?: string;
}

export interface DraftRow {
  castaway: string;
  inputs: Record<string, RuleInput>;
  exit?: { type: StatusType; note?: string };
  /** The tribe currently checked for this castaway in the grid. */
  tribe?: string;
}

export interface EpisodeDraft {
  episode: number;
  rows: DraftRow[];
  savedAt: string;
  /** Who saved it: a commissioner's actor id, or the weekly auto-scorer. Absent on drafts saved before this was kept. */
  savedBy?: string;
  /** Notes for the commissioner's review (the auto-scorer's sources and anything to double-check). */
  note?: string;
}

export interface Correction {
  id: string;
  episode: number;
  castaway: string;
  rule: string;
  before: number;
  after: number;
  reason: string;
  actor: string;
  at: string;
}

export interface AuditEvent {
  seasonId: string;
  actor: string;
  entityType: string;
  entityId: string;
  action: string;
  before?: unknown;
  after?: unknown;
  reason?: string;
}

// ---------- picking ----------

export interface OpeningPick {
  team: string;
  slot: number;
  castaway: string;
  /** 1-based round. */
  round: number;
  at: string;
  by: string;
}

export interface PickTurn {
  sequence: number;
  teamId: string;
  pointsAtOpen: number;
  rankAtOpen: number;
  openSlots: number;
  eligible: boolean;
  status: QueueStatus;
  picks: number;
  startedAt?: string;
  completedAt?: string;
  skipReason?: string;
}

export interface PickWindow {
  id: string;
  /** Opened after this episode was published; picks take effect the episode after. */
  afterEpisode: number;
  status: "OPEN" | "CLOSED";
  openedAt: string;
  closedAt?: string;
  /** Opened and closed by the commissioner. Picks have no time limit. */
  /** The queue as it stood when the window opened. Never re-sorted (guide §5.2). */
  turns: PickTurn[];
}
