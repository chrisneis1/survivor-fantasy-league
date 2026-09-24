import type { Tribe } from "@/domain/types";

/** A season's starting tribes and cast, researched ahead of the draft, that the commissioner can load in one step. */
export interface CastPreset {
  /** Where the tribes and cast came from, and anything unusual about them. */
  notes: string[];
  tribes: Tribe[];
  /** In tribe order; `tribe` is the tribe id. */
  castaways: { name: string; tribe: string }[];
}

export const castPresets: Record<string, CastPreset> = {
  // Survivor 51 premiered September 23, 2026: 21 castaways, two starting tribes. Lewis Kelly volunteered to start on
  // Exile Island and joined Toka, the tribe that lost the first immunity challenge, after its vote. Aaliyah Puglia
  // was voted out at that Tribal Council (Episode 1).
  "survivor-51": {
    notes: [
      "Savu (purple) and Toka (yellow), 10 castaways each at the start, plus Lewis, who began on Exile Island and joined Toka after Episode 1.",
      "Aaliyah (Toka) was voted out in Episode 1; mark it when scoring Episode 1 so she can't be drafted.",
    ],
    tribes: [
      { id: "savu", name: "Savu", color: "#7a4bc9" },
      { id: "toka", name: "Toka", color: "#e0b31f" },
    ],
    castaways: [
      { name: "Alexis", tribe: "savu" }, // Alexis Levine
      { name: "Ana", tribe: "savu" }, // Ana Sani
      { name: "Carter", tribe: "savu" },
      { name: "Cristian", tribe: "savu" }, // Cristian Chavez
      { name: "Eric", tribe: "savu" }, // Eric Macksoud
      { name: "Kristin", tribe: "savu" },
      { name: "Linnea", tribe: "savu" }, // Linnea Capobianco
      { name: "Ori", tribe: "savu" },
      { name: "Rob", tribe: "savu" },
      { name: "Sharonda", tribe: "savu" },
      { name: "Aaliyah", tribe: "toka" }, // Aaliyah Puglia
      { name: "Brady", tribe: "toka" }, // Brady Booker
      { name: "Devin", tribe: "toka" }, // Devin Way
      { name: "Jelly", tribe: "toka" },
      { name: "Jenna", tribe: "toka" }, // Jenna Doore
      { name: "Kilby", tribe: "toka" }, // Danny "Kilby" Kilby
      { name: "Maggie", tribe: "toka" },
      { name: "Mike", tribe: "toka" }, // Mike Pinsky
      { name: "Patt", tribe: "toka" }, // Patt Canaday
      { name: "Thien An", tribe: "toka" }, // Thien An Nguyen
      { name: "Lewis", tribe: "toka" }, // Lewis Kelly — started on Exile Island, joined Toka after Episode 1
    ],
  },
};
