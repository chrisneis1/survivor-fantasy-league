"use server";
// Commissioner and member actions. Each one re-checks authorization on the server, validates with the domain
// rules, and writes through the versioned store together with its audit rows.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { closePickWindow, currentTurn, endTurn, makeOpeningPick, makeReplacement, openOpeningSelection, openPickWindow, openWindow, openingTurn } from "@/domain/picks";
import { correctEpisode, correctScore, publishEpisode, saveDraft, statusTypes } from "@/domain/scoring";
import { createSeason, finalizeSeason, renameTeam, slug, updateCastaway, validTimezone } from "@/domain/setup";
import { addRule, applyEpisodeLayout, applyRosterLayout, applyTemplate, parseOptions, removeRule, setRuleRetired, templateFrom, updateRule, type RuleForm } from "@/domain/template";
import type { AuditEvent, DraftRow, InputType, Phase, RosterPolicy, RuleInput, Season, StatusType } from "@/domain/types";
import { lockWagers, openWagers, wagerProblem } from "@/domain/wager";
import { type Access, getMember, requireAccess, requireAdmin, signIn, signInUser, signOut, signOutUser, signUp } from "./auth";
import { store } from "./index";
import { ConflictError } from "./store";

export interface ActionState {
  ok?: string;
  error?: string;
}

interface Mutation {
  season: Season;
  audit?: AuditEvent[];
  message: string;
}

interface Ctx {
  actor: string;
  /** The team a signed-in member acts for (both an ordinary member and a member holding the commissioner role). */
  team?: string;
}

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const num = (fd: FormData, k: string) => {
  const v = str(fd, k);
  return v === "" ? null : Number(v);
};
const change = (s: Season, actor: string, entityType: string, entityId: string, action: string, before?: unknown, after?: unknown, reason?: string): AuditEvent => ({
  seasonId: s.id,
  actor,
  entityType,
  entityId,
  action,
  before,
  after,
  reason,
});

/**
 * Load, apply a domain change, save with a version check. Authorization is decided here on the server: the admin
 * login, a member holding the commissioner role for this season, or (role "member") the signed-in member's own team,
 * taken from their session cookie, never from the form. A lost race is retried against fresh state, so a member who
 * just missed the last ownership slot gets the real reason instead of a vague conflict.
 */
async function mutate(seasonId: string, fn: (s: Season, at: string, ctx: Ctx) => Mutation, role: "commissioner" | "member" = "commissioner"): Promise<ActionState> {
  let ctx: Ctx;
  if (role === "commissioner") {
    const access = await requireAccess(seasonId);
    ctx = { actor: access.actor, team: access.kind === "commissioner" ? access.team : undefined };
  } else {
    const team = await getMember(seasonId);
    if (!team) return { error: "Open your personal invite link to make picks." };
    ctx = { actor: `member:${team}`, team };
  }
  for (let attempt = 0; ; attempt++) {
    try {
      const cur = await store().get(seasonId);
      if (!cur) return { error: "That season no longer exists." };
      const m = fn(structuredClone(cur.season), new Date().toISOString(), ctx);
      await store().save(m.season, cur.version, m.audit ?? []);
      revalidatePath("/", "layout");
      return { ok: m.message };
    } catch (e) {
      if (e instanceof ConflictError && attempt < 2) continue;
      return { error: e instanceof Error ? e.message : "Something went wrong." };
    }
  }
}

const needSetup = (s: Season) => {
  if (s.status !== "SETUP") throw new Error("This can only be changed while the season is in setup.");
};

// ---------- sign in ----------

export async function signInAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const r = await signIn(String(fd.get("password") ?? ""));
  if (!r.ok) return { error: r.error };
  redirect("/admin");
}

export async function signOutAction() {
  await signOut();
  redirect("/");
}

// ---------- roles (admin login only) ----------

/** Gives or takes away the commissioner role for a team. Only the admin login can do this. */
export async function setCommissionerAction(_: ActionState, fd: FormData) {
  await requireAdmin();
  const seasonId = str(fd, "seasonId");
  const teamId = str(fd, "teamId");
  const on = str(fd, "on") === "true";
  const cur = await store().get(seasonId);
  const team = cur?.season.teams.find((t) => t.id === teamId);
  if (!cur || !team) return { error: "Unknown team." };
  await store().setCommissioner(seasonId, teamId, on);
  await store().logAudit([change(cur.season, "admin", "role", teamId, on ? "GRANT_COMMISSIONER" : "REVOKE_COMMISSIONER", undefined, { member: team.member })]);
  revalidatePath("/", "layout");
  return { ok: on ? `${team.member} can now run this season from their own link.` : `${team.member} no longer has commissioner access.` };
}

