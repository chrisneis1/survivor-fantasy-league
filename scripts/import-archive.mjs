// Imports past seasons' league workbooks into the site's season JSON, for the archive.
//   node scripts/import-archive.mjs <workbook.xlsx> [more.xlsx ...]
// The season number comes from the file name ("Survivor 47.xlsx" → survivor-47). Three layouts are recognised:
//   • Main Sheet + Team Weekly + Week N sheets (Survivor 47, 48): full history — weekly rosters, pick log and
//     per-rule castaway scores — so the rules engine recomputes every team score, checked against the sheet.
//   • Point Summary + Point Breakdown (Survivor 44, 45): per-rule castaway scores and each team's weekly total,
//     but not who was on each roster week to week, so team scores are kept as recorded.
//   • Sheet1 + Tribes (Survivor 43): each team's slot-by-slot weekly points plus a castaway sheet; team scores are
//     kept as recorded, with the fire-making bonus (+8, from the sheet's rules picture) that the rows left out.
// Whatever the sheet couldn't record is spelled out in `archive.notes`, which the season's pages show.
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { unzipSync, strFromU8 } from "fflate";

// ---------- xlsx reading ----------
const unesc = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#10;/g, "\n").replace(/&amp;/g, "&");
const colIndex = (letters) => [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
const colName = (n) => {
  let s = "";
  for (; n; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};
const str = (v) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : v === undefined ? "" : String(v));
const num = (v) => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v)) ? Number(v) : undefined);

