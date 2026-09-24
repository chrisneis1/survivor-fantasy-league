// Headless whole-season stress simulation with an independent scoring oracle (dev tool, not used by the site).
// Usage: npx tsx scripts/simulate-season.mts <seed> <ownershipCap> <tribeRestrictedSlots 0|1> <skipPercent>
import survivor50 from "../src/data/seasons/survivor-50.json";
import type { DraftRow, Season } from "../src/domain/types";
import { availability, buildPickQueue, effectiveRoster, isActiveAt, latestPublished, standings, teamEpisodeScore, currentTribeId } from "../src/domain/engine";
import { closePickWindow, currentTurn, endTurn, makeOpeningPick, makeReplacement, openOpeningSelection, openPickWindow, openWindow, openingTurn, replaceableSlots, replacementCheck, windowBlock } from "../src/domain/picks";
import { publishEpisode, saveDraft } from "../src/domain/scoring";
import { createSeason, finalizeSeason } from "../src/domain/setup";
import { findWinner, openWagers, wagerProblem } from "../src/domain/wager";

const [seedArg, capArg, restrictedArg, skipArg] = process.argv.slice(2);
let rs = (Number(seedArg ?? 1) * 2654435761) >>> 0;
const rnd = () => (rs = (rs * 1664525 + 1013904223) >>> 0) / 2 ** 32;
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
const shuffle = <T,>(a: T[]) => a.map((x) => [rnd(), x] as const).sort((p, q) => p[0] - q[0]).map((p) => p[1]);
const cap = Number(capArg ?? 3), restricted = restrictedArg === "1", skipPct = Number(skipArg ?? 25) / 100;
const at = "2026-03-01T00:00:00.000Z", ref = survivor50 as unknown as Season;
const problems: string[] = [];
const bad = (m: string) => { problems.push(m); };

let s = createSeason(ref, "sim", "Sim");
s.tribes = [{ id: "ta", name: "A", color: "#e00" }, { id: "tb", name: "B", color: "#00e" }, { id: "tm", name: "Merged", color: "#0a0" }];
const names = Array.from({ length: 21 }, (_, i) => `c${i + 1}`);
s.castaways = names.map((id, i) => ({ id, name: id, initialTribeId: i < 10 ? "ta" : "tb", order: i + 1 }));
s.teams = Array.from({ length: 15 }, (_, i) => ({ id: `t${i + 1}`, member: `T${i + 1}`, name: `T${i + 1}`, draft: ["", "", ""] }));
s.slots = restricted
  ? [{ id: "s1", name: "A slot", restrictionTribeId: "ta", enforceOnSwap: true }, { id: "s2", name: "B slot", restrictionTribeId: "tb", enforceOnSwap: true }, { id: "s3", name: "Wild", restrictionTribeId: null, enforceOnSwap: false }]
  : [1, 2, 3].map((n) => ({ id: `s${n}`, name: `Wild ${n}`, restrictionTribeId: null, enforceOnSwap: false }));
s.config.openingSeed = s.teams.map((t) => t.id);
s.config.openingRoundMode = "SNAKE";
s.config.ownershipCap = cap;
s.episodes.forEach((e) => { if (e.number === 1) e.excludeFromStandings = true; });

s = openOpeningSelection(s, "sim").season;
let guard = 0;
while (s.status === "OPENING_SELECTION" && guard++ < 200) {
  const turn = openingTurn(s)!;
  const team = s.teams.find((t) => t.id === turn.teamId)!;
  const slot = team.draft.findIndex((d) => !d);
  let done = false;
  for (const c of shuffle(s.castaways.map((x) => x.id))) { try { s = makeOpeningPick(s, team.id, slot, c, "sim", at).season; done = true; break; } catch { /* next */ } }
  if (!done) { bad(`draft stuck at turn ${turn.index}: no legal pick for ${team.id} slot ${slot}`); break; }
}
if (s.status !== "ACTIVE") { console.log("DRAFT FAILED", problems); process.exit(1); }

