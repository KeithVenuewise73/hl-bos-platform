import { normalizeDetails } from "./validation.ts";
import type { AthleteDetails, GenerationRequest, TemplateKey, Tone } from "./types.ts";

export const FULL: AthleteDetails = normalizeDetails({
  athleteName: "Jordan Reyes",
  sport: "Basketball",
  teamOrSchool: "Lincoln High Lions",
  jerseyNumber: "23",
  position: "Point Guard",
  classYearOrAgeGroup: "Class of 2027",
  achievements:
    "Scored 31 points against Central\n- Team captain\nAll-Conference second team",
  personalityNotes: "Quiet leader who lets the game do the talking. Loves music.",
  sponsorName: "Main Street Pizza",
  extraContext: "",
});

export const MINIMAL: AthleteDetails = normalizeDetails({
  athleteName: "Ava",
  sport: "Soccer",
  teamOrSchool: "Riverside FC",
});

export function request(
  details: AthleteDetails,
  template: TemplateKey = "game_day",
  tone: Tone = "aggressive",
): GenerationRequest {
  return {
    template,
    tone,
    outputTypes: ["hype_script", "short_social_post"],
    details,
    media: [{ kind: "image", label: "photo.jpg" }],
  };
}