function openWorkbook(path) {
  const files = unzipSync(new Uint8Array(readFileSync(path)));
  const text = (p) => (files[p] ? strFromU8(files[p]) : "");
  const relsOf = (p) =>
    Object.fromEntries([...text(p).matchAll(/<Relationship [^>]*?Id="([^"]+)"[^>]*?Target="([^"]+)"/g)].map((m) => [m[1], m[2]]));
  const shared = [...text("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    unesc([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join("")),
  );
  const wbRels = relsOf("xl/_rels/workbook.xml.rels");
  const paths = Object.fromEntries(
    [...text("xl/workbook.xml").matchAll(/<sheet [^>]*?name="([^"]*)"[^>]*?r:id="([^"]+)"/g)].map((m) => [unesc(m[1]), "xl/" + wbRels[m[2]].replace(/^\/?(xl\/)?/, "")]),
  );
  const cache = new Map();
  /** grid[row][col] = string | number (formula errors dropped). */
  const sheet = (name) => {
    if (!paths[name]) throw new Error(`${basename(path)}: no sheet "${name}"`);
    if (cache.has(name)) return cache.get(name);
    const grid = {};
    for (const r of text(paths[name]).matchAll(/<row [^>]*?r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
      const row = {};
      for (const c of r[2].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const type = (c[2].match(/t="(\w+)"/) ?? [])[1];
        let raw = ((c[3] ?? "").match(/<v>([\s\S]*?)<\/v>/) ?? [])[1];
        if (raw === undefined) raw = ((c[3] ?? "").match(/<t[^>]*>([\s\S]*?)<\/t>/) ?? [])[1];
        if (raw === undefined || type === "e") continue;
        let v = unesc(raw);
        if (type === "s") v = shared[Number(v)];
        else if (type !== "str" && type !== "inlineStr" && type !== "b" && v !== "" && !Number.isNaN(Number(v))) v = Number(v);
        row[colIndex(c[1])] = v;
      }
      grid[Number(r[1])] = row;
    }
    cache.set(name, grid);
    return grid;
  };
  /** Cell comments on a sheet: { "M12": "text" }. Threaded comments carry their text in a separate part. */
  const comments = (name) => {
    const p = paths[name];
    const rels = relsOf(p.replace(/worksheets\/(sheet\d+\.xml)$/, "worksheets/_rels/$1.rels"));
    const out = {};
    for (const target of Object.values(rels)) {
      const file = "xl/" + target.replace(/^(\.\.\/)+/, "").replace(/^\/?xl\//, "");
      if (/threadedComments/.test(file)) {
        for (const m of text(file).matchAll(/<threadedComment [^>]*ref="([A-Z]+\d+)"[^>]*>[\s\S]*?<text>([\s\S]*?)<\/text>/g)) out[m[1]] = str(unesc(m[2]));
      } else if (/comments\d*\.xml$/.test(file)) {
        for (const m of text(file).matchAll(/<comment [^>]*ref="([A-Z]+\d+)"[^>]*>([\s\S]*?)<\/comment>/g)) {
          const t = str(unesc([...m[2].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join("")));
          if (t && !/^\[Threaded comment\]/.test(t)) out[m[1]] ??= t;
        }
      }
    }
    return out;
  };
  return { names: Object.keys(paths), sheet, comments };
}
const cell = (grid, row, col) => grid[row]?.[typeof col === "number" ? col : colIndex(col)];

// ---------- shared helpers ----------
const slug = (n) => n.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
/** Excel date serial → "m/d", the same short form the pick log in Survivor 50 uses. */
const excelDate = (serial) => {
  const d = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
};
const phasePoints = (pre, post = pre, finale = post) => ({ "pre-merge": pre, "post-merge": post, finale });
const rule = (key, name, category, inputType, points, note = "", extra = {}) => ({ key, name, category, inputType, points, note, ...extra });

/** Names as a sheet wrote them → castaway ids; tolerant of stray spaces, case, aliases and unique prefixes ("Tee" → Teeny). */
function castLookup(castaways, alias = {}) {
  const byName = new Map(castaways.map((c) => [c.name.toLowerCase(), c.id]));
  return (raw, where = "") => {
    const n = str(raw);
    const a = alias[n] ?? n;
    const hit = byName.get(a.toLowerCase());
    if (hit) return hit;
    const pre = castaways.filter((c) => c.name.toLowerCase().startsWith(a.toLowerCase()) || a.toLowerCase().startsWith(c.name.toLowerCase()));
    if (pre.length === 1) return pre[0].id;
    throw new Error(`unknown castaway "${n}"${where ? ` (${where})` : ""}`);
  };
}

/** Tribe names aren't in every sheet; each is recognised by a castaway who started on it. */
function nameTribes(groups, defs, label) {
  return groups.map((names, i) => {
    const def = defs.find((d) => names.some((n) => n.toLowerCase() === d.anchor.toLowerCase()));
    if (!def) throw new Error(`${label}: can't tell which tribe group ${i + 1} (${names.join(", ")}) is`);
    return def;
  });
}

function baseSeason(number, extra) {
  return {
    id: `survivor-${number}`,
    name: `Survivor ${number}`,
    status: "ARCHIVED",
    config: {
      timezone: "America/Los_Angeles",
      visibility: "PUBLIC_READ",
      ownershipCap: 14,
      swapCreditLimit: null,
      openingSeedMethod: "MANUAL_LIST",
      pickOrderTieRule: "OPENING_SEED_REVERSE",
      openingSeed: [],
      openingRoundMode: "SNAKE",
      freeReplacementStatuses: ["MEDICAL_EVACUATION"],
      wager: { minStake: 1, maxStake: 30, correctMultiplier: 1, wrongMultiplier: 1, winnerRule: "winner" },
    },
    tribeSwaps: [],
    wagers: [],
    wagerState: "OFF",
    opening: { picks: [] },
    windows: [],
    drafts: [],
    corrections: [],
    transactions: [],
    ...extra,
  };
}

const episodeList = (count, phaseOf) =>
  Array.from({ length: count }, (_, i) => ({
    id: `e${i + 1}`,
    number: i + 1,
    title: i === count - 1 ? "Finale" : `Episode ${i + 1}`,
    phase: i === count - 1 ? "finale" : phaseOf(i + 1),
    state: "PUBLISHED",
    rosterPolicy: "EFFECTIVE",
  }));

/** Castaways gone before the finale: voted out where the sheet scores it, otherwise after their last scored episode. */
function exitsFrom(scores, castaways, episodes, votedOutRule) {
  const last = episodes.length;
  const events = [];
  for (const c of castaways) {
    const mine = scores.filter((s) => s.castaway === c.id);
    const vote = mine.find((s) => s.entries.some((e) => e.rule === votedOutRule && e.points < 0));
    if (vote) {
      events.push({ castaway: c.id, afterEpisode: vote.episode, type: "VOTED_OUT" });
      continue;
    }
    const seen = mine.filter((s) => s.entries.length).map((s) => s.episode);
    const lastSeen = seen.length ? Math.max(...seen) : 0;
    if (lastSeen < last - 1) events.push({ castaway: c.id, afterEpisode: Math.max(lastSeen, 1), type: "OTHER_EXIT", note: "Left the game; the sheet doesn't say how." });
  }
  return events;
}

const competitionRanks = (totals) => totals.map((t) => 1 + totals.filter((o) => o > t).length);

// ---------- layout 1: Main Sheet + Team Weekly (Survivor 47, 48) ----------
const TRIBES = {
  47: [
    { anchor: "Kyle", id: "tuku", name: "Tuku", color: "#2f6fd6" },
    { anchor: "Andy", id: "gata", name: "Gata", color: "#e0b31f" },
    { anchor: "Genevieve", id: "lavo", name: "Lavo", color: "#d6453d" },
  ],
  48: [
    { anchor: "Kyle", id: "civa", name: "Civa", color: "#2f6fd6" },
    { anchor: "Eva", id: "lagi", name: "Lagi", color: "#e0b31f" },
    { anchor: "Mary", id: "vula", name: "Vula", color: "#7a4bc9" },
  ],
  49: [
    { anchor: "Savannah", id: "uli", name: "Uli", color: "#d6453d" },
    { anchor: "Nicole", id: "kele", name: "Kele", color: "#2f6fd6" },
    { anchor: "Kristina", id: "hina", name: "Hina", color: "#e0b31f" },
  ],
  46: [
    // Siga (green) and Yanu (purple) are named with their colours in the workbook's cast sheet.
    { anchor: "Hunter", id: "nami", name: "Nami", color: "#e8752a" },
    { anchor: "Ben", id: "siga", name: "Siga", color: "#2fa35b" },
    { anchor: "Bhanu", id: "yanu", name: "Yanu", color: "#7a4bc9" },
  ],
  45: [
    { anchor: "Katurah", id: "belo", name: "Belo", color: "#2fa35b" },
    { anchor: "Emily", id: "lulu", name: "Lulu", color: "#e0b31f" },
    { anchor: "Austin", id: "reba", name: "Reba", color: "#2f6fd6" },
  ],
  44: [
    { anchor: "Carolyn", id: "tika", name: "Tika", color: "#7a4bc9" },
    { anchor: "Lauren", id: "ratu", name: "Ratu", color: "#d6453d" },
    { anchor: "Heidi", id: "soka", name: "Soka", color: "#2f6fd6" },
  ],
};
const ALIAS = { 47: { Tee: "Teeny", Solomon: "Sol" }, 48: { Kamila: "Kamilla", Stephenie: "Stephanie" } };

/** The Survivor 50-style catalog (Survivor 47 and 48 used the same sheet and scoring). */
const modernRules = () => [
  rule("reward", "Reward challenge win", "Challenges", "choice", phasePoints(1, 2, 2), "Tiered placement pays 2/1/0 pre-merge.", {
    options: [
      { label: "Won reward", points: phasePoints(1, 2, 2) },
      { label: "Tiered: 1st", points: 2 },
      { label: "Tiered: 2nd", points: 1 },
    ],
  }),
  rule("teamImmunity", "Team immunity win", "Challenges", "boolean", phasePoints(2), "Every castaway on the winning team scores."),
  rule("individualImmunity", "Individual immunity win", "Challenges", "boolean", phasePoints(null, 3, 3)),
  rule("findIdol", "Find idol / advantage", "Idols & advantages", "choice", phasePoints(1, 2, 2), "1 if it needs activating (2 if ready to use) pre-merge.", {
    options: [
      { label: "Found, needs activating", points: phasePoints(1, 2, 2) },
      { label: "Found, ready to use", points: phasePoints(2, 3, 3) },
    ],
  }),
  rule("activateIdol", "Activate idol / advantage", "Idols & advantages", "boolean", phasePoints(2), "May land in a later episode than the find."),
  rule("voteCorrect", "Vote correctly", "Tribal", "quantity", phasePoints(2, 4, 4), "Repeatable."),
  rule("votedOut", "Voted out", "Tribal", "boolean", phasePoints(-5, -8, -8)),
  rule("idolPlay", "Idol play saves a player", "Idols & advantages", "boolean", phasePoints(4), "Also counts when saving an intended ally."),
  rule("journey", "Go on a journey", "Other", "boolean", phasePoints(1)),
  rule("shotInDark", "Shot in the Dark", "Idols & advantages", "choice", phasePoints(1), "1 to play it; 5 more if it saves you (6 total).", {
    options: [
      { label: "Played", points: 1 },
      { label: "Played and successful", points: 6 },
    ],
  }),
  rule("extra", "Manual adjustment", "Other", "manual", phasePoints(null), "Signed value with a note: says the episode title +2, quit −5, medical evacuation −2, voted out holding an idol −2, given an idol +1, votes received −1 each."),
  rule("final3", "Reach Final 3", "Finale", "boolean", phasePoints(null, null, 4)),
  rule("winner", "Sole Survivor", "Finale", "boolean", phasePoints(null, null, 10)),
  rule("fireWinner", "Fire-making win", "Finale", "boolean", phasePoints(null, null, 2)),
  rule("finalTribalVotes", "Final Tribal vote received", "Finale", "quantity", phasePoints(null, null, 1), "Per vote."),
];

function importModern(wb, number) {
  const label = `Survivor ${number}`;
  const main = wb.sheet("Main Sheet");

  // Contestants: three groups (one per starting tribe) separated by blank rows.
  const cs = wb.sheet("Contestants");
  const groups = [[]];
  for (let r = 2; r <= 40; r++) {
    const n = str(cell(cs, r, "A"));
    if (n) groups.at(-1).push(n);
    else if (groups.at(-1).length) groups.push([]);
  }
  while (!groups.at(-1).length) groups.pop();
  const tribes = nameTribes(groups, TRIBES[number], label);
  const castaways = groups.flatMap((g, gi) => g.map((name) => ({ id: slug(name), name, initialTribeId: tribes[gi].id }))).map((c, i) => ({ ...c, order: i + 1 }));
  const castId = castLookup(castaways, ALIAS[number]);

  // Members, in sheet order, down to the first row without a name.
  const teams = [];
  for (let r = 2; str(cell(main, r, "A")); r++) {
    const member = str(cell(main, r, "A"));
    teams.push({ id: slug(member), member, name: str(cell(main, r, "D")) || `${member}'s Team`, total: num(cell(main, r, "C")), rank: num(cell(main, r, "B")) });
  }
  const teamOf = new Map(teams.map((t, i) => [t.member.toLowerCase(), i]));

  // Episodes and per-rule castaway scores, the same columns as Survivor 50's sheet.
  const sheets = [...Array.from({ length: 13 }, (_, i) => `Week ${i + 1}`), "Finale"].filter((n) => wb.names.includes(n));
  // Columns are found by header (one week's sheet has its Extra column one to the right).
  const headerRules = [
    [/^reward/i, "reward"],
    [/^team immunity/i, "teamImmunity"],
    [/^indiv/i, "individualImmunity"],
    [/^find idol/i, "findIdol"],
    [/^activate/i, "activateIdol"],
    [/^vote correctly/i, "voteCorrect"],
    [/^voted out/i, "votedOut"],
    [/idol play/i, "idolPlay"],
    [/^journey/i, "journey"],
    [/shot in the dark/i, "shotInDark"],
    [/^extra/i, "extra"],
    [/^final 3/i, "final3"],
    [/^winner/i, "winner"],
    [/^fire/i, "fireWinner"],
    [/^final tribal/i, "finalTribalVotes"],
  ];
  const columnsOf = (g) => {
    const cols = {};
    let end = 20;
    for (let c = 3; c <= 20; c++) {
      const h = str(cell(g, 2, c));
      if (/^bonuses/i.test(h)) end = c - 1; // the rules legend starts here
      const hit = headerRules.find(([re]) => re.test(h));
      if (hit) cols[colName(c)] = hit[1];
    }
    // A number in a column with no header of its own (one week's Extra values sit a column left of the header).
    for (let c = 3; c <= end; c++) cols[colName(c)] ??= "extra";
    return cols;
  };
  let merged = false;
  const episodes = [];
  const scores = [];
  sheets.forEach((sn, i) => {
    const g = wb.sheet(sn);
    const notes = wb.comments(sn);
    const finale = sn === "Finale";
    merged ||= /\(4\)/.test(str(cell(g, 2, "H")));
    episodes.push({ id: `e${i + 1}`, number: i + 1, title: sn, phase: finale ? "finale" : merged ? "post-merge" : "pre-merge", state: "PUBLISHED", rosterPolicy: "EFFECTIVE" });
    for (let r = 3; r <= 40; r++) {
      const n = str(cell(g, r, "A"));
      const total = num(cell(g, r, "B"));
      if (!n || total === undefined) continue;
      let id;
      try {
        id = castId(n, `${sn} row ${r}`);
      } catch {
        continue; // legend rows below the grid
      }
      const entries = [];
      for (const [col, key] of Object.entries(columnsOf(g))) {
        const v = num(cell(g, r, col));
        if (v) entries.push({ rule: key, points: v, ...(notes[`${col}${r}`] ? { note: notes[`${col}${r}`] } : {}) });
      }
      const sum = entries.reduce((s, e) => s + e.points, 0);
      if (sum !== total) console.warn(`! ${label} ${sn} ${n}: entries sum ${sum} != sheet total ${total}`);
      scores.push({ episode: i + 1, castaway: id, entries });
    }
  });

  // Weekly rosters: Team Weekly has one block per week headed "Week N" (the first block's header is blank),
  // two rows per team — member, then the four castaways in slot order (Wild, then one per starting tribe).
  const tw = wb.sheet("Team Weekly");
  const starts = [1];
  for (let r = 2; r <= 1000; r++) if (/^(Week \d+|Finale)$/.test(str(cell(tw, r, "A")))) starts.push(r);
  if (starts.length < episodes.length) throw new Error(`${label}: Team Weekly has ${starts.length} weekly blocks for ${episodes.length} episodes`);
  const rosters = teams.map(() => []);
  const teamWeek = teams.map(() => []);
  episodes.forEach((_, w) => {
    for (let r = starts[w] + 1; r < (starts[w + 1] ?? starts[w] + 60); r++) {
      const ti = teamOf.get(str(cell(tw, r, "A")).toLowerCase());
      if (ti === undefined) continue;
      rosters[ti][w] = ["B", "C", "D", "E"].map((c) => castId(cell(tw, r, c), `Team Weekly week ${w + 1}`));
      teamWeek[ti][w] = num(cell(tw, r, "F"));
    }
    teams.forEach((t, ti) => {
      if (!rosters[ti][w]) throw new Error(`${label}: no week ${w + 1} roster for ${t.member}`);
    });
  });
  const slotNames = ["Wild", ...tribes.map((t) => t.name)];
  const slots = slotNames.map((name, i) => ({ id: `slot${i + 1}`, name, restrictionTribeId: i ? tribes[i - 1].id : null, enforceOnSwap: false }));

  // Roster changes between consecutive weeks become transactions; the pick log supplies their dates and order.
  const transactions = [];
  teams.forEach((t, ti) => {
    for (let w = 1; w < episodes.length; w++)
      rosters[ti][w].forEach((cid, s) => {
        const prev = rosters[ti][w - 1][s];
        if (cid !== prev) transactions.push({ team: t.id, slot: s, out: prev, in: cid, windowAfterEpisode: w, effectiveEpisode: w + 1 });
      });
  });
  const log = [];
  let strayLog = 0;
  let logStart = null;
  for (let r = 1; r <= 200; r++) {
    const v = str(cell(main, r, "J"));
    if (/log/i.test(v)) logStart = r;
    else if (logStart && v) log.push({ row: r, line: v, serial: num(cell(main, r, "I")) });
  }
  const castName = new Map(castaways.map((c) => [c.id, c.name.toLowerCase()]));
  for (const entry of log) {
    // "Jon takes Kishan", "10/2 - Dalsin picks Rizo", "Christian swaps Andy for Tee" (names are sometimes cut short).
    const dated = entry.line.match(/^(\d{1,2})\/(\d{1,2})\s*-\s*(.+)$/);
    const line = dated ? dated[3] : entry.line;
    const m = line.match(/^(\w+)\s+(?:takes?|chooses|picks)\s+(.+?)\s*$/i) ?? line.match(/^(\w+)\s+swaps\s+.+?\s+for\s+(.+?)\s*$/i);
    const ti = m ? teamOf.get(m[1].toLowerCase()) : undefined;
    if (!m || ti === undefined) {
      console.warn(`! ${label}: unparsed pick-log line "${entry.line}"`);
      continue;
    }
    const said = (ALIAS[number]?.[m[2]] ?? m[2]).toLowerCase();
    const tx = transactions
      .filter((x) => x.team === teams[ti].id && x.logged === undefined && (castName.get(x.in).startsWith(said) || said.startsWith(`${castName.get(x.in)} `)))
      .sort((a, b) => a.windowAfterEpisode - b.windowAfterEpisode)[0];
    if (!tx) {
      console.warn(`! ${label}: pick log "${entry.line}" has no matching roster change`);
      strayLog++;
      continue;
    }
    entry.when = entry.serial ?? (dated ? Number(dated[1]) * 31 + Number(dated[2]) : undefined);
    tx.logged = entry;
    if (entry.serial) tx.date = excelDate(entry.serial);
    else if (dated) tx.date = `${Number(dated[1])}/${Number(dated[2])}`;
  }
  for (const tx of transactions) if (!tx.logged) console.warn(`! ${label}: roster change with no pick-log line: ${JSON.stringify(tx)}`);
  const unlogged = transactions.filter((tx) => !tx.logged).length;
  transactions.sort(
    (a, b) =>
      a.windowAfterEpisode - b.windowAfterEpisode ||
      (a.logged?.when ?? Infinity) - (b.logged?.when ?? Infinity) ||
      (a.logged?.row ?? Infinity) - (b.logged?.row ?? Infinity),
  );
  transactions.forEach((tx, i) => {
    delete tx.logged;
    tx.id = `tx${i + 1}`;
    tx.order = i + 1;
  });

  // Where a team's week differs from its castaways' points, the sheet charged for a voluntary swap made that week
  // (Survivor 47: "Christian swaps Andy for Tee", −2). It's kept as that swap's cost.
  const castPts = new Map(scores.map((x) => [`${x.castaway}:${x.episode}`, x.entries.reduce((a, e) => a + e.points, 0)]));
  teams.forEach((t, ti) =>
    episodes.forEach((e, w) => {
      const diff = teamWeek[ti][w] - rosters[ti][w].reduce((a, c) => a + (castPts.get(`${c}:${e.number}`) ?? 0), 0);
      if (!diff) return;
      const tx = transactions.find((x) => x.team === t.id && x.effectiveEpisode === e.number);
      if (tx && diff < 0) {
        tx.cost = -diff;
        tx.note = `Voluntary swap: cost ${-diff} point${diff === -1 ? "" : "s"}`;
      } else console.warn(`! ${label} ${t.member} ${e.title}: sheet says ${teamWeek[ti][w]}, castaways add up to ${teamWeek[ti][w] - diff}`);
    }),
  );

  // A final total above the weekly scores is a bonus for picking the winner, kept beside the base total the way final
  // wagers are. Survivor 49 has a Final Score sheet for it ("Final Winner Pick Correct (+5)"); in Survivor 47 it's
  // typed into the total's formula (the Future Bet: "choose anyone you think will win it all").
  const finalSheet = wb.names.includes("Final Score") ? wb.sheet("Final Score") : null;
  if (finalSheet)
    for (let r = 1; str(cell(finalSheet, r, "A")); r++) {
      const ti = teamOf.get(str(cell(finalSheet, r, "A")).toLowerCase());
      if (ti === undefined) continue;
      teams[ti].total = num(cell(finalSheet, r, "C"));
      teams[ti].rank = num(cell(finalSheet, r, "B"));
    }
  const soleSurvivor = scores.find((x) => x.episode === episodes.length && x.entries.some((e) => e.rule === "winner"))?.castaway ?? null;
  const wagers = [];
  teams.forEach((t, ti) => {
    const bonus = t.total - teamWeek[ti].reduce((a, b) => a + b, 0);
    if (bonus) wagers.push({ team: t.id, castaway: finalSheet && bonus > 0 ? soleSurvivor : null, points: bonus, pointsAfterWager: t.total, rankAfterWager: t.rank });
  });
  const betNotes = finalSheet
    ? wagers.length
      ? [`Final totals include +${wagers[0].points} for each member who correctly picked the winner (${wagers.map((w) => teams.find((t) => t.id === w.team).member).join(", ")}).`]
      : []
    : wagers.map((w) => `${teams.find((t) => t.id === w.team).member}'s final total includes ${w.points > 0 ? "+" : ""}${w.points} for the Future Bet (picking the winner); the sheet doesn't say who was picked.`);

  const owners = Math.max(...episodes.flatMap((_, w) => castaways.map((c) => rosters.filter((r) => r[w].includes(c.id)).length)));
  const draft = teams.map((_, ti) => rosters[ti][0]);
  return baseSeason(number, {
    config: { ...baseSeason(number).config, ownershipCap: owners, openingSeed: teams.map((t) => t.id) },
    tribes: tribes.map(({ id, name, color }) => ({ id, name, color })),
    slots,
    episodes,
    rules: modernRules(),
    castaways,
    teams: teams.map((t, ti) => ({ id: t.id, member: t.member, name: t.name, draft: draft[ti] })),
    scores,
    transactions,
    statusEvents: exitsFrom(scores, castaways, episodes, "votedOut"),
    wagers,
    wagerState: wagers.length ? "LOCKED" : "OFF",
    archive: {
      notes: [
        "Imported from the league's spreadsheet. Weekly rosters, pick-ups and every castaway's points are all from the sheet, and the team scores are recalculated from them.",
        "The sheet didn't record the opening draft order, the ownership cap or swap limits; tribe names and colours were filled in afterwards.",
        ...(unlogged || strayLog
          ? [`${unlogged} week-to-week roster change${unlogged === 1 ? "" : "s"} in the sheet ${unlogged === 1 ? "has" : "have"} no line in its pick log${strayLog ? ` (and ${strayLog} logged pick${strayLog === 1 ? " never shows" : "s never show"} up on a roster)` : ""}. Rosters are kept exactly as the sheet scored them.`]
          : []),
        ...betNotes,
      ],
    },
    reference: {
      teamWeek,
      totals: Object.fromEntries(teams.map((t) => [t.id, t.total])),
      ranks: Object.fromEntries(teams.map((t) => [t.id, t.rank])),
      rosters,
    },
  });
}

// ---------- layout 2: Point Summary + Point Breakdown (Survivor 44, 45) ----------
function shortNames(full) {
  const first = full.map((n) => {
    const nick = n.match(/[‘'"“]([^’'"”]+)[’'"”]/);
    if (nick) return nick[1];
    return n.replace(/^Dr\.?\s+/, "").split(" ")[0];
  });
  return first.map((f, i) => (first.filter((x) => x === f).length > 1 ? `${f} ${full[i].split(" ").at(-1)[0]}.` : f));
}

function importBreakdown(wb, number) {
  const label = `Survivor ${number}`;
  const sum = wb.sheet("Point Summary");
  const pb = wb.sheet("Point Breakdown");
  const notes = wb.comments("Point Breakdown");

  // Weekly blocks: a header row with "Owner" in B, then one row per castaway (A = how many teams owned them).
  const blocks = [];
  for (let r = 1; r <= 1000; r++) if (str(cell(pb, r, "B")) === "Owner") blocks.push(r);
  const headers = blocks.map((r) => Object.fromEntries(Array.from({ length: 12 }, (_, i) => [colName(i + 4), str(cell(pb, r, i + 4))])));
  const castRows = [];
  for (let r = blocks[0] + 1; r < blocks[1]; r++) {
    const n = str(cell(pb, r, "B"));
    if (n && n !== "Owner") castRows.push(n);
    else if (castRows.length && !n) castRows.push(null); // tribe break
  }
  const groups = [[]];
  for (const n of castRows) n ? groups.at(-1).push(n) : groups.at(-1).length && groups.push([]);
  while (!groups.at(-1).length) groups.pop();
  if (groups.length === 1) {
    // No blank rows between tribes: the breakdown lists them in three runs of equal size.
    const all = groups[0];
    const size = all.length / 3;
    groups.splice(0, 1, all.slice(0, size), all.slice(size, 2 * size), all.slice(2 * size));
  }
  const full = groups.flat();
  const names = shortNames(full);
  const tribes = nameTribes(groups.map((g) => g.map((n) => shortNames([n])[0])), TRIBES[number], label);
  let k = 0;
  const castaways = groups.flatMap((g, gi) => g.map(() => ({ name: names[k++], initialTribeId: tribes[gi].id })))
    .map((c, i) => ({ id: slug(c.name), name: c.name, initialTribeId: c.initialTribeId, order: i + 1 }));
  const byFull = new Map(full.map((f, i) => [f, castaways[i].id]));
  const castId = castLookup(castaways);
  const idFor = (raw) => byFull.get(str(raw)) ?? castId(raw);

  // Rules from the header text, e.g. "Reward +3 or +1 (2nd place)", "Voted Out -18", "Final 3 (+25)".
  const keyFor = (h) =>
    [
      [/^reward/i, "reward", "Reward challenge win", "Challenges"],
      [/^immunity/i, "immunity", "Immunity win", "Challenges"],
      [/^vote correctly/i, "voteCorrect", "Vote correctly", "Tribal"],
      [/^survive tribal/i, "surviveTribal", "Survive Tribal Council", "Tribal"],
      [/^use advantage/i, "useAdvantage", "Use an advantage", "Idols & advantages"],
      [/^use idol/i, "useIdol", "Play an idol", "Idols & advantages"],
      [/shot in the dark/i, "shotInDark", "Win Shot in the Dark", "Idols & advantages"],
      [/^voted out/i, "votedOut", "Voted out", "Tribal"],
      [/^voted against/i, "votedAgainst", "Vote cast against", "Tribal"],
      [/hidden advantage/i, "findAdvantage", "Find a hidden advantage", "Idols & advantages"],
      [/hidden immunity idol/i, "findIdol", "Find a hidden immunity idol", "Idols & advantages"],
      [/^fire/i, "fireWinner", "Fire-making win", "Finale"],
      [/^final 3/i, "final3", "Reach Final 3", "Finale"],
      [/^win\b/i, "winner", "Sole Survivor", "Finale"],
    ].find(([re]) => re.test(h));
  const valueOf = (h) => Number((h.match(/([+-]\d+)/) ?? [])[1]);
  // Castaway scores per block; the block's total column is the check.
  const scores = [];
  blocks.forEach((start, bi) => {
    const hdr = headers[bi];
    for (let r = start + 1; r < (blocks[bi + 1] ?? start + 40); r++) {
      const n = str(cell(pb, r, "B"));
      if (!n || n === "Owner") continue;
      let id;
      try {
        id = idFor(n);
      } catch {
        continue;
      }
      const entries = [];
      for (const [col, h] of Object.entries(hdr)) {
        const k = keyFor(h);
        const v = num(cell(pb, r, col));
        if (!k || !v) continue;
        entries.push({ rule: k[1], ...((k[1] === "voteCorrect" || k[1] === "votedAgainst") && valueOf(h) ? { quantity: v / valueOf(h) } : {}), points: v, ...(notes[`${col}${r}`] ? { note: notes[`${col}${r}`] } : {}) });
      }
      const total = num(cell(pb, r, "C")) ?? 0;
      const got = entries.reduce((s, e) => s + e.points, 0);
      if (got !== total) {
        console.warn(`! ${label} week ${bi + 1} ${n}: columns sum ${got}, total says ${total}; keeping the total`);
        entries.push({ rule: "extra", points: total - got, note: "Difference between the sheet's total and its columns" });
      }
      scores.push({ episode: bi + 1, castaway: id, entries: entries.filter((e) => e.points) });
    }
  });

  // Merge: the first week immunity went to a single castaway rather than a whole tribe.
  const immunityCount = (ep) => scores.filter((s) => s.episode === ep && s.entries.some((e) => e.rule === "immunity")).length;
  const mergeAt = Array.from({ length: blocks.length - 1 }, (_, i) => i + 1).find((ep) => immunityCount(ep) === 1) ?? blocks.length;
  const episodes = episodeList(blocks.length, (n) => (n >= mergeAt ? "post-merge" : "pre-merge"));

  // The rule catalog, from the headers. Some values changed partway through a season; the note says so.
  const seen = new Map(); // key → { def, values: { phase: [values in order] } }
  headers.forEach((hdr, bi) => {
    const phase = episodes[bi].phase;
    for (const h of Object.values(hdr)) {
      const k = keyFor(h);
      if (!k) continue;
      const [, key, name, category] = k;
      const entry = seen.get(key) ?? { name, category, values: { "pre-merge": [], "post-merge": [], finale: [] } };
      const v = valueOf(h);
      if (!Number.isNaN(v) && entry.values[phase].at(-1) !== v) entry.values[phase].push(v);
      seen.set(key, entry);
    }
  });
  const quantityRules = new Set(["voteCorrect", "votedAgainst"]);
  const rules = [
    ...[...seen.entries()].map(([key, { name, category, values }]) => {
      const points = Object.fromEntries(Object.entries(values).map(([ph, vs]) => [ph, vs.at(-1) ?? null]));
      if (points.finale === null && key !== "votedOut") points.finale = points["post-merge"];
      const changed = Object.entries(values).filter(([, vs]) => vs.length > 1).map(([ph, vs]) => `${{ "pre-merge": "before the merge", "post-merge": "after the merge", finale: "finale" }[ph]}: ${vs.join(", then ")}`);
      const note = [key === "reward" ? "Second place pays 1." : "", quantityRules.has(key) ? "Per vote." : "", changed.length ? `Changed during the season (${changed.join("; ")}).` : ""].filter(Boolean).join(" ");
      return {
        ...rule(key, name, category, quantityRules.has(key) ? "quantity" : key === "reward" ? "choice" : "boolean", points, note),
        ...(key === "reward" ? { options: [{ label: "Won reward", points: 3 }, { label: "Second place", points: 1 }] } : {}),
      };
    }),
    rule("extra", "Manual adjustment", "Other", "manual", phasePoints(null), "Anything the sheet scored outside its columns."),
  ];

  // Teams: Point Summary has name, weekly totals, total and rank; Per Chief Weekly lists the final picks.
  const teams = [];
  const typedTotals = [];
  for (let r = 2; str(cell(sum, r, "A")); r++) {
    const member = str(cell(sum, r, "A"));
    const weekly = Array.from({ length: blocks.length }, (_, i) => num(cell(sum, r, i + 3)) ?? 0);
    const total = num(cell(sum, r, blocks.length + 3));
    const added = weekly.reduce((a, b) => a + b, 0);
    if (added !== total) {
      console.warn(`! ${label} ${member}: weekly scores add up to ${added}, the total cell says ${total}`);
      typedTotals.push({ member, added, total });
    }
    let picks = [];
    for (let pr = 4; pr < blocks[0]; pr++)
      if (str(cell(pb, pr, "A")) === member) picks = ["B", "C", "D", "E"].map((c) => str(cell(pb, pr, c))).filter(Boolean).map(idFor);
    teams.push({ id: slug(member), member, name: str(cell(sum, r, "B")) || `${member}'s Team`, draft: picks, weekly, total, rank: num(cell(sum, r, blocks.length + 4)) });
  }

  return baseSeason(number, {
    config: { ...baseSeason(number).config, openingSeed: teams.map((t) => t.id) },
    tribes: tribes.map(({ id, name, color }) => ({ id, name, color })),
    slots: [1, 2, 3, 4].map((i) => ({ id: `slot${i}`, name: `Pick ${i}`, restrictionTribeId: null, enforceOnSwap: false })),
    episodes,
    rules,
    castaways,
    teams: teams.map(({ id, member, name, draft }) => ({ id, member, name, draft })),
    scores,
    statusEvents: exitsFrom(scores, castaways, episodes, "votedOut"),
    // A total typed over the sum formula is what the sheet ranked, so it's kept beside the base total like a wager.
    wagers: typedTotals.map(({ member, total }) => {
      const t = teams.find((x) => x.member === member);
      return { team: t.id, castaway: null, points: total - t.weekly.reduce((a, b) => a + b, 0), pointsAfterWager: total, rankAfterWager: t.rank };
    }),
    wagerState: typedTotals.length ? "LOCKED" : "OFF",
    archive: {
      notes: [
        ...typedTotals.map(({ member, added, total }) => `${member}'s season total was typed in as ${total} rather than added up (the weekly scores make ${added}). The sheet ranked the typed total, so the final standings use it too; the weekly scores are unchanged.`),
        "Imported from the league's spreadsheet, which kept each team's weekly score and every castaway's points by rule, but not who was on each roster week to week.",
        "Team scores are the ones recorded in the sheet. Rosters show each team's final picks (an empty spot was never refilled).",
        "Tribe names and colours were filled in afterwards; the merge is placed at the first individual immunity.",
      ],
      teamScores: Object.fromEntries(teams.map((t) => [t.id, t.weekly])),
      finalRostersOnly: true,
    },
    reference: {
      teamWeek: teams.map((t) => t.weekly),
      totals: Object.fromEntries(teams.map((t) => [t.id, t.total])),
      ranks: Object.fromEntries(teams.map((t) => [t.id, t.rank])),
      rosters: [],
    },
  });
}

// ---------- layout 3: Sheet1 + Tribes (Survivor 43) ----------
const S43_TRIBE_COLORS = { baka: "#d6453d", coco: "#e0b31f", vesi: "#2f6fd6" };
// From the rules picture in the workbook.
const s43Rules = () => [
  rule("teamImmunity", "Team immunity win", "Challenges", "boolean", phasePoints(4, null, null), "Per castaway on the winning tribe."),
  rule("individualImmunity", "Individual immunity win", "Challenges", "boolean", phasePoints(null, 4, 4)),
  rule("individualReward", "Individual reward win", "Challenges", "boolean", phasePoints(null, 3, 3)),
  rule("makeMerge", "Makes the merge", "Other", "boolean", phasePoints(null, 3, null)),
  rule("findAdvantage", "Find an advantage", "Idols & advantages", "boolean", phasePoints(1)),
  rule("findIdol", "Find an immunity idol", "Idols & advantages", "boolean", phasePoints(2)),
  rule("keepIdol", "Keep an idol unplayed", "Idols & advantages", "boolean", phasePoints(1), "Per episode it's kept and not used."),
  rule("voteCorrect", "Vote with the majority", "Tribal", "boolean", phasePoints(2, 3, 3)),
  rule("voteMinority", "Vote with the minority", "Tribal", "boolean", phasePoints(-1)),
  rule("votesAgainst", "Vote cast against", "Tribal", "quantity", phasePoints(-1), "Per vote."),
  rule("blindsided", "Blindsided", "Tribal", "boolean", phasePoints(-5), "Voted out thinking they were safe, or not knowing they were on the chopping block."),
  rule("blueShirt", "Jeff wears a blue shirt at Tribal", "Other", "boolean", phasePoints(1), "The Jeff Probst bonus, per player."),
  rule("fireWinner", "Wins fire-making", "Finale", "boolean", phasePoints(null, null, 8)),
  rule("final4", "Final 4", "Finale", "boolean", phasePoints(null, null, 10)),
  rule("final3", "Final 3", "Finale", "boolean", phasePoints(null, null, 20)),
  rule("final2", "Final 2", "Finale", "boolean", phasePoints(null, null, 30)),
  rule("winner", "Sole Survivor", "Finale", "boolean", phasePoints(null, null, 50)),
  rule("points", "Episode points", "Other", "manual", phasePoints(null), "The 2023 sheet kept each castaway's episode total rather than a line per rule; its cell notes are shown where it has them."),
];

function importS43(wb, number) {
  const label = `Survivor ${number}`;
  const s1 = wb.sheet("Sheet1");
  const tr = wb.sheet("Tribes");
  const s1Notes = wb.comments("Sheet1");
  const trNotes = wb.comments("Tribes");
  const EPISODES = 14; // E01–E13 and the finale

  // Tribes sheet: "<Name> Tribe" / "<Name>" header rows, then castaways with E01.. in B.. (finale in O).
  const castaways = [];
  const tribes = [];
  const trRow = new Map();
  for (let r = 2; r <= 40; r++) {
    const a = str(cell(tr, r, "A"));
    if (!a) continue;
    if (cell(tr, r, "B") === undefined) {
      const name = a.replace(/\s*tribe$/i, "");
      tribes.push({ id: slug(name), name, color: S43_TRIBE_COLORS[slug(name)] ?? "#888888" });
      continue;
    }
    const alias = { Nneke: "Nneka" };
    const name = alias[a] ?? a;
    castaways.push({ id: slug(name), name, initialTribeId: tribes.at(-1).id, order: castaways.length + 1 });
    trRow.set(slug(name), r);
  }
  const castId = castLookup(castaways, { Nneke: "Nneka" });

  // Sheet1: a member name starts each team; each of the next rows is a roster slot labelled by who was in it at
  // the end, with that slot's points per episode (C = E01 … P = finale) and the team total in Q.
  const teams = [];
  for (let r = 2; r <= 60; r++) {
    const member = str(cell(s1, r, "A"));
    const who = str(cell(s1, r, "B"));
    if (member) teams.push({ member, id: slug(member), total: num(cell(s1, r, "Q")), seed: undefined, slots: [] });
    if (!who || !teams.length) continue;
    const t = teams.at(-1);
    t.slots.push({ row: r, castaway: castId(who), pts: Array.from({ length: EPISODES }, (_, i) => num(cell(s1, r, i + 3)) ?? 0) });
    const seed = num(cell(s1, r, "R"));
    if (seed !== undefined) t.seed = seed;
  }

  // A castaway's episode points: the value most team rows agree on (one row can carry a swap's cost), else the
  // Tribes sheet, which wasn't kept up to date for the finale.
  const scores = [];
  for (const c of castaways) {
    for (let e = 1; e <= EPISODES; e++) {
      const rows = teams.flatMap((t) => t.slots.filter((s) => s.castaway === c.id).map((s) => ({ v: s.pts[e - 1], row: s.row })));
      const counts = new Map();
      for (const x of rows) counts.set(x.v, (counts.get(x.v) ?? 0) + 1);
      const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
      const col = e === EPISODES ? "O" : colName(e + 1);
      const pts = best ? best[0] : num(cell(tr, trRow.get(c.id), col)) ?? 0;
      const note = trNotes[`${col}${trRow.get(c.id)}`] ?? rows.filter((x) => x.v === pts).map((x) => s1Notes[`${colName(e + 2)}${x.row}`]).find(Boolean);
      const entries = pts ? [{ rule: "points", points: pts, ...(note ? { note } : {}) }] : [];
      scores.push({ episode: e, castaway: c.id, entries });
    }
  }
  // The rules picture pays 8 for winning fire-making, and Owen won it — but his rows never got the 8, while every
  // team that had him was credited with it in its total. It's added to his finale here so the two agree.
  const owen = scores.find((s) => s.castaway === "owen" && s.episode === EPISODES);
  owen.entries.push({ rule: "fireWinner", points: 8, note: "Won fire-making (added to the team totals in the sheet, not to his row)" });

  // Swaps: a slot whose early weeks don't match its final castaway. The sheet notes one — Jon traded Owen for
  // Ryan after Episode 1 at a cost of 8 points ("Switch from Owen to Ryan (-8)").
  const transactions = [];
  const drafts = teams.map((t) =>
    t.slots.map((s, si) => {
      const note = Object.entries(s1Notes).find(([ref]) => Number(ref.replace(/^[A-Z]+/, "")) === s.row && /switch from (\w+) to (\w+)/i.test(s1Notes[ref]));
      if (!note) return s.castaway;
      const [, from] = note[1].match(/switch from (\w+) to (\w+)/i);
      const at = colIndex(note[0].replace(/\d+$/, "")) - 2; // the episode the new castaway started
      transactions.push({ id: `tx${transactions.length + 1}`, team: t.id, slot: si, out: castId(from), in: s.castaway, windowAfterEpisode: at - 1, effectiveEpisode: at, order: transactions.length + 1, cost: 8, note: "Swap cost 8 points" });
      return castId(from);
    }),
  );

  // Team scores exactly as the sheet totals them. Its total formula is "sum of the rows + 8" for every team but
  // Jon's: the 8 is Owen winning fire-making (the rules picture pays 8), which his rows never got. Jon had traded
  // Owen away; Diego's team never had him, yet its formula adds the 8 as well — kept as recorded, and noted.
  const oddBonus = [];
  const teamScores = teams.map((t) => {
    const weekly = Array.from({ length: EPISODES }, (_, e) => t.slots.reduce((sum, s) => sum + s.pts[e], 0));
    const bonus = t.total - weekly.reduce((a, b) => a + b, 0);
    weekly[EPISODES - 1] += bonus;
    if (bonus && !t.slots.some((s) => s.castaway === "owen")) oddBonus.push(`${t.member}'s team total includes the same ${bonus} points even though it never had Owen (most likely the formula copied down); it's kept as the sheet recorded it and doesn't change any finishing position.`);
    return weekly;
  });
  const totals = teamScores.map((w) => w.reduce((a, b) => a + b, 0));
  const ranks = competitionRanks(totals);
  const mergeAt = 6; // "4 for immunity, 3 for merge" is noted on Episode 6
  const episodes = episodeList(EPISODES, (n) => (n >= mergeAt ? "post-merge" : "pre-merge"));

  return baseSeason(number, {
    config: {
      ...baseSeason(number).config,
      ownershipCap: Math.max(...castaways.map((c) => drafts.filter((d) => d.includes(c.id)).length)),
      openingSeed: [...teams].sort((a, b) => (a.seed ?? 99) - (b.seed ?? 99)).map((t) => t.id),
    },
    tribes,
    slots: [1, 2, 3, 4].map((i) => ({ id: `slot${i}`, name: `Pick ${i}`, restrictionTribeId: null, enforceOnSwap: false })),
    episodes,
    rules: s43Rules(),
    castaways,
    teams: teams.map((t, ti) => ({ id: t.id, member: t.member, name: `${t.member}'s Team`, draft: drafts[ti] })),
    scores,
    transactions,
    statusEvents: exitsFrom(scores, castaways, episodes, "__none__").map((e) => ({ ...e, type: "VOTED_OUT", note: undefined })),
    archive: {
      notes: [
        "Imported from the league's first spreadsheet, which kept each team's points slot by slot and each castaway's episode totals, but not a line per scoring rule or team names.",
        "Team scores are the ones recorded in the sheet, including 8 points for Owen winning fire-making, which the sheet added to team totals but not to his row.",
        ...oddBonus,
      ],
      teamScores: Object.fromEntries(teams.map((t, ti) => [t.id, teamScores[ti]])),
    },
    reference: {
      teamWeek: teamScores,
      totals: Object.fromEntries(teams.map((t, ti) => [t.id, t.total])),
      ranks: Object.fromEntries(teams.map((t, ti) => [t.id, ranks[ti]])),
      rosters: [],
    },
  });
}

// ---------- main ----------
const inputs = process.argv.slice(2);
if (!inputs.length) {
  console.error("usage: node scripts/import-archive.mjs <workbook.xlsx> [...]");
  process.exit(1);
}
for (const path of inputs) {
  const number = Number((basename(path).match(/survivor\D*(\d{2})/i) ?? [])[1]);
  if (!number) throw new Error(`${path}: can't tell the season number from the file name`);
  const wb = openWorkbook(path);
  const season = wb.names.includes("Team Weekly")
    ? importModern(wb, number)
    : wb.names.includes("Point Breakdown")
      ? importBreakdown(wb, number)
      : wb.names.includes("Tribes")
        ? importS43(wb, number)
        : null;
  if (!season) throw new Error(`${path}: unrecognised workbook layout (${wb.names.join(", ")})`);
  const out = new URL(`../src/data/seasons/${season.id}.json`, import.meta.url);
  writeFileSync(out, JSON.stringify(season));
  console.log(
    `wrote ${basename(out.pathname)}: ${season.castaways.length} castaways, ${season.teams.length} teams, ${season.episodes.length} episodes, ${season.scores.length} score rows, ${season.transactions.length} roster changes, ${season.statusEvents.length} exits${season.archive.teamScores ? " (recorded team scores)" : ""}`,
  );
}
