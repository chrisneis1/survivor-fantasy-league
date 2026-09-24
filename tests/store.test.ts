// The store's guarantees, against a real SQLite file: seeding, versioned compare-and-swap, atomic audit rows.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import survivor50 from "../src/data/seasons/survivor-50.json";
import type { Season } from "../src/domain/types";
import { hashPassword, verifyPassword } from "../src/server/session";
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
  const userId = await store.createUser("shane-in-gone", "hash");
  await store.assignUser("gone", "shane", userId);
  await store.logAudit([{ seasonId: "gone", actor: "t", entityType: "season", entityId: "gone", action: "SOMETHING" }]);

  await store.deleteSeason("gone");

  assert.equal(await store.get("gone"), null);
  assert.equal((await store.list()).length, 1, "survivor-50 (the seed) is untouched");
  assert.deepEqual(await store.commissioners("gone"), new Set());
  assert.equal(await store.teamForUser("gone", userId), null);
  assert.deepEqual(await store.audit("gone"), []);
  assert.equal((await store.get("survivor-50"))!.season.name, ref.name, "an unrelated season is unaffected");
});

test("user accounts: only the password hash is stored, changing the password revokes the old session, wrong password finds nothing", async () => {
  const store = fresh("accounts");
  const verifyAs = (expected: string) => (hash: string) => hash === expected;
  const userId = await store.createUser("shane", "hash-v1");
  const found = await store.checkUserLogin("shane", verifyAs("hash-v1"));
  assert.deepEqual(found, { userId, isAdmin: false, key: found!.key });
  assert.equal((await store.userById(userId))!.key, found!.key);
  assert.equal(await store.checkUserLogin("shane", verifyAs("wrong-hash")), null, "a wrong password matches nothing");
  assert.equal(await store.checkUserLogin("nobody", verifyAs("hash-v1")), null, "an unknown username matches nothing");

  const raw = createClient({ url: `file:${join(dir, "accounts.db")}` });
  const { rows } = await raw.execute("SELECT password_hash FROM app_user");
  assert.equal(rows[0].password_hash, "hash-v1", "the hash is stored, never the plain password");
  raw.close();

  await assert.rejects(store.createUser("shane", "hash-x"), /already taken/, "usernames are unique site-wide");
  await store.setUserAdmin(userId, true);
  assert.equal((await store.checkUserLogin("shane", verifyAs("hash-v1")))!.isAdmin, true);
  assert.deepEqual((await store.listUsers()).map((u) => u.username), ["shane"]);
});

test("a password reset: the old password stops working, the new one works, and the session key rotates", async () => {
  const store = fresh("reset");
  const loginWith = (password: string) => store.checkUserLogin("shane", (hash) => verifyPassword(password, hash));
  const userId = await store.createUser("shane", hashPassword("old-pass"));
  const before = (await loginWith("old-pass"))!;
  assert.equal(before.userId, userId);

  const newKey = await store.setUserPassword(userId, hashPassword("temp-pass"));

  assert.equal(await loginWith("old-pass"), null, "the old password no longer signs in");
  const after = (await loginWith("temp-pass"))!;
  assert.equal(after.userId, userId, "the new password signs in to the same account");
  assert.notEqual(after.key, before.key, "the session key changed, so cookies signed with the old key are revoked");
  assert.equal(after.key, newKey, "the returned key is the one now stored, so the caller can re-issue its own session");
  assert.equal((await store.userById(userId))!.key, newKey);

  const raw = createClient({ url: `file:${join(dir, "reset.db")}` });
  const { rows } = await raw.execute("SELECT password_hash FROM app_user");
  assert.ok(!String(rows[0].password_hash).includes("temp-pass"), "only a hash is stored");
  raw.close();

  assert.equal(await store.setUserPassword("no-such-user", hashPassword("x-pass")), null, "an unknown account changes nothing");
});

test("season membership: a user runs at most one team per season, and a team holds at most one user", async () => {
  const store = fresh("membership");
  const shane = await store.createUser("shane", "h1");
  const cori = await store.createUser("cori", "h2");
  await store.assignUser("survivor-50", "shane", shane);
  assert.equal(await store.teamForUser("survivor-50", shane), "shane");

  // Assigning shane to a second team in the same season moves him off the first.
  await store.assignUser("survivor-50", "cori", shane);
  assert.equal(await store.teamForUser("survivor-50", shane), "cori");
  assert.equal((await store.membersOf("survivor-50")).has("shane"), false);

  // Assigning cori (a different user) onto the team shane now holds bumps him off entirely.
  await store.assignUser("survivor-50", "cori", cori);
  assert.equal(await store.teamForUser("survivor-50", shane), null);
  assert.deepEqual((await store.membersOf("survivor-50")).get("cori"), { userId: cori, username: "cori" });

  await store.unassignUser("survivor-50", "cori");
  assert.equal(await store.teamForUser("survivor-50", cori), null);
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