const points: Record<number, Record<string, number>> = {};
const myRoster: Record<string, string[]> = Object.fromEntries(s.teams.map((t) => [t.id, [...t.draft]]));
const original: Record<string, string[]> = Object.fromEntries(s.teams.map((t) => [t.id, [...t.draft]]));
const rosterAtEp: Record<number, Record<string, string[]>> = {};
const alive = new Set(names);
const tribeOf: Record<string, string> = Object.fromEntries(s.castaways.map((c) => [c.id, c.initialTribeId]));
const elimSchedule: Record<number, number> = { 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 7: 2, 8: 1, 9: 1, 10: 1, 11: 1, 12: 1, 13: 1 };
let windows = 0, picksMade = 0, passes = 0, blockedWindows = 0, openSlotTeamsMax = 0, openAtEnd = 0;
const winnerRule = s.config.wager.winnerRule;
const wagers: { team: string; castaway: string; stake: number }[] = [];

for (const ep of s.episodes) {
  const n = ep.number;
  const rows: DraftRow[] = [];
  points[n] = {};
  const act = [...alive];
  for (const c of act) {
    const inputs: any = {};
    if (rnd() < 0.3) inputs.reward = { on: true };
    if (rnd() < 0.15) inputs.extra = { points: Math.floor(rnd() * 5) + 1, note: "sim" };
    rows.push({ castaway: c, inputs });
  }
  if (n === 3) for (const r of rows) if (rnd() < 0.5) r.tribe = tribeOf[r.castaway] === "ta" ? "tb" : "ta";
  if (n === 6) for (const r of rows) r.tribe = "tm";
  const out = shuffle(act).slice(0, Math.min(elimSchedule[n] ?? 0, alive.size - 3));
  for (const o of out) rows.find((r) => r.castaway === o)!.exit = { type: "VOTED_OUT" };
  if (n === s.episodes.length) { const w = pick(act); rows.find((r) => r.castaway === w)!.inputs[winnerRule] = { on: true }; }
  try { s = publishEpisode(saveDraft(s, { episode: n, rows }, at), n, "sim").season; } catch (e) { bad(`ep${n} publish: ${(e as Error).message}`); break; }
  for (const r of rows) if (r.tribe) tribeOf[r.castaway] = r.tribe;
  for (const o of out) alive.delete(o);
  for (const sc of s.scores.filter((x) => x.episode === n)) points[n][sc.castaway] = sc.entries.reduce((a, e) => a + e.points, 0);
  for (const c of names) if (currentTribeId(s, c, n) !== tribeOf[c]) bad(`ep${n}: tribe of ${c} is ${currentTribeId(s, c, n)} expected ${tribeOf[c]}`);
  if (n === 1) {
    s = openWagers(s, "sim").season;
    for (const t of s.teams) if (rnd() < 0.7) { const c = pick([...alive]); const st = 1 + Math.floor(rnd() * 30); const p = wagerProblem(s, c, st); if (p) bad(`wager problem ${p}`); else wagers.push({ team: t.id, castaway: c, stake: st }); }
    if (s.wagerState !== "OPEN") bad("wager not open after ep1");
  }
  if (n === 2 && s.wagerState !== "LOCKED") bad("wager not auto-locked after ep2");
  if (n >= 2 && wagerProblem(s, pick([...alive]), 5) == null) bad(`wager still placeable after ep${n}`);
  rosterAtEp[n] = Object.fromEntries(s.teams.map((t) => [t.id, [...myRoster[t.id]]]));
  for (const t of s.teams) {
    const rost = ep.rosterPolicy === "ORIGINAL_DRAFT" ? original[t.id] : rosterAtEp[n][t.id];
    const exp = ep.excludeFromStandings ? 0 : rost.reduce((a, c) => a + (points[n][c] ?? 0), 0);
    const got = teamEpisodeScore(s, t.id, n);
    if (exp !== got) bad(`ep${n} team ${t.id}: expected ${exp} got ${got}`);
  }
  const next = s.episodes.find((e) => e.number === n + 1);
  if (!next || next.rosterPolicy !== "EFFECTIVE") continue;
  const openTeams = s.teams.filter((t) => effectiveRoster(s, t.id, n + 1).some((c) => !isActiveAt(s, c, n + 1)));
  openSlotTeamsMax = Math.max(openSlotTeamsMax, openTeams.length);
  const canPick = (t: string) => replaceableSlots(s, t, n + 1).some((sl) => s.castaways.some((c) => replacementCheck(s, t, sl, c.id, n + 1).ok));
  const block = windowBlock(s, n);
  if (block) {
    blockedWindows++;
    if (openTeams.some((t) => canPick(t.id))) bad(`ep${n}: window blocked ("${block}") but someone has a legal pick`);
    continue;
  }
  const q = buildPickQueue(s, n);
  const lost = (id: string) => effectiveRoster(s, id, n).some((c) => c && isActiveAt(s, c, n) && !isActiveAt(s, c, n + 1));
  const stand = new Map(standings(s, n).map((r) => [r.teamId, r.total]));
  for (let i = 1; i < q.length; i++) {
    const a = q[i - 1], b = q[i];
    if (lost(a.teamId) === lost(b.teamId)) { if (stand.get(a.teamId)! > stand.get(b.teamId)!) bad(`ep${n} queue points order ${a.teamId}>${b.teamId}`); }
    else if (!lost(a.teamId)) bad(`ep${n} queue: leftover before loser`);
  }
  for (const e of q) if (e.openSlots > 0 && canPick(e.teamId) && !e.eligible) bad(`ep${n}: ${e.teamId} has legal pick but queue marks ineligible`);
  s = openPickWindow(s, n, at, "sim").season; windows++;
  let g2 = 0;
  while (openWindow(s) && g2++ < 400) {
    const t = currentTurn(openWindow(s)!)!.teamId;
    if (rnd() < skipPct) { s = endTurn(s, t, "sim", at, { skipped: true }).season; passes++; continue; }
    for (let inner = 0; inner < 5; inner++) {
      let did = false;
      for (const sl of shuffle(replaceableSlots(s, t, n + 1))) {
        for (const c of shuffle(s.castaways)) {
          if (replacementCheck(s, t, sl, c.id, n + 1).ok) { s = makeReplacement(s, t, sl, c.id, "sim", at).season; picksMade++; myRoster[t][sl] = c.id; did = true; break; }
        }
        if (did) break;
      }
      if (!did || !openWindow(s) || currentTurn(openWindow(s)!)?.teamId !== t) break;
      if (rnd() < 0.3) break;
    }
    if (openWindow(s) && currentTurn(openWindow(s)!)?.teamId === t) { s = endTurn(s, t, "sim", at).season; passes++; }
  }
  if (openWindow(s)) { bad(`ep${n}: window never closed`); s = closePickWindow(s, "sim", at).season; }
  for (const a of availability(s, n + 1)) if (a.active && a.owners > cap) bad(`ep${n} window: ${a.castaway.id} owners ${a.owners} > cap`);
  for (const t of s.teams) { const er = effectiveRoster(s, t.id, n + 1); if (er.join() !== myRoster[t.id].join()) bad(`ep${n} roster mismatch ${t.id}: ${er} vs ${myRoster[t.id]}`); }
}
openAtEnd = s.teams.filter((t) => effectiveRoster(s, t.id, 14).some((c) => !isActiveAt(s, c, 14))).length;

