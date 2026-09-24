import s43 from "@/data/seasons/survivor-43.json";
import s44 from "@/data/seasons/survivor-44.json";
import s45 from "@/data/seasons/survivor-45.json";
import s46 from "@/data/seasons/survivor-46.json";
import s47 from "@/data/seasons/survivor-47.json";
import s48 from "@/data/seasons/survivor-48.json";
import s49 from "@/data/seasons/survivor-49.json";
import s50 from "@/data/seasons/survivor-50.json";
import type { Season } from "@/domain/types";

/** Every completed season bundled with the site, oldest first (see scripts/import-archive.mjs). */
export const bundledSeasons = [s43, s44, s45, s46, s47, s48, s49, s50] as unknown as Season[];
