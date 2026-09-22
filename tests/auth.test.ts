// The parts of auth.ts that don't need a request context (cookies()/redirect()); getAccess/requireAccess are
// exercised indirectly through the store's role tests and are otherwise Next.js request-scoped integration surface.
import { test } from "node:test";
import assert from "node:assert/strict";

const withEnv = async (vars: Record<string, string | undefined>, fn: () => Promise<void> | void) => {
  const prev = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  try {
    for (const [k, v] of Object.entries(vars)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
    delete require.cache[require.resolve("../src/server/auth")];
    await fn();
  } finally {
    for (const [k, v] of Object.entries(prev)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
    delete require.cache[require.resolve("../src/server/auth")];
  }
};

test("without COMMISSIONER_PASSCODE the password is the documented default", async () => {
  await withEnv({ COMMISSIONER_PASSCODE: undefined }, async () => {
    const { passcode, usingDefaultPasscode, DEFAULT_PASSCODE } = await import("../src/server/auth");
    assert.equal(DEFAULT_PASSCODE, "Password");
    assert.equal(passcode(), "Password");
    assert.equal(usingDefaultPasscode(), true);
  });
});

test("setting COMMISSIONER_PASSCODE replaces the default and clears the warning", async () => {
  await withEnv({ COMMISSIONER_PASSCODE: "correct-horse-battery-staple" }, async () => {
    const { passcode, usingDefaultPasscode } = await import("../src/server/auth");
    assert.equal(passcode(), "correct-horse-battery-staple");
    assert.equal(usingDefaultPasscode(), false);
  });
});

test("sessions only survive a restart when a long-enough SESSION_SECRET is configured", async () => {
  await withEnv({ SESSION_SECRET: undefined }, async () => {
    const { sessionsSurviveRestart } = await import("../src/server/auth");
    assert.equal(sessionsSurviveRestart(), false);
  });
  await withEnv({ SESSION_SECRET: "short" }, async () => {
    const { sessionsSurviveRestart } = await import("../src/server/auth");
    assert.equal(sessionsSurviveRestart(), false, "too short to trust");
  });
  await withEnv({ SESSION_SECRET: "s".repeat(32) }, async () => {
    const { sessionsSurviveRestart } = await import("../src/server/auth");
    assert.equal(sessionsSurviveRestart(), true);
  });
});
