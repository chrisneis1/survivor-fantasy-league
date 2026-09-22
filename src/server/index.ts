import survivor50 from "@/data/seasons/survivor-50.json";
import type { Season } from "@/domain/types";
import { createDefaultClient, createStore, type Store } from "./store";

// One store per server process. The bundled reference season is inserted the first time the database is empty.
const g = globalThis as unknown as { __leagueStore?: Store };

export const store = (): Store => (g.__leagueStore ??= createStore(createDefaultClient(), [survivor50 as unknown as Season]));