// ---------- season lifecycle ----------

/** Creating a season is admin-only: roles are per season, so a season needs to exist before anyone can be given one. */
export async function createSeasonAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const access = await requireAdmin();
  const name = str(fd, "name");
  const id = slug(name);
  if (!id) return { error: "Give the season a name." };
  let created = false;
  try {
    const from = str(fd, "copyFrom");
    let season: Season;
    if (from.startsWith("tpl:")) {
      const tpl = await store().getTemplate(from.slice(4));
      if (!tpl) return { error: "That template no longer exists." };
      season = applyTemplate(createSeason(null, id, name), tpl, access.actor).season;
    } else {
      const prev = from ? (await store().get(from))?.season ?? null : null;
      season = createSeason(prev, id, name);
    }
    await store().create(season, [change(season, access.actor, "season", id, "CREATE", undefined, { name, copiedFrom: from || null })]);
    revalidatePath("/", "layout");
    created = true;
  } catch (e) {
    return { error: /UNIQUE|PRIMARY/i.test(String(e)) ? "A season with that name already exists." : e instanceof Error ? e.message : "Could not create the season." };
  }
  if (created) redirect(`/admin/${id}/setup`);
  return {};
}

/**
 * Permanently deletes a season: the season document, its audit log, member logins, roles and wagers. Admin-only,
 * like creating one. The commissioner must type the season's exact name, since nothing about this can be undone.
 */
export async function deleteSeasonAction(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const seasonId = str(fd, "seasonId");
  const cur = await store().get(seasonId);
  if (!cur) return { error: "That season no longer exists." };
  if (str(fd, "confirmName") !== cur.season.name) return { error: "Type the season's exact name to confirm." };
  await store().deleteSeason(seasonId);
  revalidatePath("/", "layout");
  redirect("/admin");
}

/** Finalizing is the reveal: it is the one place every secret wager is read, and the results are written into the season. */
export async function finalizeSeasonAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const seasonId = str(fd, "seasonId");
  const access = await requireAccess(seasonId);
  try {
    const cur = await store().get(seasonId);
    if (!cur) return { error: "That season no longer exists." };
    const picks = cur.season.wagerState === "LOCKED" ? await store().revealWagers(seasonId) : [];
    const r = finalizeSeason(structuredClone(cur.season), access.actor, picks);
    await store().save(r.season, cur.version, r.audit);
    revalidatePath("/", "layout");
    return { ok: cur.season.wagerState === "LOCKED" ? "Season finalized. The wagers are revealed." : "Season finalized and archived." };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Something went wrong." };
  }
}

// ---------- setup: basics ----------

export async function updateBasicsAction(_: ActionState, fd: FormData) {
  return mutate(str(fd, "seasonId"), (s, _at, ctx) => {
    needSetup(s);
    const before = { name: s.name, ...s.config };
    const name = str(fd, "name");
    const tz = str(fd, "timezone");
    const cap = num(fd, "ownershipCap");
    const swaps = num(fd, "swapCreditLimit");
    if (!name) throw new Error("The season needs a name.");
    if (!validTimezone(tz)) throw new Error(`"${tz}" is not a valid timezone (try America/Los_Angeles).`);
    if (cap === null || !Number.isInteger(cap) || cap < 1) throw new Error("The ownership cap must be a whole number, 1 or more.");
    if (swaps !== null && (!Number.isInteger(swaps) || swaps < 0)) throw new Error("Swap credits must be a whole number, 0 or more (or blank for no limit).");
    s.name = name;
    s.config.timezone = tz;
    s.config.ownershipCap = cap;
    s.config.swapCreditLimit = swaps;
    s.config.visibility = str(fd, "visibility") === "PRIVATE" ? "PRIVATE" : "PUBLIC_READ";
    s.config.openingRoundMode = "SNAKE"; // the league drafts one pick at a time, reversing the order each round
    const winnerRule = str(fd, "winnerRule");
    if (winnerRule) {
      if (!s.rules.some((r) => r.key === winnerRule && !r.retired && r.inputType === "boolean")) throw new Error("Choose an on/off rule (like Sole Survivor) to mark the season winner.");
      s.config.wager.winnerRule = winnerRule;
    }
    s.config.freeReplacementStatuses = statusTypes.filter((t) => fd.get(`free_${t}`) === "on");
    const minStake = num(fd, "minStake");
    const maxStake = num(fd, "maxStake");
    if (minStake === null || maxStake === null || !Number.isInteger(minStake) || !Number.isInteger(maxStake) || minStake < 1 || maxStake < minStake) throw new Error("Wager stakes must be whole numbers, with the maximum at least the minimum.");
    s.config.wager = { ...s.config.wager, minStake, maxStake };
    return { season: s, audit: [change(s, ctx.actor, "season", s.id, "UPDATE_BASICS", before, { name, ...s.config })], message: "Basics saved." };
  });
}