for (const r of standings(s)) {
  let exp = 0;
  for (const ep of s.episodes) {
    const rost = ep.rosterPolicy === "ORIGINAL_DRAFT" ? original[r.teamId] : rosterAtEp[ep.number]?.[r.teamId];
    if (!rost || ep.excludeFromStandings) continue;
    exp += rost.reduce((a, c) => a + (points[ep.number]?.[c] ?? 0), 0);
  }
  if (exp !== r.total) bad(`final total ${r.teamId}: expected ${exp} got ${r.total}`);
}
try {
  const winner = findWinner(s);
  const fin = finalizeSeason(s, "sim", wagers);
  for (const w of fin.season.wagers) { const e = wagers.find((x) => x.team === w.team); if (!e) continue; const exp = e.castaway === winner ? e.stake : -e.stake; if (w.points !== exp) bad(`wager ${w.team}: ${w.points} vs ${exp}`); }
  if (fin.season.status !== "ARCHIVED") bad("not archived");
} catch (e) { bad(`finalize: ${(e as Error).message}`); }

console.log(JSON.stringify({ seed: seedArg, cap, restricted, windows, blockedWindows, picksMade, passes, openSlotTeamsMax, teamsWithOpenSlotAtFinale: openAtEnd, alive: alive.size, nproblems: problems.length, problems: problems.slice(0, 6) }));
