/** +5 / −3 / 0 — the sign is always printed so color is never the only cue. */
export const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0");

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const episodeLabel = (season: { episodes: { number: number; phase: string }[] }, n: number) =>
  season.episodes.find((e) => e.number === n)?.phase === "finale" ? "Finale" : `Ep ${n}`;

export const seasonPath = (seasonId: string, path = "") => `/${seasonId}${path}`;

export const seasonStatusLabel = { SETUP: "Setting up", OPENING_SELECTION: "Draft live", ACTIVE: "In progress", ARCHIVED: "Final" } as const;

export const phaseLabel = { "pre-merge": "Pre-merge", "post-merge": "Post-merge", finale: "Finale" } as const;