// ---------- setup: tribes, slots, cast ----------

export async function addTribeAction(_: ActionState, fd: FormData) {
  return mutate(str(fd, "seasonId"), (s, _at, ctx) => {
    needSetup(s);
    const name = str(fd, "name");
    const color = str(fd, "color") || "#888888";
    if (!name) throw new Error("Give the tribe a name.");
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw new Error("Colour must look like #1fb5b0.");
    const id = slug(name);
    if (s.tribes.some((t) => t.id === id)) throw new Error("That tribe already exists.");
    s.tribes.push({ id, name, color });
    return { season: s, audit: [change(s, ctx.actor, "tribe", id, "ADD", undefined, { name, color })], message: `Added tribe ${name}.` };
  });
}

export async function removeTribeAction(_: ActionState, fd: FormData) {
  return mutate(str(fd, "seasonId"), (s, _at, ctx) => {
    needSetup(s);
    const id = str(fd, "tribeId");
    if (s.castaways.some((c) => c.initialTribeId === id)) throw new Error("Move or remove that tribe's castaways first.");
    if (s.slots.some((sl) => sl.restrictionTribeId === id)) throw new Error("A roster slot is restricted to that tribe. Change the slot first.");
    s.tribes = s.tribes.filter((t) => t.id !== id);
    return { season: s, audit: [change(s, ctx.actor, "tribe", id, "REMOVE")], message: "Tribe removed." };
  });
}

export async function addSlotAction(_: ActionState, fd: FormData) {
  return mutate(str(fd, "seasonId"), (s, _at, ctx) => {
    needSetup(s);
    const name = str(fd, "name");
    const restriction = str(fd, "restriction") || null;
    if (!name) throw new Error("Give the slot a name.");
    if (restriction && !s.tribes.some((t) => t.id === restriction)) throw new Error("Unknown tribe.");
    s.slots.push({ id: `slot${s.slots.length + 1}`, name, restrictionTribeId: restriction, enforceOnSwap: false });
    for (const t of s.teams) t.draft.push("");
    return { season: s, audit: [change(s, ctx.actor, "slot", name, "ADD", undefined, { name, restriction })], message: `Added the ${name} slot.` };
  });
}

export async function removeSlotAction(_: ActionState, fd: FormData) {
  return mutate(str(fd, "seasonId"), (s, _at, ctx) => {
    needSetup(s);
    const i = Number(str(fd, "index"));
    if (!Number.isInteger(i) || !s.slots[i]) throw new Error("Unknown slot.");
    if (s.slots.length === 1) throw new Error("A season needs at least one roster slot.");
    const [gone] = s.slots.splice(i, 1);
    for (const t of s.teams) t.draft.splice(i, 1);
    return { season: s, audit: [change(s, ctx.actor, "slot", gone.name, "REMOVE")], message: `Removed the ${gone.name} slot.` };
  });
}

export async function addCastawayAction(_: ActionState, fd: FormData) {
  return mutate(str(fd, "seasonId"), (s, _at, ctx) => {
    needSetup(s);
    const name = str(fd, "name");
    const tribe = str(fd, "tribe");
    if (!name) throw new Error("Give the castaway a name.");
    if (!s.tribes.some((t) => t.id === tribe)) throw new Error("Choose a tribe.");
    const id = slug(name);
    if (s.castaways.some((c) => c.id === id)) throw new Error("A castaway with that name already exists. Add a last initial to tell them apart.");
    s.castaways.push({ id, name, initialTribeId: tribe, order: s.castaways.length + 1 });
    return { season: s, audit: [change(s, ctx.actor, "castaway", id, "ADD", undefined, { name, tribe })], message: `Added ${name}.` };
  });
}

export async function updateCastawayAction(_: ActionState, fd: FormData) {
  return mutate(str(fd, "seasonId"), (s, _at, ctx) => {
    const r = updateCastaway(s, str(fd, "castawayId"), { name: str(fd, "name"), tribe: str(fd, "tribe") }, ctx.actor);
    return { ...r, message: "Castaway saved." };
  });
}

