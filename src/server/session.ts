// Commissioner session primitives. Pure (no framework imports) so they can be unit-tested.
// This is a placeholder for the guide's passwordless-email / OAuth sign-in: one shared passcode, one role.
import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

const b64 = (s: string) => Buffer.from(s).toString("base64url");
const mac = (secret: string, body: string) => createHmac("sha256", secret).update(body).digest("base64url");

const safeEqual = (a: string, b: string) => {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
};

export function signSession(secret: string, now = Date.now()): string {
  const body = b64(JSON.stringify({ role: "commissioner", exp: now + SESSION_TTL_MS }));
  return `${body}.${mac(secret, body)}`;
}

export function verifySession(secret: string, token: string | undefined, now = Date.now()): boolean {
  if (!token) return false;
  const [body, sig, extra] = token.split(".");
  if (!body || !sig || extra !== undefined) return false;
  if (!safeEqual(sig, mac(secret, body))) return false;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString());
    return p.role === "commissioner" && typeof p.exp === "number" && p.exp > now;
  } catch {
    return false;
  }
}

/** Constant-time passcode check. An empty expected passcode never matches. */
export const passcodeMatches = (input: string, expected: string | undefined) => !!expected && safeEqual(input, expected);

/** Locks sign-in after too many failures inside a window. In-memory: fine for one server, reset on restart. */
export function createLimiter(max = 5, windowMs = 15 * 60 * 1000) {
  const fails: number[] = [];
  const recent = (now: number) => {
    while (fails.length && fails[0] <= now - windowMs) fails.shift();
    return fails.length;
  };
  return {
    blocked: (now = Date.now()) => recent(now) >= max,
    fail: (now = Date.now()) => void fails.push(now),
    reset: () => void (fails.length = 0),
  };
}

// ---------- member passwords ----------
// scrypt, not the fast SHA-256 used for the admin passcode/invite hashes above: a member-chosen password has much
// lower entropy, so the hash needs to be deliberately slow to brute-force.

/** Sign-up, a password change and an admin reset all share this minimum. */
export const MIN_PASSWORD_LENGTH = 4;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, salt, expected.length);
  return timingSafeEqual(actual, expected);
}

// ---------- user sessions ----------
// One site-wide account, one cookie, independent of any season — which season(s) and team(s) it can act for is
// looked up separately (season_membership). `k` is the account's own session key, which changes whenever the
// password changes, so changing a password revokes every session signed in with the old one.

export const USER_TTL_MS = 180 * 24 * 60 * 60 * 1000;

export interface UserSession {
  userId: string;
  k: string;
}

export function signUserSession(secret: string, u: UserSession, now = Date.now()): string {
  const body = b64(JSON.stringify({ role: "user", ...u, exp: now + USER_TTL_MS }));
  return `${body}.${mac(secret, body)}`;
}

export function verifyUserSession(secret: string, token: string | undefined, now = Date.now()): UserSession | null {
  if (!token) return null;
  const [body, sig, extra] = token.split(".");
  if (!body || !sig || extra !== undefined || !safeEqual(sig, mac(secret, body))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString());
    if (p.role !== "user" || typeof p.exp !== "number" || p.exp <= now) return null;
    if (typeof p.userId !== "string" || typeof p.k !== "string") return null;
    return { userId: p.userId, k: p.k };
  } catch {
    return null;
  }
}
