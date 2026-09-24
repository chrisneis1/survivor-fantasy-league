# Survivor Fantasy League

Reusable multi-season league site, built from *Survivor Fantasy League — Website Product & Technical Design Guide (Final Refinement)*. Built so far: guide **phases 1–5** — the domain engine, the public site, the commissioner tools (setup, scoring, publish, corrections, audit log), member picking (opening draft, weekly replacement windows), and the secret final wager.

```bash
npm install
npm run dev        # http://localhost:3000
# Commissioner sign-in: copy .env.example to .env.local and set COMMISSIONER_PASSCODE and a 32+ char SESSION_SECRET,
# then open /admin. Data lives in data/league.db (delete it to re-seed from src/data/seasons/*.json).
npm test           # regression: 196 team-week scores + 14 season totals
npm run build && npm run test:e2e   # page tests in a real browser (see "Tests and CI" below)
npm run import:season -- "C:/path/to/Survivor 50.xlsx"   # rebuild src/data/seasons/survivor-50.json
```

## Tests and CI

- **`npm test`** — the scoring engine, store and rules (Node's test runner, `tests/*.test.ts`).
- **`npm run test:e2e`** — page smoke tests with Playwright (`tests/e2e/`), against the production build, so run
  `npm run build` first (and `npx playwright install chromium` once). The web server seeds a throwaway SQLite file in
  `.e2e/` on every run (`tests/e2e/seed.ts`): archived Survivor 50, a "Demo Season" cut back to Episode 7 with a pick
  window open, and an empty "Survivor 51" in setup. It only ever accepts a local file, never Turso. `pages.spec.ts`
  loads every public page on a phone and a desktop (heading, no console errors, no sideways scrolling);
  `flows.spec.ts` drives the phone navigation, filters, a real replacement pick, sign-out, the commissioner pages and
  scoring an episode.
- **CI** (`.github/workflows/ci.yml`) runs the typecheck, `npm test`, the build and the page tests on every pull
  request and on `main`. A failing run uploads the Playwright report and traces as an artifact.
- **App icons**: `src/app/icon.svg` is the favicon; `node scripts/render-icons.mjs` regenerates the PNGs (home-screen
  icons in `public/icons/` and `src/app/apple-icon.png`). `src/app/manifest.ts` makes the site installable.

## Layout

| Path | What |
|---|---|
| `src/domain/types.ts` | Season data shape. All season specifics are data. |
| `src/domain/engine.ts` | Pure rules engine: roster resolver (EFFECTIVE / ORIGINAL_DRAFT / SNAPSHOT_AS_OF), scoring, shared-rank standings, status-at-episode, availability, reverse-standings pick queue. |
| `src/data/seasons/*.json` | Bundled reference season(s). Seeded into the database the first time it is empty (`src/server/index.ts`); new seasons are created in `/admin`. |
| `scripts/import-reference-season.mjs` | Workbook → season JSON (keeps the workbook's own totals under `reference` as a fixture). |
| `tests/regression.test.ts` | Proves the engine reproduces the workbook using only config + history. |
| `src/domain/scoring.ts`, `setup.ts` | Commissioner logic: resolve inputs → points, publish validation, corrections, setup validation, lifecycle. |
| `src/domain/template.ts` | Scoring template: add/edit/retire/delete rules, choice options, one-step episode layout (total, merge, original-draft tail), one-step roster slots (picks per tribe), named templates. |
| `src/domain/engine.ts` → `currentTribeId`, `tribeBeforeEpisode` | A castaway's current tribe as of any episode, from `tribeSwaps` history (empty = still on their starting tribe). |
| `src/domain/scoring.ts` → `correctEpisode`, `rowsFromPublished` | Editing a published episode's scoring from the same grid it was scored in, instead of one field at a time. Only cells the commissioner actually touches are ever read or changed. |
| `src/domain/wager.ts` | Final wager: eligibility, stake limits, open/lock, winner lookup, 1:1 settlement. |
| `src/domain/picks.ts` | Opening draft (FIXED/SNAKE), weekly windows with a frozen reverse-standings queue, multi-pick turns, pass/skip/close, the server-side legality check for every pick. |
| `src/server` | Versioned SQLite/Turso store (compare-and-swap + audit rows), session auth, guarded server actions. |
| `src/app` | Public: Leaderboard (`/`), This Week, Teams, Castaways, Episodes, Rules, Archive. Accounts: `/login`, `/signup`, then `/<season>/my`. Commissioner: `/admin` (setup, members, score, corrections, audit, site accounts at `/admin/users`, and the live draft board at `/admin/<season>/draft`). |

## Assumptions to confirm (recorded in the season config, none hard-coded in the engine)

- **Ownership cap = 7** — the highest owner count in the workbook; the cap itself wasn't recorded.
- **Swap credit limit = unset** — not recorded; the site shows swaps *used*, not remaining.
- **Pick-order tie rule = later opening seed picks first** (`OPENING_SEED_REVERSE`) — the guide requires a deterministic rule but leaves the choice to the league.
- **League timezone = America/Los_Angeles** — not in the workbook.
- **Weeks 13–Finale score the original draft.** The workbook resets every team to its draft roster there; the importer models it as the `ORIGINAL_DRAFT` roster policy.
- **Week 6 is the merge.** Week 7's sheet header still says pre-merge values, but its data uses the post-merge −8.
- **Kyle's medical evacuation** is taken from the swap log (Miguel's "Free Pick due to Kyle Med Evac"); the score columns don't record it.
- **Jon's team name** was the untouched template placeholder ("Team Name"), shown as "Jon's Team".
- The archived pick windows record *who picked*, not the queue used at the time; the queue is rebuilt from published standings.

## Phase 3 design notes

- **Storage:** one JSON document per season with a version number; every write is compare-and-swap in a transaction together with its audit rows, so a stale or simultaneous writer gets a clear conflict. This is simpler than the guide's relational Postgres model and keeps the engine unchanged; the same mechanism will guard ownership-cap races in phase 4.
- **Sign-in is a placeholder:** one shared commissioner passcode and a signed cookie, so the audit log records the actor as "commissioner" and not a person. Replace with email-link/OAuth before there is more than one commissioner.
- **Opening rosters are commissioner-entered** (logged) until member self-service picking exists.
- Publishing requires episodes in order, valid inputs, notes on manual adjustments, and complete rosters for every team. Corrections keep before/after/reason and recalculate everything derived.

## Phase 4 design notes

- **No timers.** The commissioner initiates every phase and picks have no time limit: they open the draft, open a pick window after publishing an episode, and can skip a team or close a window. The guide's turn timer, quiet hours and automatic expiry (§5.3) were deliberately left out.
- **Reminders are a mail-to button, and optional.** Where a team is up, the commissioner sees "Email a reminder", which opens their own email app with the message written. The site sends no email and stores no addresses.
- **Members sign in with a username and password.** The commissioner sets one per team (Members page) and can email it with the same mail-to approach. Only a hash of the password is stored; changing it revokes the old one and any device signed in with it. The cookie is per season and lasts about six months. (See "Member sign-in, and deleting a season" below — this replaced an earlier personal-invite-link design.)
- **Every pick is re-validated on the server** (turn, slot, tribe restriction, duplicate, ownership cap, swap credits or free entitlement, eliminated castaway) and saved with a version check. A member who loses a race for the last ownership slot is retried against fresh state and told the real reason.
- **The queue is frozen** when a window opens (teams that lost a castaway in the latest episode pick first, then teams still holding open slots from earlier skips; each group lowest points first, ties: later opening seed first) and does not move if a score is corrected. Teams with no legal pick are auto-skipped with the reason shown.
- New seasons can either use the draft (Members pick) or the commissioner-entry path from phase 3.

## Phase 5: the final wager

- **Rules:** each member backs one castaway to win and wagers 1–30 points. A correct pick gains the stake and a wrong pick loses it (1:1). Someone who doesn't wager is unchanged. The minimum, maximum and multipliers are season settings.
- **Deadline:** wagering closes automatically when Episode 2 is published (season setting `lockAtEpisode`, default 2), and can't be reopened after that. Members see the deadline on their wager card.
- **Secret until the season ends.** Picks are stored in their own table, not in the season document, so no public page, standings view or commissioner screen can show them. The commissioner sees only how many teams have wagered (and, on Members, which have), never who picked whom. The audit log records that a team placed a wager, not what it is. The one and only reader of every pick is *finalize*, which settles the wagers and writes the results into the season (shown as the "After wager" leaderboard view and on team pages).
- **The commissioner runs it:** open wagering, lock it, then finalize. Finalize refuses to run while wagering is open, or if no Sole Survivor has been scored in the finale.
- Members place or change their wager on **My Team** while wagering is open. Only castaways still in the game can be backed, and every rule is re-checked on the server inside the write.
- The 1-point minimum and the "winner" scoring rule used to identify the winner are placeholders in the season config.

## Scoring template, layout and the draft

- **Rules are editable.** Add, rename, regroup, re-type and re-value rules, and edit choice options (one per line: `Label | pre-merge | post-merge | finale`). A rule that has been scored keeps its type and can be *retired* (hidden from the grid, history intact) but not deleted. The rule that marks the season winner (for the wager) is protected.
- **Episode layout in one step:** total episodes, the first post-merge episode, and how many at the end score the original draft. Episodes already scored are never changed.
- **Roster layout in one step:** "picks from each tribe" plus any wild slots. Two tribes with 2 picks each builds four slots (Aloha 1, Aloha 2, Bula 1, Bula 2). Tested with a complete 4-team draft.
- **Templates:** save a season's rules and episode layout by name, and start any new season from it.
- **The draft is always one pick at a time in snake order off a random draw.** The site does the draw itself (unbiased, recorded in the audit log); the order can also be typed in if a wheel was spun elsewhere. Drawn Jon, Christian, Shane means round 2 runs Shane, Christian, Jon.
- Still one phase per episode. A one-off exception (for example a merge episode) is a manual adjustment with a note.

## Editing published scoring

- **"Edit scoring" replaces the separate Corrections page.** Every episode — scored, in progress, or published — opens the same grid at `/admin/<season>/score/<n>`. A published episode is fully editable there, pre-filled with what was recorded; one shared reason covers every change in that save, and standings recalculate immediately.
- **A voted-out castaway turns red and drops to the bottom of that episode's grid**, once it is published (the pre-publish grid keeps everyone in cast order so it doesn't jump around while still being filled in).
- **Only touched cells are ever written.** The commissioner's browser tracks exactly which cells changed and sends just those; nothing else is read back through the grid's reconstruction, even to compare it. This matters because older imported data doesn't record enough to always rebuild a cell exactly (a quantity rule's count, a choice rule's option) — an earlier version of this feature used a whole-row diff and would silently wipe such a cell the moment *any other* field on the episode was saved. A regression test (`tests/edit-scoring.test.ts`) locks this in: touching one cell must never change data behind any other cell, however that cell's value got there.
- Who left the game can also be corrected here, unless a pick window has already used that result — the grid disables the exit field with an explanation in that case, and the error is scores-vs-exits specific (a locked exit never blocks a scores-only edit).