export async function removeCastawayAction(_: ActionState, fd: FormData) {
  return mutate(str(fd, "seasonId"), (s, _at, ctx) => {
    needSetup(s);
    const id = str(fd, "castawayId");
    if (s.teams.some((t) => t.draft.includes(id))) throw new Error("That castaway is on a team's roster. Change the roster first.");
    s.castaways = s.castaways.filter((c) => c.id !== id).map((c, i) => ({ ...c, order: i + 1 }));
    return { season: s, audit: [change(s, ctx.actor, "castaway", id, "REMOVE")], message: "Castaway removed." };
  });
}

// ---------- setup: teams, seed, opening rosters ----------

/**
 * Adds a team for a registered account and links the two in the same step — the commissioner picks who's playing
 * from everyone who has signed up, rather than typing a name and separately assigning an account to it later.
 */
export async function addTeamFromUserAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const seasonId = str(fd, "seasonId");
  const userId = str(fd, "userId");
  const user = (await store().listUsers()).find((u) => u.id === userId);
  if (!user) return { error: "Unknown account." };
  const id = slug(user.username);
  const r = await mutate(seasonId, (s, _at, ctx) => {
    needSetup(s);
    if (s.teams.some((t) => t.id === id)) throw new Error(`${user.username} is already in this season.`);
    s.teams.push({ id, member: user.username, name: `${user.username}'s Team`, draft: s.slots.map(() => "") });
    s.config.openingSeed.push(id);
    return { season: s, audit: [change(s, ctx.actor, "team", id, "ADD", undefined, { member: user.username })], message: `Added ${user.username}.` };
  });
  if (r.error) return r;
  await store().assignUser(seasonId, id, userId);
  return r;
}

export async function removeTeamAction(_: ActionState, fd: FormData) {
  const seasonId = str(fd, "seasonId");
  const teamId = str(fd, "teamId");
  const r = await mutate(seasonId, (s, _at, ctx) => {
    needSetup(s);
    s.teams = s.teams.filter((t) => t.id !== teamId);
    s.config.openingSeed = s.config.openingSeed.filter((t) => t !== teamId);
    return { season: s, audit: [change(s, ctx.actor, "team", teamId, "REMOVE")], message: "Team removed." };
  });
  if (!r.error) await store().unassignUser(seasonId, teamId);
  return r;
}

/** The commissioner can rename any team, any time before the season is archived — not just during setup. */
export async function renameTeamAction(_: ActionState, fd: FormData) {
  return mutate(str(fd, "seasonId"), (s, _at, ctx) => {
    const r = renameTeam(s, str(fd, "teamId"), str(fd, "name"), ctx.actor);
    return { ...r, message: "Team renamed." };
  });
}

export async function saveSeedAction(_: ActionState, fd: FormData) {
  return mutate(str(fd, "seasonId"), (s, _at, ctx) => {
    needSetup(s);
    const pos = s.teams.map((t) => ({ id: t.id, p: Number(str(fd, `pos_${t.id}`)) }));
    const seen = new Set(pos.map((x) => x.p));
    if (pos.some((x) => !Number.isInteger(x.p) || x.p < 1 || x.p > pos.length) || seen.size !== pos.length) throw new Error(`Give each team a different position from 1 to ${pos.length}.`);
    const before = s.config.openingSeed;
    s.config.openingSeed = pos.sort((a, b) => a.p - b.p).map((x) => x.id);
    s.config.openingSeedMethod = "MANUAL_LIST";
    return { season: s, audit: [change(s, ctx.actor, "season", s.id, "SET_OPENING_SEED", before, s.config.openingSeed)], message: "Opening order saved." };
  });
}

// ---------- setup: episodes and scoring values ----------

const phases: Phase[] = ["pre-merge", "post-merge", "finale"];
const policies: RosterPolicy[] = ["EFFECTIVE", "ORIGINAL_DRAFT", "SNAPSHOT_AS_OF"];

function readEpisode(fd: FormData) {
  const phase = str(fd, "phase") as Phase;
  const rosterPolicy = str(fd, "rosterPolicy") as RosterPolicy;
  const title = str(fd, "title");
  const source = num(fd, "source");
  const excludeFromStandings = str(fd, "excludeFromStandings") === "on";
  if (!phases.includes(phase)) throw new Error("Choose a phase.");
  if (!policies.includes(rosterPolicy)) throw new Error("Choose a roster policy.");
  return { phase, rosterPolicy, title, source: rosterPolicy === "SNAPSHOT_AS_OF" && source ? source : undefined, excludeFromStandings };
}

