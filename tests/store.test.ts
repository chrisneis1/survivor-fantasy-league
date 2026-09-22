// The store's guarantees, against a real SQLite file: seeding, versioned compare-and-swap, atomic audit rows.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import survivor50 from "../src/data/seasons/survivor-50.json";
import type { Season } from "../src/domain/types";
import { ConflictError, createStore } from "../src/server/store";

const ref = survivor50 as unknown as Season;
const dir = mkdtempSync(join(tmpdir(), "league-"));
after(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows keeps SQLite files locked until the process exits; the OS temp folder is cleaned up eventually.
  }
});

const fresh = (name: string) => createStore(createClient({ url: `file:${join(dir, name)}.db` }), [ref]);

test("seeds the bundled season once and reads it back intact", async () => {
  const store = fresh("seed");
  const [s] = await store.list();
  assert.equal(s.id, "survivor-50");
  assert.equal(s.scores.length, ref.scores.length);
  assert.equal((await store.get("survivor-50"))!.version, 1);
  assert.equal((await store.list()).length, 1);
});

test("a save needs the latest version; a stale writer gets a conflict and changes nothing", async () => {
  const store = fresh("cas");
  const a = (await store.get("survivor-50"))!;
  const b = (await store.get("survivor-50"))!;
  const v2 = await store.save({ ...a.season, name: "First writer" }, a.version, [
    { seasonId: "survivor-50", actor: "t", entityType: "season", entityId: "survivor-50", action: "RENAME" },
  ]);
  assert.equal(v2, 2);
  await assert.rejects(
    store.save({ ...b.season, name: "Second writer" }, b.version, [{ seasonId: "survivor-50", actor: "t", entityType: "season", entityId: "x", action: "SHOULD_NOT_EXIST" }]),
    ConflictError,
  );
  const now = (await store.get("survivor-50"))!;
  assert.equal(now.season.name, "First writer");
  assert.equal(now.version, 2);
  const log = await store.audit("survivor-50");
  assert.deepEqual(log.map((r) => r.action), ["RENAME"], "the losing write left no audit row behind");
});

test("simultaneous writers: exactly one wins", async () => {
  const store = fresh("race");
  const base = (await store.get("survivor-50"))!;
  const results = await Promise.allSettled(
    Array.from({ length: 6 }, (_, i) => store.save({ ...base.season, name: `Writer ${i}` }, base.version)),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(results.filter((r) => r.status === "rejected" && r.reason instanceof ConflictError).length, 5);
});

test("create rejects a duplicate id and records its audit event", async () => {
  const store = fresh("create");
  const next: Season = { ...ref, id: "survivor-51", name: "Survivor 51", status: "SETUP" };
  await store.create(next, [{ seasonId: "survivor-51", actor: "t", entityType: "season", entityId: "survivor-51", action: "CREATE", after: { name: "Survivor 51" } }]);
  await assert.rejects(store.create(next));
  const [event] = await store.audit("survivor-51");
  assert.equal(event.action, "CREATE");
  assert.deepEqual(event.after, { name: "Survivor 51" });
  assert.equal((await store.list()).length, 2);
});

test("invite links: only the hash is stored, a new link revokes the old one, unknown tokens find nothing", async () => {
  const store = fresh("invites");
  const t1 = await store.createInvite("survivor-50", "shane");
  const found = await store.findInvite(t1);
  assert.deepEqual({ s: found!.seasonId, t: found!.teamId }, { s: "survivor-50", t: "shane" });
  assert.equal(await store.inviteKey("survivor-50", "shane"), found!.key);
  assert.equal(await store.findInvite("not-a-token"), null);

  const raw = createClient({ url: `file:${join(dir, "invites.db")}` });
  const { rows } = await raw.execute("SELECT token_hash FROM member_invite");
  assert.notEqual(rows[0].token_hash, t1, "the token itself is never stored");
  raw.close();

  const t2 = await store.createInvite("survivor-50", "shane");
  assert.notEqual(t1, t2);
  assert.equal(await store.findInvite(t1), null, "the old link no longer works");
  assert.notEqual((await store.findInvite(t2))!.key, found!.key, "sessions from the old link no longer match");
  await store.createInvite("survivor-50", "gabby");
  assert.deepEqual([...(await store.invitedTeams("survivor-50"))].sort(), ["gabby", "shane"]);
});

test("the commissioner role is per season, off by default, and toggles cleanly", async () => {
  const store = fresh("roles");
  assert.deepEqual(await store.commissioners("survivor-50"), new Set());
  await store.setCommissioner("survivor-50", "shane", true);
  assert.deepEqual(await store.commissioners("survivor-50"), new Set(["shane"]));
  await store.setCommissioner("survivor-50", "gabby", true);
  assert.deepEqual([...(await store.commissioners("survivor-50"))].sort(), ["gabby", "shane"]);
  await store.setCommissioner("survivor-50", "shane", false);
  assert.deepEqual(await store.commissioners("survivor-50"), new Set(["gabby"]));
  // Idempotent: granting or revoking twice is not an error.
  await store.setCommissioner("survivor-50", "shane", false);
  await store.setCommissioner("survivor-50", "gabby", true);
  assert.deepEqual(await store.commissioners("survivor-50"), new Set(["gabby"]));
});

test("scoring templates are saved by name, listed, loaded back intact and deleted", async () => {
  const store = fresh("templates");
  const tpl = { rules: ref.rules, layout: { total: 12, mergeAt: 7, draftTail: 2 }, winnerRule: "winner" };
  await store.saveTemplate("standard", "Standard", tpl);
  assert.deepEqual((await store.getTemplate("standard"))!.layout, tpl.layout);
  assert.deepEqual(await store.listTemplates(), [{ id: "standard", name: "Standard", rules: ref.rules.length, layout: tpl.layout }]);
  await store.saveTemplate("standard", "Standard v2", { ...tpl, layout: { total: 13, mergeAt: 7, draftTail: 2 } });
  assert.equal((await store.listTemplates())[0].name, "Standard v2");
  assert.equal((await store.getTemplate("standard"))!.layout.total, 13);
  await store.deleteTemplate("standard");
  assert.equal(await store.getTemplate("standard"), null);
});
