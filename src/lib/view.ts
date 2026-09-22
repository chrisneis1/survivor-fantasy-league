import type { Season, StatusEvent } from "@/domain/types";

const exitText: Record<StatusEvent["type"], string> = {
  VOTED_OUT: "Voted out",
  MEDICAL_EVACUATION: "Medically evacuated",
  QUIT: "Quit",
  OTHER_EXIT: "Removed",
};

export const exitLabel = (e: StatusEvent) => exitText[e.type];

export const castawayName = (season: Season, id: string) => season.castaways.find((c) => c.id === id)?.name ?? id;
export const teamOf = (season: Season, id: string) => season.teams.find((t) => t.id === id)!;
export const ruleName = (season: Season, key: string) => season.rules.find((r) => r.key === key)?.name ?? key;
