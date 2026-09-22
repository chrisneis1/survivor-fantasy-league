// Commissioner session primitives. Pure (no framework imports) so they can be unit-tested.
// This is a placeholder for the guide's passwordless-email / OAuth sign-in: one shared passcode, one role.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

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

// ---------- member sessions ----------
// A member arrives through a personal invite link and gets a long-lived cookie naming their team. `k` is a prefix of the
// invite's hash, so issuing a new invite link revokes every session made with the old one.

export const MEMBER_TTL_MS = 180 * 24 * 60 * 60 * 1000;

export interface MemberSession {
  season: string;
  team: string;
  k: string;
}

export function signMember(secret: string, m: MemberSession, now = Date.now()): string {
  const body = b64(JSON.stringify({ role: "member", ...m, exp: now + MEMBER_TTL_MS }));
  return `${body}.${mac(secret, body)}`;
}

export function verifyMember(secret: string, token: string | undefined, now = Date.now()): MemberSession | null {
  if (!token) return null;
  const [body, sig, extra] = token.split(".");
  if (!body || !sig || extra !== undefined || !safeEqual(sig, mac(secret, body))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString());
    if (p.role !== "member" || typeof p.exp !== "number" || p.exp <= now) return null;
    if (typeof p.season !== "string" || typeof p.team !== "string" || typeof p.k !== "string") return null;
    return { season: p.season, team: p.team, k: p.k };
  } catch {
    return null;
  }
}