export async function addEpisodeAction(_: ActionState, fd: FormData) {
  return mutate(str(fd, "seasonId"), (s, _at, ctx) => {
    if (s.status === "ARCHIVED") throw new Error("An archived season is read-only.");
    const e = readEpisode(fd);
    const number = s.episodes.length + 1;
    s.episodes.push({ id: `e${number}`, number, title: e.title || `Episode ${number}`, phase: e.phase, state: "SCHEDULED", rosterPolicy: e.rosterPolicy, ...(e.source ? { rosterPolicySourceEpisode: e.source } : {}), ...(e.excludeFromStandings ? { excludeFromStandings: true } : {}) });
    return { season: s, audit: [change(s, ctx.actor, "episode", String(number), "ADD", undefined, e)], message: `Added episode ${number}.` };
  });
}

export async function updateEpisodeAction(_: ActionState, fd: FormData) {
  return mutate(str(fd, "seasonId"), (s, _at, ctx) => {
    const ep = s.episodes.find((e) => e.number === Number(str(fd, "number")));
    if (!ep) throw new Error("Unknown episode.");
    if (ep.state === "PUBLISHED") throw new Error("A published episode's phase and roster policy are locked. Use a correction for scores.");
    const before = { ...ep };
    const e = readEpisode(fd);
    if (e.rosterPolicy === "SNAPSHOT_AS_OF" && (!e.source || e.source >= ep.number)) throw new Error("SNAPSHOT_AS_OF needs an earlier source episode number.");
    ep.title = e.title || ep.title;
    ep.phase = e.phase;
    ep.rosterPolicy = e.rosterPolicy;
    if (e.source) ep.rosterPolicySourceEpisode = e.source;
    else delete ep.rosterPolicySourceEpisode;
    if (e.excludeFromStandings) ep.excludeFromStandings = true;
    else delete ep.excludeFromStandings;
    return { season: s, audit: [change(s, ctx.actor, "episode", String(ep.number), "UPDATE", before, ep)], message: `Episode ${ep.number} saved.` };
  });
}

export async function removeLastEpisodeAction(_: ActionState, fd: FormData) {
  return mutate(str(fd, "seasonId"), (s, _at, ctx) => {
    const last = s.episodes.at(-1);
    if (!last) throw new Error("There are no episodes.");
    if (last.state !== "SCHEDULED") throw new Error("Only an unscored episode can be removed.");
    s.episodes.pop();
    return { season: s, audit: [change(s, ctx.actor, "episode", String(last.number), "REMOVE")], message: `Removed episode ${last.number}.` };
  });
}

// ---------- scoring ----------

const isStatus = (v: unknown): v is StatusType => statusTypes.includes(v as StatusType);

/** The grid is sent from the browser, so coerce and drop anything that is not a well-formed input. */
function cleanRows(s: Season, rows: DraftRow[]): DraftRow[] {
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
    const exit = r.exit && isStatus(r.exit.type) ? { type: r.exit.type, ...(r.exit.note?.trim() ? { note: r.exit.note.trim().slice(0, 300) } : {}) } : undefined;
    const tribe = typeof r.tribe === "string" && s.tribes.some((t) => t.id === r.tribe) ? r.tribe : undefined;
    if (Object.keys(inputs).length || exit || tribe) out.push({ castaway: r.castaway, inputs, ...(exit ? { exit } : {}), ...(tribe ? { tribe } : {}) });
  }
  return out;
}

export async function saveScoringAction(seasonId: string, episode: number, rows: DraftRow[]): Promise<ActionState> {
  return mutate(seasonId, (s, at) => ({ season: saveDraft(s, { episode, rows: cleanRows(s, rows) }, at), message: "Progress saved. Standings are unchanged until you publish." }));
}

export async function publishEpisodeAction(seasonId: string, episode: number, rows: DraftRow[]): Promise<ActionState> {
  return mutate(seasonId, (s, at, ctx) => {
    const saved = saveDraft(s, { episode, rows: cleanRows(s, rows) }, at);
    const r = publishEpisode(saved, episode, ctx.actor);
    return { ...r, message: `Episode ${episode} published. Standings are updated.` };
  });
}

export async function correctScoreAction(_: ActionState, fd: FormData) {
  return mutate(str(fd, "seasonId"), (s, at, ctx) => {
    const points = num(fd, "points");
    if (points === null) throw new Error("Enter the corrected points (0 removes the entry).");
    const r = correctScore(s, { episode: Number(str(fd, "episode")), castaway: str(fd, "castaway"), rule: str(fd, "rule"), points, reason: str(fd, "reason") }, ctx.actor, at);
    return { ...r, message: "Correction recorded. Standings are recalculated." };
  });
}

