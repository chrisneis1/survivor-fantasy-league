// Every public page renders its heading with no errors and no sideways scroll, on a phone and a desktop.
import { expect, test } from "@playwright/test";
import { expectNoHorizontalOverflow, watchErrors } from "./helpers";

const pages: { path: string; heading: string | RegExp; text?: string }[] = [
  { path: "/", heading: "Draft castaways." },
  { path: "/seasons", heading: "Seasons", text: "Champion" },
  { path: "/login", heading: "Sign in" },
  { path: "/signup", heading: "Create an account" },
  { path: "/admin/login", heading: "Sign in" },

  // An archived season with full history.
  { path: "/survivor-50", heading: "Leaderboard", text: "Points race" },
  { path: "/survivor-50?ep=3", heading: "Standings after Ep 3" },
  { path: "/survivor-50?view=wager", heading: "Final standings after wagers" },
  { path: "/survivor-50/this-week", heading: /After Ep \d+/, text: "Pick order" },
  { path: "/survivor-50/teams", heading: "Teams", text: "Sky Rizzi" },
  { path: "/survivor-50/teams/shane", heading: "Sky Rizzi", text: "Roster history" },
  { path: "/survivor-50/castaways", heading: "Castaways", text: "Aubry" },
  { path: "/survivor-50/castaways/kyle", heading: "Kyle", text: "Medically evacuated" },
  { path: "/survivor-50/episodes", heading: "Episodes", text: "Finale" },
  { path: "/survivor-50/episodes/1", heading: "Episode 1", text: "Team scores" },
  { path: "/survivor-50/episodes/14", heading: "Finale" },
  { path: "/survivor-50/rules", heading: "League rules", text: "Scoring" },

  // The Hall of Fame, and past seasons imported from the league's old spreadsheets.
  { path: "/hall-of-fame", heading: "Hall of Fame", text: "All-time table" },
  { path: "/hall-of-fame/shane", heading: "Shane", text: "Season by season" },
  { path: "/survivor-44", heading: "Leaderboard", text: "About this season's record" },
  { path: "/survivor-44/teams/shane", heading: "Back2Back", text: "Final roster" },
  { path: "/survivor-44/castaways", heading: "Castaways", text: "final rosters" },
  { path: "/survivor-43/castaways/owen", heading: "Owen", text: "Won fire-making" },
  { path: "/survivor-43/teams/jon", heading: "Jon's Team", text: "Swap cost 8 points" },
  { path: "/survivor-46?view=wager", heading: "Final standings after wagers", text: "Final adjustment" },
  { path: "/survivor-47/teams/christian", heading: "Blindsides & Beefcakes", text: "Voluntary swap: cost 2 points" },
  { path: "/survivor-48/this-week", heading: /After/ },
  { path: "/survivor-45/rules", heading: "League rules", text: "Survive Tribal Council" },

  // A season in progress with a pick window open.
  { path: "/demo-active", heading: "Standings after Ep 7" },
  { path: "/demo-active/this-week", heading: "After Ep 7", text: "Window open" },

  // A new season still in setup: designed empty states, never made-up numbers.
  { path: "/survivor-51", heading: "Leaderboard", text: "Standings will appear here after the commissioner publishes Episode 1." },
  { path: "/survivor-51/this-week", heading: "This Week", text: "No pick window yet" },
  { path: "/survivor-51/teams", heading: "Teams", text: "No teams yet" },
  { path: "/survivor-51/castaways", heading: "Castaways", text: "The cast hasn't been announced" },
  { path: "/survivor-51/episodes", heading: "Episodes", text: "Not scored yet" },
];

for (const p of pages) {
  test(`${p.path} renders`, async ({ page }) => {
    const errors = watchErrors(page);
    const res = await page.goto(p.path);
    expect(res?.status(), "HTTP status").toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(p.heading);
    if (p.text) await expect(page.getByText(p.text).first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
    expect(errors).toEqual([]);
  });
}

test("an unknown page shows the not-found screen", async ({ page }) => {
  const res = await page.goto("/no-such-season/teams");
  expect(res?.status()).toBe(404);
  await expect(page.getByText("Snuffed.")).toBeVisible();
});

test("the app icons and install manifest are served", async ({ request }) => {
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest.name).toBe("Survivor Fantasy League");
  expect(manifest.display).toBe("standalone");
  for (const icon of manifest.icons as { src: string }[]) expect((await request.get(icon.src)).status(), icon.src).toBe(200);
  expect((await request.get("/icon.svg")).status()).toBe(200);
  expect((await request.get("/apple-icon.png")).status()).toBe(200);
});
