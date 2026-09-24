import { defineConfig, devices } from "@playwright/test";
import { ADMIN_PASSCODE, DB_FILE, PORT, SESSION_SECRET } from "./tests/e2e/fixtures";

// Page smoke tests against the production build (run `npm run build` first). The web server seeds a throwaway
// SQLite file on every run, so tests start from the same state and never see real league data.
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [
    // Read-only page checks run on a phone and a desktop; the flows (which change data) run once, on a phone.
    { name: "phone", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } }, testMatch: /pages\.spec\.ts/ },
  ],
  webServer: {
    command: `npx tsx tests/e2e/seed.ts ${DB_FILE} && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/seasons`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      TURSO_DATABASE_URL: `file:${DB_FILE}`,
      TURSO_AUTH_TOKEN: "",
      COMMISSIONER_PASSCODE: ADMIN_PASSCODE,
      SESSION_SECRET,
    },
  },
});
