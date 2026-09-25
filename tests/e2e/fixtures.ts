// Shared by the seed script, the Playwright config and the specs. Test-only values: none of these exist outside the
// throwaway database in .e2e/.
export const PORT = 3100;
export const DB_FILE = ".e2e/league.db";
export const PLAYER = { username: "Tester", password: "e2e-player-pass" };
export const ADMIN_PASSCODE = "e2e-admin-passcode";
export const SESSION_SECRET = "e2e-session-secret-not-used-anywhere-else-0123456789";
export const SCORING_TOKEN = "e2e-auto-scoring-token";