/**
 * Edits a published episode's scoring from the same grid used to score it, instead of one field at a time. Every
 * changed value becomes its own correction record under one shared reason; standings are recalculated immediately.
 */
export async function editScoringAction(seasonId: string, episode: number, rows: DraftRow[], touched: string[], reason: string): Promise<ActionState> {
  return mutate(seasonId, (s, at, ctx) => {
    const cleanTouched = Array.isArray(touched) ? touched.filter((t) => typeof t === "string") : [];
    const cleaned = cleanRows(s, rows);
    // cleanRows drops a row entirely once it has no valid input and no exit — but a touched cell that resolves to
    // "clear this value" (an unchecked box, an emptied field) is exactly that: it must still reach correctEpisode
    // as an empty row, not disappear, or the removal it asked for would silently be skipped.
    const byId = new Map(cleaned.map((r) => [r.castaway, r]));
    for (const key of cleanTouched) {
      const castawayId = key.slice(0, key.lastIndexOf(":"));
      if (byId.has(castawayId)) continue;
      const original = rows.find((r) => r.castaway === castawayId);
      const exit = original?.exit && isStatus(original.exit.type) ? { type: original.exit.type, ...(original.exit.note?.trim() ? { note: original.exit.note.trim().slice(0, 300) } : {}) } : undefined;
      const tribe = typeof original?.tribe === "string" && s.tribes.some((t) => t.id === original.tribe) ? original.tribe : undefined;
      if (original) byId.set(castawayId, { castaway: castawayId, inputs: {}, ...(exit ? { exit } : {}), ...(tribe ? { tribe } : {}) });
    }
    const r = correctEpisode(s, { episode, rows: [...byId.values()], touched: cleanTouched, reason }, ctx.actor, at);
    return { ...r, message: `Saved ${r.changes} ${r.changes === 1 ? "change" : "changes"}. Standings are recalculated.` };
  });
}

// ---------- opening selection & pick windows ----------

/** Launches the draft: teams and pick order lock in, and the commissioner lands on the draft board to run it. */
export async function openOpeningSelectionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const seasonId = str(fd, "seasonId");
  const r = await mutate(seasonId, (s, _at, ctx) => {
    const res = openOpeningSelection(s, ctx.actor);
    return { ...res, message: "The draft is open." };
  });
  if (r.error) return r;
  redirect(`/admin/${seasonId}/draft`);
}

/**
 * The commissioner makes every opening-draft pick from the draft board, live off whatever order they set —
 * no reason needed, since this is the ordinary way the whole opening draft is entered, not an occasional
 * stand-in for someone who can't get to the site.
 */
export async function adminOpeningPickAction(seasonId: string, teamId: string, slot: number, castaway: string): Promise<ActionState> {
  return mutate(seasonId, (s, at, ctx) => {
    const turn = openingTurn(s);
    if (!turn || turn.teamId !== teamId) throw new Error("It isn't this team's turn to pick.");
    const r = makeOpeningPick(s, teamId, intOf(slot), String(castaway), ctx.actor, at);
    return { ...r, message: "Pick recorded." };
  });
}

export async function openWindowAction(_: ActionState, fd: FormData) {
  return mutate(str(fd, "seasonId"), (s, at, ctx) => {
    const r = openPickWindow(s, Number(str(fd, "afterEpisode")), at, ctx.actor);
    return { ...r, message: "Pick window opened. The queue is saved in reverse standings order." };
  });
}

export async function closeWindowAction(_: ActionState, fd: FormData) {
  return mutate(str(fd, "seasonId"), (s, at, ctx) => {
    const r = closePickWindow(s, ctx.actor, at, str(fd, "reason") || undefined);
    return { ...r, message: "Pick window closed." };
  });
}

export async function skipTurnAction(_: ActionState, fd: FormData) {
  return mutate(str(fd, "seasonId"), (s, at, ctx) => {
    const w = openWindow(s);
    const turn = w && currentTurn(w);
    if (!turn) throw new Error("Nobody is up right now.");
    const r = endTurn(s, turn.teamId, ctx.actor, at, { skipped: true, reason: str(fd, "reason") || undefined });
    return { ...r, message: "Turn skipped. The next team is up." };
  });
}

// ---------- site-wide accounts ----------

/** Self-serve sign-up. Grants no season access by itself — a commissioner assigns the new account to a team. */
export async function signUpAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const r = await signUp(str(fd, "username"), str(fd, "password"));
  if (!r.ok) return { error: r.error };
  redirect(str(fd, "next") || "/");
}