## Tribe swaps and the scoring grid's layout

- **Tracking a swap:** a checkbox row under each castaway's name in the scoring grid (one per tribe) shows and sets their *current* tribe. Checking a different one and saving records a swap effective that episode (`tribeSwaps`, mirrors how exits work); checking back to the same tribe removes the record rather than leaving a no-op swap on file. Only tracked from the scoring grid — public pages (Castaways, Teams) still show each castaway's *starting* tribe, unchanged from before.
- **The grid stays grouped by current tribe, live.** Checking a different tribe box moves that row to sit with its new tribemates immediately, so tallying a challenge result is reading straight down one block. In "Edit scoring" (published episodes), anyone marked as leaving that episode still drops to the very bottom in red, ahead of the tribe grouping.
- **Frozen header, spreadsheet-style.** The grid is now its own bounded, independently-scrolling region (not the page): both the header row and the Castaway/Total columns stay in place while everything else scrolls, in both directions.
- **Checkboxes replaced every dropdown** in the grid — choice-rule options (e.g. reward tiers) and who left the game are now a small checkbox list instead of a `<select>`, so every option's value is visible at a glance and there's no dropdown to open. Checking the already-checked option clears it (tribe is the one exception: a castaway is always on exactly one, so that group can't be cleared to none).
- **Two bugs fixed:** a choice-rule checkbox (e.g. "Reward challenge win") couldn't be unchecked once checked — the clearing code passed an empty patch object that a merge-style state update silently ignored, leaving the old selection in place. And the bottom "reason for this edit / Save changes" bar, being `position: sticky; bottom: 0` on a page taller than one screen, was painted directly over the grid's own last few rows (both share the viewport's bottom edge for most of the scroll range) — swallowing scroll-wheel input meant for the grid. Fixed by dropping the sticky pin; the bar is now a plain block after the grid, reachable by scrolling a little further, never overlapping it.

## Draft workflow and team names

- **Setup defines everything except opening rosters.** There's no more direct "type in every team's roster" path — the only way rosters get filled is the draft. "Launch to draft phase" needs the cast, tribes, slots, teams and pick order — not episodes or scoring values, which a league often finalizes closer to air date. Launching locks in teams and the pick order and sends the commissioner straight to the draft board.
- **Opening pick order is always typed in by the commissioner** (Setup → Teams) — there's no in-app random draw. A league that wants a random order runs it themselves (a wheel, a drawn-names video call, whatever) and types the result in.
- **The draft board** (`/admin/<season>/draft`) is a dedicated, commissioner-run screen designed to be shared on a call: a large "who's up" banner, a searchable click-to-pick list (`PickPanel`, the same component members use for their own turn, given an `onPick` that targets `adminOpeningPickAction` instead), and a live table of every team's roster filling in below. No reason field — entering the whole opening draft this way is the ordinary path now, not an occasional stand-in for a member who can't get to the site. When the last slot is filled the board itself announces "Draft complete!".
- **Team names are filler until someone sets them.** A new team still defaults to "Member's Team"; from there, either the commissioner (Setup → Teams) or the member themselves (My Team → Team name) can rename it, any time before the season is archived — deliberately not gated to setup, since some people like to wait.

## Site-wide accounts, and deleting a season

- **One account per person, independent of any season.** Anyone can sign up at `/signup` (username + password,
  self-serve); it grants no season access by itself. Only a scrypt hash of the password is stored, in `app_user`,
  and a per-account `session_key` (rotated whenever the password changes) revokes every signed-in device at once.
  One cookie (`league_user`) identifies the account everywhere on the site — there's no more per-season sign-in.
- **A team is created *from* an account, not the other way around.** Setup → Teams shows everyone who has signed up
  and isn't already in the season; adding someone creates their team and links the two in one step
  (`addTeamFromUserAction`), instead of the commissioner typing a name and separately assigning a login afterward.
  `season_membership` (season, team) → user is the link; an account runs at most one team per season, and a team
  holds at most one account — assigning someone new bumps off whoever was there. Members still has a manual
  reassign/unassign for corrections after the fact.
- **Admin is a flag on an account (`isAdmin`), granted by another admin from `/admin/users`** — but the original
  shared-passcode login (`COMMISSIONER_PASSCODE`) still works too, unchanged, as a permanent bootstrap/emergency way
  in that can't be locked out by an accounts-table problem.
- **The landing page (`/`)** sends a signed-in visitor straight to their team (or the current season) instead of
  showing itself; a visitor with no account gets Sign in / Create an account plus a direct link to browse the
  current season without one — the site stays public-by-default either way (guide §9.1).
- **A season can be deleted** from Setup → Danger zone (admin login only), removing the season document, its audit
  log, memberships, roles and wagers together. It requires typing the season's exact name first; there is no undo.
  Survivor 50 was created before any of this existed and was deliberately left unmigrated — its teams have no
  linked accounts, and that's fine, since it's archived and nobody needs to sign in to it any more.

## An episode that doesn't count, and a cast entered before tribes exist

Built for Survivor 51: the cast is announced well before tribes are, and the league wants everyone to draft *after*
watching the premiere, whose scoring shouldn't count toward anyone's total.

- **`Episode.excludeFromStandings`.** An episode can be scored and published like any other, but is permanently
  worth zero to every team, in `teamEpisodeScore` — not just while no team happens to have a roster yet. Publishing
  one also skips the season-must-be-ACTIVE and complete-roster checks in `validatePublish`, since the whole point is
  publishing it *before* the draft exists to fill any roster. Toggled per-episode in Setup → Episodes (a checkbox
  under each episode's form) or in the season JSON; `applyEpisodeLayout`'s quick-layout tool preserves it on any
  episode not yet scored.
- **The draft opens after the premiere, not before.** Nothing new was needed here: `openOpeningSelection` already
  didn't require episodes or scoring to be finished (see "Draft workflow" above), so the sequence is score + publish
  the excluded premiere while the season is still in `SETUP`, *then* open the draft.
- **`updateCastaway` (Setup → Cast → inline edit).** Every castaway needs a valid tribe id from creation, but real
  tribes are often revealed after the cast is — so a season can start everyone on one placeholder tribe (e.g. "Tribe
  TBD") and move each castaway to their real tribe once it's announced. Only while the season is in setup, same as
  adding one; refuses to move a castaway already on a filled roster into a tribe that would make that roster illegal
  under its slot restrictions.

## Not built yet
