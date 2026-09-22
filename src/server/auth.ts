import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { store } from "./index";
import { MEMBER_TTL_MS, SESSION_TTL_MS, createLimiter, passcodeMatches, signMember, signSession, verifyMember, verifySession } from "./session";

// ---------------------------------------------------------------------------------------------------------------
// Two ways to be a commissioner:
//  1. The admin login (a password). It needs no account, so it is always reachable: it creates seasons and sets roles.
//  2. A member who has been given the commissioner role. They use their own personal link, so what they do is logged
//     under their name, and they can run the seasons they hold the role for. Only the admin login can change roles.
// ---------------------------------------------------------------------------------------------------------------

/** The password used when COMMISSIONER_PASSCODE is not set. Deliberately simple: set the variable before going public. */
export const DEFAULT_PASSCODE = "Password";
export const passcode = () => process.env.COMMISSIONER_PASSCODE || DEFAULT_PASSCODE;
export const usingDefaultPasscode = () => !process.env.COMMISSIONER_PASSCODE;

const envSecret = () => (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 32 ? process.env.SESSION_SECRET : null);
/** Whether sign-ins survive a server restart. Without SESSION_SECRET a random key is made per process, so they do not. */
export const sessionsSurviveRestart = () => envSecret() !== null;
const g = globalThis as unknown as { __sessionSecret?: string };
const secret = () => envSecret() ?? (g.__sessionSecret ??= randomBytes(32).toString("hex"));

const COOKIE = "league_session";
const limiter = createLimiter();

export type Access =
  | { kind: "admin"; actor: string; label: string }
  | { kind: "commissioner"; actor: string; label: string; team: string };

async function isAdminSession(): Promise<boolean> {
  return verifySession(secret(), (await cookies()).get(COOKIE)?.value);
}

/** What the visitor may do for a season: admin, a commissioner-role member, or nothing (null). */
export async function getAccess(seasonId?: string): Promise<Access | null> {
  if (await isAdminSession()) return { kind: "admin", actor: "admin", label: "Admin" };
  if (!seasonId) return null;
  const team = await getMember(seasonId);
  if (team && (await store().commissioners(seasonId)).has(team)) return { kind: "commissioner", actor: `commissioner:${team}`, label: "Commissioner", team };
  return null;
}

/** Authorization is enforced here, on the server, for every admin page and action — not by hiding buttons. */
export async function requireAccess(seasonId?: string): Promise<Access> {
  const a = await getAccess(seasonId);
  if (!a) redirect("/admin/login");
  return a;
}

/** Admin login only: creating seasons and setting roles. */
export async function requireAdmin(): Promise<Access> {
  if (!(await isAdminSession())) redirect("/admin/login");
  return { kind: "admin", actor: "admin", label: "Admin" };
}

export const isAdmin = isAdminSession;

export async function signIn(input: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (limiter.blocked()) return { ok: false, error: "Too many attempts. Try again in a few minutes." };
  if (!passcodeMatches(input, passcode())) {
    limiter.fail();
    return { ok: false, error: "That password is not right." };
  }
  limiter.reset();
  (await cookies()).set(COOKIE, signSession(secret()), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
  return { ok: true };
}

export async function signOut(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

// ---------- members ----------

// One cookie per season, so a member of two seasons is signed in to both.
const memberCookie = (seasonId: string) => `league_member_${seasonId.replace(/[^a-z0-9-]/gi, "")}`;

/** Turns a personal invite link into a member session cookie. Returns the season to send them to, or null if the link is not valid. */
export async function establishMember(token: string): Promise<{ seasonId: string } | null> {
  const invite = await store().findInvite(token);
  if (!invite) return null;
  (await cookies()).set(memberCookie(invite.seasonId), signMember(secret(), { season: invite.seasonId, team: invite.teamId, k: invite.key }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MEMBER_TTL_MS / 1000,
  });
  return { seasonId: invite.seasonId };
}

/** The team the visitor is signed in as for this season, or null. Checked against the live invite so a new link revokes old sessions. */
export async function getMember(seasonId: string): Promise<string | null> {
  const s = verifyMember(secret(), (await cookies()).get(memberCookie(seasonId))?.value);
  if (!s || s.season !== seasonId) return null;
  return (await store().inviteKey(seasonId, s.team)) === s.k ? s.team : null;
}

export async function signOutMember(seasonId: string): Promise<void> {
  (await cookies()).delete(memberCookie(seasonId));
}
