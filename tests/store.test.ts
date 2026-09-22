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

test("deleting a season removes it and everything scoped to it, and leaves other seasons untouched", async () => {
  const store = fresh("delete");
  const gone: Season = { ...ref, id: "gone", name: "Gone Season", status: "SETUP" };
  await store.create(gone);
  await store.setCommissioner("gone", "shane", true);
  await store.setCredential("gone", "shane", "shane", "hash");
  await store.logAudit([{ seasonId: "gone", actor: "t", entityType: "season", entityId: "gone", action: "SOMETHING" }]);

  await store.deleteSeason("gone");

  assert.equal(await store.get("gone"), null);
  assert.equal((await store.list()).length, 1, "survivor-50 (the seed) is untouched");
  assert.deepEqual(await store.commissioners("gone"), new Set());
  assert.equal(await store.checkCredential("gone", "shane", () => true), null);
  assert.deepEqual(await store.audit("gone"), []);
  assert.equal((await store.get("survivor-50"))!.season.name, ref.name, "an unrelated season is unaffected");
});

test("member logins: only the password hash is stored, changing a login revokes the old session, wrong password finds nothing", async () => {
  const store = fresh("credentials");
  const verifyAs = (expected: string) => (hash: string) => hash === expected;
  await store.setCredential("survivor-50", "shane", "shane", "hash-v1");
  const found = await store.checkCredential("survivor-50", "shane", verifyAs("hash-v1"));
  assert.deepEqual(found, { teamId: "shane", key: found!.key });
  assert.equal(await store.credentialKey("survivor-50", "shane"), found!.key);
  assert.equal(await store.checkCredential("survivor-50", "shane", verifyAs("wrong-hash")), null, "a wrong password matches nothing");
  assert.equal(await store.checkCredential("survivor-50", "nobody", verifyAs("hash-v1")), null, "an unknown username matches nothing");

  const raw = createClient({ url: `file:${join(dir, "credentials.db")}` });
  const { rows } = await raw.execute("SELECT password_hash FROM member_credential");
  assert.equal(rows[0].password_hash, "hash-v1", "the hash is stored, never the plain password");
  raw.close();

  await store.setCredential("survivor-50", "shane", "shane", "hash-v2");
  assert.notEqual(await store.credentialKey("survivor-50", "shane"), found!.key, "changing the login revokes sessions made with the old one");
  assert.equal(await store.checkCredential("survivor-50", "shane", verifyAs("hash-v1")), null, "the old password no longer works");

  await store.setCredential("survivor-50", "gabby", "gabby", "hash-g");
  await assert.rejects(store.setCredential("survivor-50", "cori", "gabby", "hash-c"), /already taken/, "usernames are unique within a season");
  assert.deepEqual([...(await store.credentials("survivor-50")).entries()].sort(), [["gabby", "gabby"], ["shane", "shane"]]);
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
