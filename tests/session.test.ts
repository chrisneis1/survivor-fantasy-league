import { test } from "node:test";
import assert from "node:assert/strict";
import { createLimiter, hashPassword, passcodeMatches, SESSION_TTL_MS, signSession, verifyPassword, verifySession } from "../src/server/session";

const secret = "s".repeat(40);

test("a signed session verifies until it expires", () => {
  const t0 = 1_000_000;
  const token = signSession(secret, t0);
  assert.equal(verifySession(secret, token, t0 + 1000), true);
  assert.equal(verifySession(secret, token, t0 + SESSION_TTL_MS + 1), false);
});

test("tampered, foreign, malformed and missing tokens are rejected", () => {
  const token = signSession(secret);
  const [body, sig] = token.split(".");
  const forged = Buffer.from(JSON.stringify({ role: "commissioner", exp: Date.now() + 9e12 })).toString("base64url");
  assert.equal(verifySession(secret, `${forged}.${sig}`), false, "payload swapped, signature reused");
  assert.equal(verifySession(secret, `${body}.${sig}x`), false);
  assert.equal(verifySession("other-secret".repeat(4), token), false);
  assert.equal(verifySession(secret, `${body}.${sig}.extra`), false);
  assert.equal(verifySession(secret, "nonsense"), false);
  assert.equal(verifySession(secret, ""), false);
  assert.equal(verifySession(secret, undefined), false);
});

test("a hashed password verifies against the right password, rejects the wrong one, and never stores the password itself", () => {
  const stored = hashPassword("correct-horse");
  assert.equal(verifyPassword("correct-horse", stored), true);
  assert.equal(verifyPassword("wrong", stored), false);
  assert.doesNotMatch(stored, /correct-horse/);
  assert.notEqual(hashPassword("correct-horse"), stored, "a fresh salt makes every hash different, even for the same password");
});

test("passcode comparison rejects wrong, empty and unconfigured values", () => {
  assert.equal(passcodeMatches("right", "right"), true);
  assert.equal(passcodeMatches("wrong", "right"), false);
  assert.equal(passcodeMatches("", "right"), false);
  assert.equal(passcodeMatches("", ""), false);
  assert.equal(passcodeMatches("anything", undefined), false);
});

test("the limiter locks after repeated failures and recovers after the window", () => {
  const l = createLimiter(3, 1000);
  for (let i = 0; i < 3; i++) l.fail(100 + i);
  assert.equal(l.blocked(500), true);
  assert.equal(l.blocked(1200), false, "old failures age out");
  l.fail(2000);
  l.reset();
  assert.equal(l.blocked(2001), false);
});

import { MEMBER_TTL_MS, signMember, verifyMember } from "../src/server/session";

test("member sessions verify, expire and reject tampering or a commissioner token", () => {
  const m = { season: "s", team: "t", k: "abc" };
  const t0 = 5_000_000;
  const token = signMember(secret, m, t0);
  assert.deepEqual(verifyMember(secret, token, t0 + 1000), m);
  assert.equal(verifyMember(secret, token, t0 + MEMBER_TTL_MS + 1), null);
  assert.equal(verifyMember("x".repeat(40), token, t0 + 1), null);
  const [body, sig] = token.split(".");
  const forged = Buffer.from(JSON.stringify({ role: "member", season: "s", team: "other", k: "abc", exp: t0 + 9e12 })).toString("base64url");
  assert.equal(verifyMember(secret, `${forged}.${sig}`, t0 + 1), null);
  assert.equal(verifyMember(secret, `${body}.${sig}.x`, t0 + 1), null);
  assert.equal(verifyMember(secret, signSession(secret, t0), t0 + 1), null, "a commissioner token is not a member session");
  assert.equal(verifySession(secret, token, t0 + 1), false, "a member session is not a commissioner session");
});