export async function userSignInAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const r = await signInUser(str(fd, "username"), str(fd, "password"));
  if (!r.ok) return { error: r.error };
  redirect(str(fd, "next") || "/");
}

export async function userSignOutAction() {
  await signOutUser();
  redirect("/");
}

/** Admin-only: flags or unflags a user account as a site admin. */
export async function setUserAdminAction(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const userId = str(fd, "userId");
  const on = str(fd, "on") === "true";
  await store().setUserAdmin(userId, on);
  revalidatePath("/", "layout");
  return { ok: on ? "Granted site admin." : "Site admin removed." };
}

/** Assigns an existing account to run a team for this season, replacing whoever held it. */
export async function assignUserAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const seasonId = str(fd, "seasonId");
  const access = await requireAccess(seasonId);
  const teamId = str(fd, "teamId");
  const cur = await store().get(seasonId);
  const team = cur?.season.teams.find((t) => t.id === teamId);
  if (!cur || !team) return { error: "Unknown team." };
  const username = str(fd, "username").trim();
  if (!username) return { error: "Give a username to assign." };
  const users = await store().listUsers();
  const user = users.find((u) => u.username.toLowerCase() === username.toLowerCase());
  if (!user) return { error: `No account named "${username}". Ask them to sign up first.` };
  await store().assignUser(seasonId, teamId, user.id);
  await store().logAudit([change(cur.season, access.actor, "membership", teamId, "ASSIGN_USER", undefined, { username: user.username })]);
  return { ok: `${user.username} now runs ${team.member}'s team.` };
}

export async function unassignUserAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const seasonId = str(fd, "seasonId");
  const access = await requireAccess(seasonId);
  const teamId = str(fd, "teamId");
  const cur = await store().get(seasonId);
  const team = cur?.season.teams.find((t) => t.id === teamId);
  if (!cur || !team) return { error: "Unknown team." };
  await store().unassignUser(seasonId, teamId);
  await store().logAudit([change(cur.season, access.actor, "membership", teamId, "UNASSIGN_USER")]);
  return { ok: `${team.member}'s team is unassigned.` };
}

// ---------- member picks ----------

const intOf = (v: unknown) => (typeof v === "number" && Number.isInteger(v) ? v : NaN);

export async function openingPickAction(seasonId: string, slot: number, castaway: string): Promise<ActionState> {
  return mutate(
    seasonId,
    (s, at, ctx) => {
      const r = makeOpeningPick(s, ctx.team!, intOf(slot), String(castaway), ctx.actor, at);
      return { ...r, message: "Pick locked in." };
    },
    "member",
  );
}

export async function replacementAction(seasonId: string, slot: number, castaway: string): Promise<ActionState> {
  return mutate(
    seasonId,
    (s, at, ctx) => {
      const r = makeReplacement(s, ctx.team!, intOf(slot), String(castaway), ctx.actor, at);
      return { ...r, message: "Replacement made." };
    },
    "member",
  );
}

export async function endTurnAction(seasonId: string): Promise<ActionState> {
  return mutate(
    seasonId,
    (s, at, ctx) => {
      const r = endTurn(s, ctx.team!, ctx.actor, at);
      return { ...r, message: "Turn finished. The next team is up." };
    },
    "member",
  );
}

/** A member renames their own team, whenever they get around to it — no rush, no gate on season phase. */
export async function renameMyTeamAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return mutate(
    str(fd, "seasonId"),
    (s, _at, ctx) => {
      const r = renameTeam(s, ctx.team!, str(fd, "name"), ctx.actor);
      return { ...r, message: "Team name saved." };
    },
    "member",
  );
}

// ---------- final wager ----------

export async function openWagersAction(_: ActionState, fd: FormData) {
  return mutate(str(fd, "seasonId"), (s, _at, ctx) => {
    const r = openWagers(s, ctx.actor);
    return { ...r, message: "Wagering is open. Members place their secret wager from My Team." };
  });
}

export async function lockWagersAction(_: ActionState, fd: FormData) {
  return mutate(str(fd, "seasonId"), (s, _at, ctx) => {
    const r = lockWagers(s, ctx.actor);
    return { ...r, message: "Wagering is locked. Picks stay secret until the season is finalized." };
  });
}

/**
 * A member places or changes their own secret wager. The team comes from the member's session, never from the form.
 * The rules are checked against the season as it is inside the write, and the pick is stored apart from the season.
 */
