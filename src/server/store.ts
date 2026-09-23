// Persistence: one versioned document per season plus an append-only audit log.
// A write only succeeds if the caller saw the latest version (compare-and-swap inside a transaction),
// so two commissioners — or, in phase 4, two members grabbing the last ownership slot — cannot both win.
import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { createClient, type Client } from "@libsql/client";
import { migrateSeason } from "@/domain/migrate";
import type { AuditEvent, Season } from "@/domain/types";
import type { ScoringTemplate } from "@/domain/template";
import type { WagerEntry } from "@/domain/wager";

export class ConflictError extends Error {
  constructor() {
    super("Someone else changed this season while you were working. Reload the page and try again.");
  }
}

export interface AuditRow extends AuditEvent {
  id: number;
  at: string;
}

export interface Versioned {
  season: Season;
  version: number;
}

export function createStore(client: Client, seed: Season[] = []) {
  let ready: Promise<void> | null = null;

  const init = async () => {
    await client.batch(
      [
        `CREATE TABLE IF NOT EXISTS season_doc (
           id TEXT PRIMARY KEY, status TEXT NOT NULL, version INTEGER NOT NULL, doc TEXT NOT NULL, updated_at TEXT NOT NULL)`,
        `CREATE TABLE IF NOT EXISTS audit_event (
           id INTEGER PRIMARY KEY AUTOINCREMENT, season_id TEXT NOT NULL, actor TEXT NOT NULL, entity_type TEXT NOT NULL,
           entity_id TEXT NOT NULL, action TEXT NOT NULL, before_json TEXT, after_json TEXT, reason TEXT, created_at TEXT NOT NULL)`,
        `CREATE INDEX IF NOT EXISTS audit_by_season ON audit_event (season_id, id)`,
        // Who holds the commissioner role in a season (a member signed in with their username and password).
        `CREATE TABLE IF NOT EXISTS member_role (
           season_id TEXT NOT NULL, team_id TEXT NOT NULL, role TEXT NOT NULL, created_at TEXT NOT NULL,
           PRIMARY KEY (season_id, team_id, role))`,
        // Named scoring templates a new season can start from.
        `CREATE TABLE IF NOT EXISTS scoring_template (
           id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, doc TEXT NOT NULL, created_at TEXT NOT NULL)`,
        // Secret final-wager picks. Deliberately NOT part of the season document, so no season read can leak them.
        `CREATE TABLE IF NOT EXISTS wager_entry (
           season_id TEXT NOT NULL, team_id TEXT NOT NULL, castaway_id TEXT NOT NULL, stake INTEGER NOT NULL, updated_at TEXT NOT NULL,
           PRIMARY KEY (season_id, team_id))`,
        // A site-wide account: signs up once, independent of any season. Only a scrypt hash of the password is
        // stored; `session_key` changes whenever the password changes, revoking any signed-in device.
        `CREATE TABLE IF NOT EXISTS app_user (
           id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, is_admin INTEGER NOT NULL DEFAULT 0,
           session_key TEXT NOT NULL, created_at TEXT NOT NULL)`,
        // Which user currently occupies which team, in which season — set by the commissioner from Members. A user
        // holds at most one team per season; a team holds at most one user.
        `CREATE TABLE IF NOT EXISTS season_membership (
           season_id TEXT NOT NULL, team_id TEXT NOT NULL, user_id TEXT NOT NULL, created_at TEXT NOT NULL,
           PRIMARY KEY (season_id, team_id), UNIQUE (season_id, user_id))`,
      ],
      "write",
    );
    const { rows } = await client.execute("SELECT COUNT(*) AS n FROM season_doc");
    if (Number(rows[0].n) === 0) {
      for (const s of seed) await client.execute({ sql: "INSERT OR IGNORE INTO season_doc (id, status, version, doc, updated_at) VALUES (?, ?, 1, ?, ?)", args: [s.id, s.status, JSON.stringify(s), new Date().toISOString()] });
    }
  };
  const ensure = () => (ready ??= init());
  const begin = async () => {
    try {
      return await client.transaction("write");
    } catch (e) {
      throw asConflict(e);
    }
  };

  const parse = (row: Record<string, unknown>): Versioned => ({ season: migrateSeason(JSON.parse(String(row.doc)) as Season), version: Number(row.version) });

  return {
    async list(): Promise<Season[]> {
      await ensure();
      const { rows } = await client.execute("SELECT doc, version FROM season_doc ORDER BY updated_at, id");
      return rows.map((r) => parse(r).season);
    },

    async get(id: string): Promise<Versioned | null> {
      await ensure();
      const { rows } = await client.execute({ sql: "SELECT doc, version FROM season_doc WHERE id = ?", args: [id] });
      return rows[0] ? parse(rows[0]) : null;
    },

    /** Permanently removes a season and everything scoped to it (audit log, member logins, roles, wagers). */
    async deleteSeason(seasonId: string): Promise<void> {
      await ensure();
      const tx = await begin();
      try {
        for (const [table, col] of [
          ["season_doc", "id"],
          ["audit_event", "season_id"],
          ["season_membership", "season_id"],
          ["member_role", "season_id"],
          ["wager_entry", "season_id"],
        ] as const) {
          await tx.execute({ sql: `DELETE FROM ${table} WHERE ${col} = ?`, args: [seasonId] });
        }
        await tx.commit();
      } catch (e) {
        await tx.rollback();
        throw asConflict(e);
      } finally {
        tx.close();
      }
    },

    /** Insert a new season. Fails if the id is taken. */
    async create(season: Season, audit: AuditEvent[] = []): Promise<void> {
      await ensure();
      const tx = await begin();
      try {
        await tx.execute({ sql: "INSERT INTO season_doc (id, status, version, doc, updated_at) VALUES (?, ?, 1, ?, ?)", args: [season.id, season.status, JSON.stringify(season), new Date().toISOString()] });
        await writeAudit(tx, audit);
        await tx.commit();
      } catch (e) {
        await tx.rollback();
        throw asConflict(e);
      } finally {
        tx.close();
      }
    },

    /** Replace a season only if it is still at `expectedVersion`; the audit rows commit with it or not at all. */
    async save(season: Season, expectedVersion: number, audit: AuditEvent[] = []): Promise<number> {
      await ensure();
      const tx = await begin();
      try {
        const res = await tx.execute({
          sql: "UPDATE season_doc SET doc = ?, status = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?",
          args: [JSON.stringify(season), season.status, new Date().toISOString(), season.id, expectedVersion],
        });
        if (res.rowsAffected !== 1) throw new ConflictError();
        await writeAudit(tx, audit);
        await tx.commit();
        return expectedVersion + 1;
      } catch (e) {
        await tx.rollback();
        throw asConflict(e);
      } finally {
        tx.close();
      }
    },

    /** Gives or takes away the commissioner role for a team. Roles are assigned only through the admin login. */
    async setCommissioner(seasonId: string, teamId: string, on: boolean): Promise<void> {
      await ensure();
      if (on) {
        await client.execute({ sql: "INSERT OR IGNORE INTO member_role (season_id, team_id, role, created_at) VALUES (?, ?, 'COMMISSIONER', ?)", args: [seasonId, teamId, new Date().toISOString()] });
      } else {
        await client.execute({ sql: "DELETE FROM member_role WHERE season_id = ? AND team_id = ? AND role = 'COMMISSIONER'", args: [seasonId, teamId] });
      }
    },

    async commissioners(seasonId: string): Promise<Set<string>> {
      await ensure();
      const { rows } = await client.execute({ sql: "SELECT team_id FROM member_role WHERE season_id = ? AND role = 'COMMISSIONER'", args: [seasonId] });
      return new Set(rows.map((r) => String(r.team_id)));
    },

    async saveTemplate(id: string, name: string, tpl: ScoringTemplate): Promise<void> {
      await ensure();
      await client.execute({
        sql: "INSERT INTO scoring_template (id, name, doc, created_at) VALUES (?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET name = excluded.name, doc = excluded.doc",
        args: [id, name, JSON.stringify(tpl), new Date().toISOString()],
      });
    },

    async listTemplates(): Promise<{ id: string; name: string; rules: number; layout: ScoringTemplate["layout"] }[]> {
      await ensure();
      const { rows } = await client.execute("SELECT id, name, doc FROM scoring_template ORDER BY created_at, id");
      return rows.map((r) => {
        const t = JSON.parse(String(r.doc)) as ScoringTemplate;
        return { id: String(r.id), name: String(r.name), rules: t.rules.length, layout: t.layout };
      });
    },

    async getTemplate(id: string): Promise<ScoringTemplate | null> {
      await ensure();
      const { rows } = await client.execute({ sql: "SELECT doc FROM scoring_template WHERE id = ?", args: [id] });
      return rows[0] ? (JSON.parse(String(rows[0].doc)) as ScoringTemplate) : null;
    },

    async deleteTemplate(id: string): Promise<void> {
      await ensure();
      await client.execute({ sql: "DELETE FROM scoring_template WHERE id = ?", args: [id] });
    },

    // ---------- site-wide user accounts ----------

    /** Self-serve sign-up. Throws if the username is already taken. Returns the new user's id. */
    async createUser(username: string, passwordHash: string): Promise<string> {
      await ensure();
      const id = randomBytes(9).toString("base64url");
      const sessionKey = randomBytes(12).toString("base64url");
      try {
        await client.execute({
          sql: "INSERT INTO app_user (id, username, password_hash, is_admin, session_key, created_at) VALUES (?, ?, ?, 0, ?, ?)",
          args: [id, username, passwordHash, sessionKey, new Date().toISOString()],
        });
        return id;
      } catch (e) {
        if (/UNIQUE/i.test(String(e))) throw new Error("That username is already taken.");
        throw e;
      }
    },

    /** Checks a sign-in attempt. Returns the account and a session key, or null if the username/password don't match. */
    async checkUserLogin(username: string, verify: (hash: string) => boolean): Promise<{ userId: string; isAdmin: boolean; key: string } | null> {
      await ensure();
      const { rows } = await client.execute({ sql: "SELECT id, password_hash, is_admin, session_key FROM app_user WHERE username = ?", args: [username] });
      const row = rows[0];
      if (!row || !verify(String(row.password_hash))) return null;
      return { userId: String(row.id), isAdmin: !!Number(row.is_admin), key: String(row.session_key) };
    },

    /** The account behind a signed-in session cookie, or null if the account (or session) no longer exists/matches. */
    async userById(userId: string): Promise<{ id: string; username: string; isAdmin: boolean; key: string } | null> {
      await ensure();
      const { rows } = await client.execute({ sql: "SELECT id, username, is_admin, session_key FROM app_user WHERE id = ?", args: [userId] });
      const row = rows[0];
      return row ? { id: String(row.id), username: String(row.username), isAdmin: !!Number(row.is_admin), key: String(row.session_key) } : null;
    },

    /** Every account, for the site admin page and for the commissioner to assign to a team. */
    async listUsers(): Promise<{ id: string; username: string; isAdmin: boolean }[]> {
      await ensure();
      const { rows } = await client.execute("SELECT id, username, is_admin FROM app_user ORDER BY username");
      return rows.map((r) => ({ id: String(r.id), username: String(r.username), isAdmin: !!Number(r.is_admin) }));
    },

    async setUserAdmin(userId: string, on: boolean): Promise<void> {
      await ensure();
      await client.execute({ sql: "UPDATE app_user SET is_admin = ? WHERE id = ?", args: [on ? 1 : 0, userId] });
    },

    // ---------- season membership: which user occupies which team ----------

    /**
     * Assigns a user to a team for a season, replacing any earlier assignment for that team and freeing up any
     * other team the same user held in this season (a user runs at most one team per season).
     */
    async assignUser(seasonId: string, teamId: string, userId: string): Promise<void> {
      await ensure();
      const tx = await begin();
      try {
        await tx.execute({ sql: "DELETE FROM season_membership WHERE season_id = ? AND (team_id = ? OR user_id = ?)", args: [seasonId, teamId, userId] });
        await tx.execute({
          sql: "INSERT INTO season_membership (season_id, team_id, user_id, created_at) VALUES (?, ?, ?, ?)",
          args: [seasonId, teamId, userId, new Date().toISOString()],
        });
        await tx.commit();
      } catch (e) {
        await tx.rollback();
        throw asConflict(e);
      } finally {
        tx.close();
      }
    },

    async unassignUser(seasonId: string, teamId: string): Promise<void> {
      await ensure();
      await client.execute({ sql: "DELETE FROM season_membership WHERE season_id = ? AND team_id = ?", args: [seasonId, teamId] });
    },

    /** The team a user occupies in a season, or null. This is what "signed in as a member" means. */
    async teamForUser(seasonId: string, userId: string): Promise<string | null> {
      await ensure();
      const { rows } = await client.execute({ sql: "SELECT team_id FROM season_membership WHERE season_id = ? AND user_id = ?", args: [seasonId, userId] });
      return rows[0] ? String(rows[0].team_id) : null;
    },

    /** Every team's current occupant (username), for the Members page. */
    async membersOf(seasonId: string): Promise<Map<string, { userId: string; username: string }>> {
      await ensure();
      const { rows } = await client.execute({
        sql: "SELECT m.team_id, m.user_id, u.username FROM season_membership m JOIN app_user u ON u.id = m.user_id WHERE m.season_id = ?",
        args: [seasonId],
      });
      return new Map(rows.map((r) => [String(r.team_id), { userId: String(r.user_id), username: String(r.username) }]));
    },

    /**
     * Places or changes a team's secret wager. `guard` runs against the season as it is inside the transaction, so a wager
     * can never slip in after wagering is locked. The audit row records that the team placed one, never what it is.
     */
    async placeWager(seasonId: string, teamId: string, castawayId: string, stake: number, guard: (s: Season) => string | null): Promise<void> {
      await ensure();
      const tx = await begin();
      try {
        const { rows } = await tx.execute({ sql: "SELECT doc, version FROM season_doc WHERE id = ?", args: [seasonId] });
        if (!rows[0]) throw new Error("That season no longer exists.");
        const problem = guard(parse(rows[0]).season);
        if (problem) throw new Error(problem);
        await tx.execute({
          sql: "INSERT INTO wager_entry (season_id, team_id, castaway_id, stake, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (season_id, team_id) DO UPDATE SET castaway_id = excluded.castaway_id, stake = excluded.stake, updated_at = excluded.updated_at",
          args: [seasonId, teamId, castawayId, stake, new Date().toISOString()],
        });
        await writeAudit(tx, [{ seasonId, actor: `member:${teamId}`, entityType: "wager", entityId: teamId, action: "WAGER_PLACED" }]);
        await tx.commit();
      } catch (e) {
        await tx.rollback();
        throw asConflict(e);
      } finally {
        tx.close();
      }
    },

    /** A team's own wager, for that team's owner only. */
    async ownWager(seasonId: string, teamId: string): Promise<WagerEntry | null> {
      await ensure();
      const { rows } = await client.execute({ sql: "SELECT team_id, castaway_id, stake FROM wager_entry WHERE season_id = ? AND team_id = ?", args: [seasonId, teamId] });
      return rows[0] ? { team: String(rows[0].team_id), castaway: String(rows[0].castaway_id), stake: Number(rows[0].stake) } : null;
    },

    /** Which teams have placed a wager (never what it is). */
    async wagerPlacedBy(seasonId: string): Promise<Set<string>> {
      await ensure();
      const { rows } = await client.execute({ sql: "SELECT team_id FROM wager_entry WHERE season_id = ?", args: [seasonId] });
      return new Set(rows.map((r) => String(r.team_id)));
    },

    /** Every pick. Only the finalize step calls this: it is the reveal. */
    async revealWagers(seasonId: string): Promise<WagerEntry[]> {
      await ensure();
      const { rows } = await client.execute({ sql: "SELECT team_id, castaway_id, stake FROM wager_entry WHERE season_id = ?", args: [seasonId] });
      return rows.map((r) => ({ team: String(r.team_id), castaway: String(r.castaway_id), stake: Number(r.stake) }));
    },

    /** Log something that did not change the season document (for example issuing an invite link). */
    async logAudit(audit: AuditEvent[]): Promise<void> {
      await ensure();
      const tx = await begin();
      try {
        await writeAudit(tx, audit);
        await tx.commit();
      } catch (e) {
        await tx.rollback();
        throw asConflict(e);
      } finally {
        tx.close();
      }
    },

    async audit(seasonId: string, limit = 200): Promise<AuditRow[]> {
      await ensure();
      const { rows } = await client.execute({ sql: "SELECT * FROM audit_event WHERE season_id = ? ORDER BY id DESC LIMIT ?", args: [seasonId, limit] });
      return rows.map((r) => ({
        id: Number(r.id),
        seasonId: String(r.season_id),
        actor: String(r.actor),
        entityType: String(r.entity_type),
        entityId: String(r.entity_id),
        action: String(r.action),
        before: r.before_json ? JSON.parse(String(r.before_json)) : undefined,
        after: r.after_json ? JSON.parse(String(r.after_json)) : undefined,
        reason: r.reason ? String(r.reason) : undefined,
        at: String(r.created_at),
      }));
    },
  };
}

/** A writer that loses a lock race is a conflict like any other stale write: nothing was changed, retry. */
function asConflict(e: unknown): unknown {
  return (e as { code?: string })?.code === "SQLITE_BUSY" ? new ConflictError() : e;
}

async function writeAudit(tx: Awaited<ReturnType<Client["transaction"]>>, audit: AuditEvent[]) {
  for (const a of audit) {
    await tx.execute({
      sql: "INSERT INTO audit_event (season_id, actor, entity_type, entity_id, action, before_json, after_json, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      args: [a.seasonId, a.actor, a.entityType, a.entityId, a.action, a.before === undefined ? null : JSON.stringify(a.before), a.after === undefined ? null : JSON.stringify(a.after), a.reason ?? null, new Date().toISOString()],
    });
  }
}

export type Store = ReturnType<typeof createStore>;

export function createDefaultClient(): Client {
  if (!process.env.TURSO_DATABASE_URL) mkdirSync("data", { recursive: true });
  return createClient({ url: process.env.TURSO_DATABASE_URL ?? "file:data/league.db", authToken: process.env.TURSO_AUTH_TOKEN });
}
