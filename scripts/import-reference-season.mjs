// Imports the reference season workbook into the site's season JSON.
//   node scripts/import-reference-season.mjs "<path to Survivor 50.xlsx>"
// The output keeps the workbook's own cached totals under `reference` so the
// regression test can prove the rules engine reproduces them.
import { readFileSync, writeFileSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";

const src = process.argv[2] ?? "C:/Users/Cneis/Downloads/Survivor 50.xlsx";
const out = new URL("../src/data/seasons/survivor-50.json", import.meta.url);

// ---------- xlsx reading ----------
const files = unzipSync(new Uint8Array(readFileSync(src)));
const text = (p) => strFromU8(files[p]);
const unesc = (s) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

const sharedStrings = [...text("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
  unesc([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join("")),
);
const rels = Object.fromEntries(
  [...text("xl/_rels/workbook.xml.rels").matchAll(/<Relationship [^>]*?Id="([^"]+)"[^>]*?Target="([^"]+)"/g)].map((m) => [m[1], m[2]]),
);
const sheetPaths = Object.fromEntries(
  [...text("xl/workbook.xml").matchAll(/<sheet [^>]*?name="([^"]*)"[^>]*?r:id="([^"]+)"/g)].map((m) => [
    unesc(m[1]),
    "xl/" + rels[m[2]].replace(/^\/?(xl\/)?/, ""),
  ]),
);

const colIndex = (letters) => [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
const sheetCache = new Map();
/** Returns grid[row][colIndex] = string | number for a sheet name. */
function sheet(name) {
  if (sheetCache.has(name)) return sheetCache.get(name);
  const xml = text(sheetPaths[name]);
  const grid = {};
  for (const r of xml.matchAll(/<row [^>]*?r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const row = {};
    for (const c of r[2].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const type = (c[2].match(/t="(\w+)"/) ?? [])[1];
      const raw = ((c[3] ?? "").match(/<v>([\s\S]*?)<\/v>/) ?? [])[1];
      if (raw === undefined) continue;
      let v = unesc(raw);
      if (type === "s") v = sharedStrings[Number(v)];
      else if (type === "e") continue;
      else if (type !== "str" && type !== "b" && v !== "" && !Number.isNaN(Number(v))) v = Number(v);
      row[colIndex(c[1])] = v;
    }
    grid[Number(r[1])] = row;
  }
  sheetCache.set(name, grid);
  return grid;
}
const cell = (grid, row, col) => grid[row]?.[colIndex(col)];
const str = (v) => (typeof v === "string" ? v.trim() : v === undefined ? "" : String(v));

// ---------- names ----------
const alias = { Genieveve: "Genevieve", Stephanie: "Stephenie", Kamila: "Kamilla", Tiff: "Tiffany", Emily: "Emily" };
const canon = (n) => alias[str(n)] ?? str(n);
const slug = (n) => n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// ---------- tribes + castaways ----------
const tribeDefs = [
  { id: "cila", name: "Cila", color: "#e8752a" },
  { id: "kalo", name: "Kalo", color: "#1fb5b0" },
  { id: "vatu", name: "Vatu", color: "#b6459e" },
];
const contestants = sheet("Contestants");
const castNames = [];
let group = 0;
let gap = false;
for (let r = 2; r <= 40; r++) {
  const n = str(cell(contestants, r, "A"));
  if (!n) {
    if (castNames.length && !gap) group++;
    gap = true;
    continue;
  }
  gap = false;
  castNames.push({ name: canon(n), tribe: tribeDefs[group].id });
}
if (castNames.length !== 24) throw new Error(`expected 24 castaways, got ${castNames.length}`);
const castaways = castNames.map((c, i) => ({ id: slug(c.name), name: c.name, initialTribeId: c.tribe, order: i + 1 }));
const castIds = new Set(castaways.map((c) => c.id));
const castId = (n) => {
  const id = slug(canon(n));
  if (!castIds.has(id)) throw new Error(`unknown castaway "${n}"`);
  return id;
};

// ---------- members / teams / draft ----------
const main = sheet("Main Sheet");
const draft = sheet("Draft");
const slotNames = ["Wild", "Cila", "Kalo", "Vatu"];
const slotRestriction = [null, "cila", "kalo", "vatu"];
const teams = [];
for (let r = 2; r <= 15; r++) {
  const member = str(cell(main, r, "A"));
  let teamName = str(cell(main, r, "D"));
  if (teamName === "Team Name") teamName = `${member}'s Team`; // untouched template placeholder in the workbook
  const draftRow = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].find((dr) => str(cell(draft, dr, "F")) === member);
  teams.push({
    id: slug(member),
    member,
    name: teamName,
    cachedTotal: cell(main, r, "C"),
    cachedRank: cell(main, r, "B"),
    draft: ["G", "H", "I", "J"].map((c) => castId(cell(draft, draftRow, c))),
  });
}
// Draft column F lists the members in opening pick order.
const openingSeed = [];
for (let r = 2; r <= 15; r++) openingSeed.push(slug(str(cell(draft, r, "F"))));

// ---------- episodes + castaway scoring ----------
const episodeSheets = [...Array.from({ length: 13 }, (_, i) => `Week ${i + 1}`), "Finale"];
const baseColumns = { C: "reward", D: "teamImmunity", E: "individualImmunity", F: "findIdol", G: "activateIdol", H: "voteCorrect", I: "votedOut", J: "idolPlay", K: "journey", L: "shotInDark", M: "extra" };
const finaleColumns = { ...baseColumns, H: "final3", I: "winner", J: "fireWinner", L: "finalTribalVotes" };

const episodes = [];
const scores = []; // { episode, castaway, entries: [{rule, points}], total }
episodeSheets.forEach((sn, i) => {
  const g = sheet(sn);
  const finale = sn === "Finale";
  const cols = finale ? finaleColumns : baseColumns;
  const voteHeader = str(cell(g, 2, "H"));
  // The merge only happens once: a later sheet whose header still says "(2)" is a stale label (Week 7's data uses -8).
  const merged = episodes.some((e) => e.phase === "post-merge");
  const phase = finale ? "finale" : merged || /\(4\)/.test(voteHeader) ? "post-merge" : "pre-merge";
  episodes.push({ id: `e${i + 1}`, number: i + 1, title: sn, phase, state: "PUBLISHED", rosterPolicy: "EFFECTIVE" });
  for (let r = 3; r <= 40; r++) {
    const n = str(cell(g, r, "A"));
    const cachedTotal = cell(g, r, "B");
    if (!n || typeof cachedTotal !== "number" || !castIds.has(slug(canon(n)))) continue;
    const entries = [];
    for (const [col, rule] of Object.entries(cols)) {
      const v = cell(g, r, col);
      if (typeof v === "number" && v !== 0) entries.push({ rule, points: v });
    }
    const sum = entries.reduce((s, e) => s + e.points, 0);
    if (sum !== cachedTotal) console.warn(`! ${sn} ${n}: entries sum ${sum} != sheet total ${cachedTotal}`);
    scores.push({ episode: i + 1, castaway: castId(n), entries });
  }
});

// ---------- weekly rosters (Team Weekly, 37-row blocks) ----------
const tw = sheet("Team Weekly");
const memberIndex = Object.fromEntries(teams.map((t, i) => [t.member, i]));
const rosters = teams.map(() => []); // rosters[team][episodeIdx] = [castaway ids in slot order]
const reference = { teamWeek: teams.map(() => []), totals: {}, ranks: {}, rosters };
for (let w = 0; w < 14; w++) {
  const start = 1 + 37 * w;
  for (let t = 0; t < 14; t++) {
    const row = start + 1 + 2 * t;
    const member = str(cell(tw, row, "A"));
    if (!(member in memberIndex)) throw new Error(`Team Weekly week ${w + 1} row ${row}: unknown member "${member}"`);
    rosters[memberIndex[member]][w] = ["B", "C", "D", "E"].map((c) => castId(cell(tw, row, c)));
    reference.teamWeek[memberIndex[member]][w] = cell(tw, row, "F");
  }
}
teams.forEach((t) => {
  reference.totals[t.id] = t.cachedTotal;
  reference.ranks[t.id] = t.cachedRank;
});

// ---------- transactions (roster diffs) + swap log ----------
// From the first episode where every team is back on its opening roster (after earlier swaps), the
// workbook scores the original draft. That is the ORIGINAL_DRAFT roster policy, not a set of swaps.
const onDraft = (w) => teams.every((t, ti) => rosters[ti][w].every((c, s) => c === t.draft[s]));
let firstDraftEpisode = null;
for (let w = 1; w < 14 && firstDraftEpisode === null; w++) {
  if (onDraft(w) && !onDraft(w - 1)) firstDraftEpisode = w; // 0-based episode index
}
if (firstDraftEpisode !== null) {
  for (let w = firstDraftEpisode; w < 14; w++) {
    if (!onDraft(w)) throw new Error(`episode ${w + 1} leaves the original-draft policy`);
    episodes[w].rosterPolicy = "ORIGINAL_DRAFT";
  }
}
const lastEffective = firstDraftEpisode ?? 14;

const transactions = [];
teams.forEach((t, ti) => {
  for (let w = 1; w < lastEffective; w++) {
    rosters[ti][w].forEach((cid, slotIdx) => {
      const prev = rosters[ti][w - 1][slotIdx];
      if (cid !== prev)
        transactions.push({ team: t.id, slot: slotIdx, out: prev, in: cid, windowAfterEpisode: w, effectiveEpisode: w + 1 });
    });
  }
});

const logLines = [];
for (let r = 18; r <= 80; r++) {
  const v = str(cell(main, r, "L"));
  if (v) logLines.push(v);
}
let window = 0;
let order = 0;
const memberNames = teams.map((t) => t.member);
for (const line of logLines) {
  const wk = line.match(/^Week\s+(\d+)/i);
  if (wk) {
    window = Number(wk[1]);
    continue;
  }
  const m = line.match(/^(?:(\d+\/\d+)\s*-\s*)?(\w+)\s+(?:chooses|takes)\s+(.+?)(?:\s*\((.*)\))?\s*$/i);
  if (!m || !memberNames.includes(m[2])) {
    if (line !== "Swap Log") console.warn(`! unparsed swap-log line: "${line}"`);
    continue;
  }
  const [, date, member, picks, note] = m;
  for (const pick of picks.split(/\s+and\s+/i)) {
    const tx = transactions.find((x) => x.team === slug(member) && x.in === castId(pick) && x.windowAfterEpisode === window && x.order === undefined);
    if (!tx) {
      console.warn(`! swap log "${line}" (${pick}) has no matching roster change in window ${window}`);
      continue;
    }
    tx.order = ++order;
    if (date) tx.date = date;
    if (note) {
      tx.free = /free/i.test(note);
      tx.note = note;
    }
  }
}
for (const tx of transactions) if (tx.order === undefined) console.warn(`! roster change with no swap-log entry: ${JSON.stringify(tx)}`);
transactions.sort((a, b) => a.windowAfterEpisode - b.windowAfterEpisode || (a.order ?? 999) - (b.order ?? 999));
transactions.forEach((tx, i) => (tx.id = `tx${i + 1}`));

// ---------- castaway status events ----------
const statusEvents = [];
for (const s of scores) {
  if (s.entries.some((e) => e.rule === "votedOut" && e.points < 0)) statusEvents.push({ castaway: s.castaway, afterEpisode: s.episode, type: "VOTED_OUT" });
}
// Not recorded in the workbook's score columns; the swap log names it ("Free Pick due to Kyle Med Evac").
statusEvents.push({ castaway: "kyle", afterEpisode: 1, type: "MEDICAL_EVACUATION", note: "Miguel's replacement was a free pick" });

// ---------- final wager ----------
const fin = sheet("FINAL SCORE");
const wagers = [];
for (let r = 2; r <= 15; r++) {
  const member = str(cell(fin, r, "A"));
  const w = str(cell(fin, r, "E")).match(/^(.+?)\s*\(([+-]?\d+)\)$/);
  if (!w) continue;
  const points = Number(w[2]);
  wagers.push({
    team: slug(member),
    castaway: /^n\/a$/i.test(w[1]) ? null : castId(w[1]),
    points,
    pointsAfterWager: cell(fin, r, "D"),
    rankAfterWager: cell(fin, r, "F"),
  });
}

// ---------- scoring rule catalog (guide §6.2) ----------
// Outcomes for the "choice" rules, from the workbook's legend (guide §6.2).
const choiceOptions = {
  reward: [
    { label: "Won reward", points: { "pre-merge": 1, "post-merge": 2, finale: 2 } },
    { label: "Tiered: 1st", points: 2 },
    { label: "Tiered: 2nd", points: 1 },
  ],
  findIdol: [
    { label: "Found, needs activating", points: { "pre-merge": 1, "post-merge": 2, finale: 2 } },
    { label: "Found, ready to use", points: { "pre-merge": 2, "post-merge": 3, finale: 3 } },
  ],
  shotInDark: [
    { label: "Played", points: 1 },
    { label: "Played and successful", points: 6 },
  ],
};
const rules = [
  ["reward", "Reward challenge win", "Challenges", "choice", 1, 2, 2, "Tiered placement pays 2/1/0 pre-merge."],
  ["teamImmunity", "Team immunity win", "Challenges", "boolean", 2, 2, 2, "Every castaway on the winning team scores."],
  ["individualImmunity", "Individual immunity win", "Challenges", "boolean", null, 3, 3, ""],
  ["findIdol", "Find idol / advantage", "Idols & advantages", "choice", 1, 2, 2, "1 if it needs activating (2 if ready to use) pre-merge."],
  ["activateIdol", "Activate idol / advantage", "Idols & advantages", "boolean", 2, 2, 2, "May land in a later episode than the find."],
  ["voteCorrect", "Vote correctly", "Tribal", "quantity", 2, 4, 4, "Repeatable."],
  ["votedOut", "Voted out", "Tribal", "boolean", -5, -8, -8, ""],
  ["idolPlay", "Idol play saves a player", "Idols & advantages", "boolean", 4, 4, 4, "Also counts when saving an intended ally. Judgment note recommended."],
  ["journey", "Go on a journey", "Other", "boolean", 1, 1, 1, ""],
  ["shotInDark", "Shot in the Dark", "Idols & advantages", "choice", 1, 1, 1, "1 to play it; 5 more if it saves you (6 total)."],
  ["extra", "Manual adjustment", "Other", "manual", null, null, null, "Signed value with a required note. Covers bonuses and penalties such as: says the episode title +2, quit −5, medical evacuation −2, voted out holding an idol −2, given an idol +1, votes received −1 each."],
  ["final3", "Reach Final 3", "Finale", "boolean", null, null, 4, ""],
  ["winner", "Sole Survivor", "Finale", "boolean", null, null, 10, ""],
  ["fireWinner", "Fire-making win", "Finale", "boolean", null, null, 2, ""],
  ["finalTribalVotes", "Final Tribal vote received", "Finale", "quantity", null, null, 1, "Per vote."],
].map(([key, name, category, inputType, pre, post, finale, note]) => ({
  key,
  name,
  category,
  inputType,
  points: { "pre-merge": pre, "post-merge": post, finale },
  ...(choiceOptions[key] ? { options: choiceOptions[key] } : {}),
  note,
}));

const season = {
  id: "survivor-50",
  name: "Survivor 50",
  status: "ARCHIVED",
  config: {
    timezone: "America/Los_Angeles",
    visibility: "PUBLIC_READ",
    ownershipCap: 7, // highest owner count observed in the workbook; the cap itself wasn't recorded
    swapCreditLimit: null, // not recorded in the workbook
    openingSeedMethod: "MANUAL_LIST",
    pickOrderTieRule: "OPENING_SEED_REVERSE",
    openingSeed: openingSeed,
    openingRoundMode: "SNAKE",
    freeReplacementStatuses: ["MEDICAL_EVACUATION"],
    // Stakes and payouts weren't recorded in the workbook; up to 30 points wagered at a 1:1 payout (per the league); the minimum stake is a placeholder.
    wager: { minStake: 1, maxStake: 30, correctMultiplier: 1, wrongMultiplier: 1, winnerRule: "winner" },
  },
  tribes: tribeDefs,
  slots: slotNames.map((name, i) => ({ id: `slot${i + 1}`, name, restrictionTribeId: slotRestriction[i], enforceOnSwap: false })),
  episodes,
  rules,
  castaways,
  teams: teams.map(({ id, member, name, draft: d }) => ({ id, member, name, draft: d })),
  scores,
  transactions,
  statusEvents,
  tribeSwaps: [],
  wagers,
  wagerState: "LOCKED",
  opening: { picks: [] },
  windows: [],
  drafts: [],
  corrections: [],
  reference,
};

writeFileSync(out, JSON.stringify(season));
console.log(
  `wrote ${out.pathname}\n  ${castaways.length} castaways, ${teams.length} teams, ${episodes.length} episodes, ${scores.length} score rows, ${transactions.length} roster changes, ${statusEvents.length} status events`,
);