export async function placeWagerAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const seasonId = str(fd, "seasonId");
  const team = await getMember(seasonId);
  if (!team) return { error: "Open your personal invite link to place a wager." };
  const castaway = str(fd, "castaway");
  const stake = Number(str(fd, "stake"));
  try {
    await store().placeWager(seasonId, team, castaway, stake, (cur) => wagerProblem(cur, castaway, stake));
    revalidatePath("/", "layout");
    return { ok: "Wager saved. Only you can see it until the season ends." };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Something went wrong." };
  }
}

// ---------- scoring template, layout, draw ----------

const allPhases: Phase[] = ["pre-merge", "post-merge", "finale"];

function ruleFormFrom(fd: FormData, fallbackType?: InputType): RuleForm {
  const inputType = (str(fd, "inputType") || fallbackType || "boolean") as InputType;
  return {
    name: str(fd, "name"),
    category: str(fd, "category"),
    note: str(fd, "note"),
    inputType,
    points: Object.fromEntries(allPhases.map((p) => [p, num(fd, p)])) as RuleForm["points"],
    ...(inputType === "choice" ? { options: parseOptions(String(fd.get("options") ?? "")) } : {}),
  };
}

export async function addRuleAction(_: ActionState, fd: FormData) {
  return mutate(str(fd, "seasonId"), (s, _at, ctx) => {
    const r = addRule(s, ruleFormFrom(fd), ctx.actor);
    return { ...r, message: "Rule added." };
  });
}

export async function updateRuleAction(_: ActionState, fd: FormData) {
  return mutate(str(fd, "seasonId"), (s, _at, ctx) => {
    const key = str(fd, "rule");
    const existing = s.rules.find((r) => r.key === key);
    const r = updateRule(s, key, ruleFormFrom(fd, existing?.inputType), ctx.actor);
    return { ...r, message: "Rule saved. It applies to episodes scored from now on; published scores keep their points." };
  });
}

export async function removeRuleAction(_: ActionState, fd: FormData) {
  return mutate(str(fd, "seasonId"), (s, _at, ctx) => {
    const r = removeRule(s, str(fd, "rule"), ctx.actor);
    return { ...r, message: "Rule deleted." };
  });
}

export async function retireRuleAction(_: ActionState, fd: FormData) {
  return mutate(str(fd, "seasonId"), (s, _at, ctx) => {
    const retire = str(fd, "retire") === "true";
    const r = setRuleRetired(s, str(fd, "rule"), retire, ctx.actor);
    return { ...r, message: retire ? "Rule retired. It no longer appears in the scoring grid." : "Rule restored." };
  });
}

export async function applyEpisodeLayoutAction(_: ActionState, fd: FormData) {
  return mutate(str(fd, "seasonId"), (s, _at, ctx) => {
    const r = applyEpisodeLayout(s, { total: Number(str(fd, "total")), mergeAt: Number(str(fd, "mergeAt")), draftTail: Number(str(fd, "draftTail") || 0) }, ctx.actor);
    return { ...r, message: "Episodes laid out." };
  });
}

export async function applyRosterLayoutAction(_: ActionState, fd: FormData) {
  return mutate(str(fd, "seasonId"), (s, _at, ctx) => {
    const r = applyRosterLayout(s, { perTribe: Number(str(fd, "perTribe")), wild: Number(str(fd, "wild") || 0) }, ctx.actor);
    return { ...r, message: "Roster slots built." };
  });
}

export async function saveTemplateAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const seasonId = str(fd, "seasonId");
  const access = await requireAccess(seasonId);
  const name = str(fd, "name");
  const id = slug(name);
  if (!id) return { error: "Give the template a name." };
  try {
    const cur = await store().get(seasonId);
    if (!cur) return { error: "That season no longer exists." };
    await store().saveTemplate(id, name, templateFrom(cur.season));
    await store().logAudit([change(cur.season, access.actor, "template", id, "SAVE_TEMPLATE", undefined, { name })]);
    revalidatePath("/", "layout");
    return { ok: `Saved "${name}". New seasons can start from it.` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Something went wrong." };
  }
}

export async function applyTemplateAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const tpl = await store().getTemplate(str(fd, "template"));
  if (!tpl) return { error: "That template no longer exists." };
  return mutate(str(fd, "seasonId"), (s, _at, ctx) => {
    const r = applyTemplate(s, tpl, ctx.actor);
    return { ...r, message: "Template applied: the scoring rules and episode layout were replaced." };
  });
}

/** Templates are not scoped to one season, so only the admin login manages the shared list. */
export async function deleteTemplateAction(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  await store().deleteTemplate(str(fd, "template"));
  revalidatePath("/", "layout");
  return { ok: "Template deleted." };
}

export type { Access };
