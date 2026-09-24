import { bundledSeasons } from "@/data/archive";
import { createDefaultClient, createStore, type Store } from "./store";

// One store per server process. The bundled past seasons are inserted the first time the database is empty; an
// existing database gets them from the commissioner's "Add past seasons" button instead.
const g = globalThis as unknown as { __leagueStore?: Store };

export const store = (): Store => (g.__leagueStore ??= createStore(createDefaultClient(), bundledSeasons));
