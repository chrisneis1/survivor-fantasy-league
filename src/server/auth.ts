import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { store } from "./index";
import { SESSION_TTL_MS, USER_TTL_MS, createLimiter, hashPassword, passcodeMatches, signSession, signUserSession, verifyPassword, verifySession, verifyUserSession } from "./session";

// ---------------------------------------------------------------------------------------------------------------
// Two ways to be an admin, and one way to be a commissioner:
//  1. The admin passcode login. It needs no account, so it is always reachable even if something is wrong with the
//     accounts system — it creates seasons, deletes seasons, and can flag any user account as admin.
//  2. A user account flagged isAdmin, granted by another admin. Ordinary site sign-in, same as everyone else.
//  3. A user account assigned to a team that holds the commissioner role for a season (Setup → Members, admin-only).
//     What they do is logged under their username, and they can run only the season(s) they hold the role for.
// A user account by itself (no admin flag, no commissioner role) can only act as whatever team it's assigned to,
// in whatever season(s) it's assigned to — assignment is what "signed in as a member" means.
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
  const u = await getUser();
  if (u?.isAdmin) return { kind: "admin", actor: `admin:${u.username}`, label: "Admin" };
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

/** The admin passcode, or a user account flagged isAdmin: creating seasons, deleting seasons, granting roles/admin. */
export async function requireAdmin(): Promise<Access> {
  if (await isAdminSession()) return { kind: "admin", actor: "admin", label: "Admin" };
  const u = await getUser();
  if (u?.isAdmin) return { kind: "admin", actor: `admin:${u.username}`, label: "Admin" };
  redirect("/admin/login");
}

export async function isAdmin(): Promise<boolean> {
  if (await isAdminSession()) return true;
  const u = await getUser();
  return !!u?.isAdmin;
}

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

// ---------- site-wide user accounts ----------

const USER_COOKIE = "league_user";
// One limiter per username: a lockout is personal, never shared across every account on the site.
const userLimiters = new Map<string, ReturnType<typeof createLimiter>>();
const userLimiterFor = (username: string) => {
  let l = userLimiters.get(username);
  if (!l) userLimiters.set(username, (l = createLimiter()));
  return l;
};

async function setUserCookie(userId: string, key: string) {
  (await cookies()).set(USER_COOKIE, signUserSession(secret(), { userId, k: key }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: USER_TTL_MS / 1000,
  });
}

/** Self-serve sign-up: creates the account and signs it straight in. It grants no season access on its own. */
export async function signUp(username: string, password: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const name = username.trim();
  if (!name) return { ok: false, error: "Choose a username." };
  if (password.length < 4) return { ok: false, error: "Passwords need to be at least 4 characters." };
  let id: string;
  try {
    id = await store().createUser(name, hashPassword(password));
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not create the account." };
  }
  const u = await store().userById(id);
  await setUserCookie(id, u!.key);
  return { ok: true };
}

export async function signInUser(username: string, password: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const name = username.trim();
  const limiter = userLimiterFor(name);
  if (limiter.blocked()) return { ok: false, error: "Too many attempts. Try again in a few minutes." };
  const found = await store().checkUserLogin(name, (hash) => verifyPassword(password, hash));
  if (!found) {
    limiter.fail();
    return { ok: false, error: "That username or password is not right." };
  }
  limiter.reset();
  await setUserCookie(found.userId, found.key);
  return { ok: true };
}

/** The signed-in account, or null. Checked against the live session key, so a changed password revokes old sessions. */
export async function getUser(): Promise<{ id: string; username: string; isAdmin: boolean } | null> {
  const s = verifyUserSession(secret(), (await cookies()).get(USER_COOKIE)?.value);
  if (!s) return null;
  const u = await store().userById(s.userId);
  return u && u.key === s.k ? { id: u.id, username: u.username, isAdmin: u.isAdmin } : null;
}

export async function signOutUser(): Promise<void> {
  (await cookies()).delete(USER_COOKIE);
}

/** The team the signed-in account occupies for this season, or null. This is what "signed in as a member" means. */
export async function getMember(seasonId: string): Promise<string | null> {
  const u = await getUser();
  return u ? store().teamForUser(seasonId, u.id) : null;
}
