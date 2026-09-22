import type { Season } from "@/domain/types";
import { store } from "@/server";

// Seasons live in the database (seeded with the bundled reference season on first run).
export const allSeasons = (): Promise<Season[]> => store().list();

export const getSeason = async (id: string): Promise<Season | undefined> => (await store().get(id))?.season;

/** The season on the league landing page: the active or in-setup one, else the most recent archived one. */
export async function getCurrentSeason(): Promise<Season | undefined> {
  const seasons = await allSeasons();
  return seasons.find((s) => s.status === "ACTIVE") ?? seasons.find((s) => s.status !== "ARCHIVED") ?? seasons.at(-1);
}
